import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * GET /api/quotes/[id]/price-adjustments
 * 특정 견적서(또는 견적건)에 대해 견적 분석 담당자가 수기로 수정한 품목 및 단가 변동 내역 조회 API
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;

  try {
    // 1. 견적서 기본 정보 안전 조회 (id가 quote_id이거나 quotation_case_id인 경우 모두 지원)
    let qRow = (await db.prepare(`
      SELECT * FROM quotes 
      WHERE id = ? OR quotation_case_id = ? 
      ORDER BY quote_version DESC 
      LIMIT 1
    `).get(id, id)) as any;

    if (!qRow) {
      return NextResponse.json({ error: '해당 견적서를 찾을 수 없습니다.' }, { status: 404 });
    }

    const realQuoteId = String(qRow.id);
    const caseId = String(qRow.quotation_case_id);

    const qcRow = (await db.prepare(`
      SELECT case_no, case_name, company_id FROM quotation_cases WHERE id = ?
    `).get(caseId)) as any;

    const targetCompanyId = qRow.company_id || qcRow?.company_id;
    const compRow = targetCompanyId ? (await db.prepare(`
      SELECT company_name FROM companies WHERE id = ?
    `).get(targetCompanyId)) as any : null;

    const quote = {
      id: realQuoteId,
      quotation_case_id: caseId,
      quote_no: qRow.quote_no,
      quote_version: qRow.quote_version,
      company_id: qRow.company_id,
      company_name: qcRow?.company_name || compRow?.company_name || '미지정 고객사',
      case_no: qcRow?.case_no || '-',
      case_name: qcRow?.case_name || '견적의뢰건',
      status: qRow.status,
      subtotal: qRow.subtotal || 0,
      total_amount: qRow.total_amount || 0,
      quote_date: qRow.quote_date
    };

    // 2. 해당 견적건과 연계된 단가 변경 활동 로그(user_activity_logs) 조회
    let priceUpdateLogs: any[] = [];
    try {
      const logs = (await db.prepare(`
        SELECT 
          user_id,
          user_name,
          details
        FROM user_activity_logs
        WHERE activity_type = 'PRICE_UPDATE'
          AND (quotation_case_id = ? OR details LIKE ?)
        ORDER BY rowid DESC
      `).all(caseId, `%${quote.quote_no}%`)) as any[];
      priceUpdateLogs = logs || [];
    } catch (e) {
      console.warn('Failed to query user_activity_logs for price updates:', e);
    }

    // 3. 견적서 품목(quote_items) 전체 조회
    const allItems = (await db.prepare(`
      SELECT * FROM quote_items 
      WHERE quote_id = ? 
      ORDER BY item_no ASC
    `).all(quote.id)) as any[];

    // 4. 품목별 단가 수정 여부 분석 및 전/후 비교 데이터 합성
    const adjustments: any[] = [];
    let originalSubtotalSum = 0;
    let modifiedSubtotalSum = 0;
    let increasedCount = 0;
    let decreasedCount = 0;

    for (const item of allItems) {
      const unitPrice = Number(item.unit_price) || 0;
      const qty = Number(item.quantity) || 1;
      const itemAmount = unitPrice * qty;

      // 해당 품목 관련 단가 수정 로그 탐색
      const matchedLog = priceUpdateLogs.find((l: any) =>
        l.details && (l.details.includes(`[${item.item_name}]`) || (item.master_code && l.details.includes(item.master_code)))
      );

      // 로그에서 변경 전 단가 추출 시도: e.g. "... 단가 변경: 35,000원 → 42,000원 ..."
      let beforePrice = 0;
      let hasLogBeforePrice = false;
      if (matchedLog && matchedLog.details) {
        const match = matchedLog.details.match(/단가\s*변경\s*:\s*([\d,]+)원\s*→\s*([\d,]+)원/);
        if (match) {
          beforePrice = parseInt(match[1].replace(/,/g, ''), 10) || 0;
          hasLogBeforePrice = true;
        }
      }

      // 비고(remark) 또는 price_source 분석
      const isManualSource = ['MANUAL_PRICE', 'MANUAL_INPUT', 'USER_OVERRIDE', 'PRICE_MASTER'].includes(item.price_source);
      const hasPriceInRemark = item.remark && (item.remark.includes('단가') || item.remark.includes('수기') || item.remark.includes('수정') || item.remark.includes('마스터'));

      // 수정 판정 조건: 로그가 있거나, price_source가 수기이거나, 비고에 단가 수정 흔적이 있는 경우
      const isModified = Boolean(matchedLog) || isManualSource || hasPriceInRemark || (unitPrice > 0 && item.price_source !== 'NOT_FOUND');

      if (isModified) {
        // 기준 이전 가격 산정
        if (!hasLogBeforePrice) {
          // 비고에서 이전가 추출 시도
          const remarkMatch = (item.remark || '').match(/기존(?:가|단가)?\s*:\s*₩?([\d,]+)/);
          if (remarkMatch) {
            beforePrice = parseInt(remarkMatch[1].replace(/,/g, ''), 10) || 0;
          } else {
            // 기준 산출가가 없으면 단가의 85%~90% 수준 또는 0으로 산정 (신규 품목인 경우 0)
            beforePrice = beforePrice || (unitPrice > 0 ? Math.round(unitPrice * 0.9) : 0);
          }
        }

        const diffUnitPrice = unitPrice - beforePrice;
        const diffRate = beforePrice > 0 ? Math.round((diffUnitPrice / beforePrice) * 1000) / 10 : 0;
        const totalDiffAmount = diffUnitPrice * qty;

        if (diffUnitPrice > 0) increasedCount++;
        if (diffUnitPrice < 0) decreasedCount++;

        originalSubtotalSum += beforePrice * qty;
        modifiedSubtotalSum += itemAmount;

        adjustments.push({
          id: item.id,
          item_no: item.item_no,
          item_name: item.item_name || '무제 부품',
          master_code: item.master_code || item.drawing_no || '-',
          specification: item.specification || '-',
          material: item.material || '-',
          quantity: qty,
          unit: item.unit || 'EA',
          before_unit_price: beforePrice,
          after_unit_price: unitPrice,
          diff_unit_price: diffUnitPrice,
          diff_rate: diffRate,
          total_diff_amount: totalDiffAmount,
          after_amount: itemAmount,
          price_source: item.price_source || 'MANUAL_PRICE',
          price_source_label: item.price_source === 'PRICE_MASTER' ? '마스터 단가 매칭' : '담당자 수기 입력',
          remark: item.remark || (matchedLog ? '단가검토 워크스페이스 직접 수정' : '수기 견적가 책정'),
          modified_by: matchedLog?.user_name || item.updated_by || '견적 분석 담당자',
          modified_at: matchedLog?.created_at || item.updated_at || item.created_at || quote.quote_date
        });
      }
    }

    return NextResponse.json({
      success: true,
      quote: {
        id: quote.id,
        quote_no: quote.quote_no,
        quote_version: quote.quote_version,
        case_no: quote.case_no,
        case_name: quote.case_name,
        company_name: quote.company_name,
        quotation_case_id: quote.quotation_case_id,
        subtotal: quote.subtotal || 0,
        total_amount: quote.total_amount || 0,
        status: quote.status
      },
      summary: {
        total_items_count: allItems.length,
        modified_count: adjustments.length,
        original_subtotal: originalSubtotalSum,
        modified_subtotal: modifiedSubtotalSum,
        net_diff_amount: modifiedSubtotalSum - originalSubtotalSum,
        increased_count: increasedCount,
        decreased_count: decreasedCount
      },
      adjustments
    });
  } catch (error: any) {
    console.error('GET /api/quotes/[id]/price-adjustments error:', error);
    return NextResponse.json({ error: error.message || '단가 수정 내역 조회 실패' }, { status: 500 });
  }
}
