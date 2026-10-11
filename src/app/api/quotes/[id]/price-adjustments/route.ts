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
      company_name: qcRow?.company_name || compRow?.company_name || '고객사 미지정',
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

    // 3-1. 표준 품목 및 단가 대장(product_masters) 조회 (사내 기준 대장 매칭 검증)
    let masterRows: any[] = [];
    try {
      masterRows = (await db.prepare(`
        SELECT master_code, standard_name, category, specification, material, base_unit_price
        FROM product_masters
      `).all()) as any[];
    } catch (e) {
      console.warn('Failed to query product_masters in price-adjustments:', e);
    }
    const masterByName = new Map<string, any>();
    const masterByCode = new Map<string, any>();
    for (const m of masterRows) {
      if (m.standard_name) masterByName.set(m.standard_name.trim().toLowerCase(), m);
      if (m.master_code) masterByCode.set(m.master_code.trim().toLowerCase(), m);
    }

    // 4. 품목별 단가 출처 분석 및 사내 기준 대장 연동/수기 조정 데이터 합성
    const adjustments: any[] = [];
    let originalSubtotalSum = 0;
    let modifiedSubtotalSum = 0;
    let increasedCount = 0;
    let decreasedCount = 0;
    let masterMatchCount = 0;
    let manualCount = 0;

    for (const item of allItems) {
      const unitPrice = Number(item.unit_price) || 0;
      const qty = Number(item.quantity) || 1;
      const itemAmount = unitPrice * qty;

      const nameKey = (item.item_name || '').trim().toLowerCase();
      const codeKey = (item.master_code || '').trim().toLowerCase();
      const matchedMaster = (codeKey ? masterByCode.get(codeKey) : null) || (nameKey ? masterByName.get(nameKey) : null);
      const isMasterMatch = item.price_source === 'MASTER_MATCH' || item.price_source === 'PRICE_MASTER' || item.price_source === 'MASTER_STANDARD' || Boolean(matchedMaster);

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
      const isManualSource = ['MANUAL_PRICE', 'MANUAL_INPUT', 'USER_OVERRIDE', 'MANUAL'].includes(item.price_source);
      const hasPriceInRemark = item.remark && (item.remark.includes('단가') || item.remark.includes('수기') || item.remark.includes('수정'));

      if (isMasterMatch) {
        masterMatchCount++;
        beforePrice = beforePrice || unitPrice;
        const diffUnitPrice = unitPrice - beforePrice;
        originalSubtotalSum += beforePrice * qty;
        modifiedSubtotalSum += itemAmount;

        adjustments.push({
          id: item.id,
          item_no: item.item_no,
          item_name: item.item_name || '무제 부품',
          master_code: matchedMaster?.master_code || item.master_code || item.drawing_no || '-',
          specification: item.specification || matchedMaster?.specification || '-',
          material: item.material || matchedMaster?.material || '-',
          quantity: qty,
          unit: item.unit || 'EA',
          before_unit_price: beforePrice,
          after_unit_price: unitPrice,
          diff_unit_price: diffUnitPrice,
          diff_rate: beforePrice > 0 ? Math.round((diffUnitPrice / beforePrice) * 1000) / 10 : 0,
          total_diff_amount: diffUnitPrice * qty,
          after_amount: itemAmount,
          price_source: 'MASTER_MATCH',
          price_source_label: '사내 기준단가 대장 연동',
          remark: matchedMaster ? `원가 기준 관리 센터 표준 대장 [${matchedMaster.standard_name}] 연동` : (item.remark || '사내 기준단가 적용'),
          modified_by: '표준 품목 및 단가 대장',
          modified_at: item.created_at || quote.quote_date
        });
      } else if (Boolean(matchedLog) || isManualSource || hasPriceInRemark) {
        manualCount++;
        if (!hasLogBeforePrice) {
          const remarkMatch = (item.remark || '').match(/기존(?:가|단가)?\s*:\s*₩?([\d,]+)/);
          if (remarkMatch) {
            beforePrice = parseInt(remarkMatch[1].replace(/,/g, ''), 10) || 0;
          } else {
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
          price_source_label: '담당자 수기 조정',
          remark: item.remark || (matchedLog ? '단가검토 워크스페이스 직접 수정' : '수기 견적가 책정'),
          modified_by: matchedLog?.user_name || item.updated_by || '견적 분석 담당자',
          modified_at: matchedLog?.created_at || item.updated_at || item.created_at || quote.quote_date
        });
      } else {
        // AI 알고리즘 산출 품목
        originalSubtotalSum += unitPrice * qty;
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
          before_unit_price: unitPrice,
          after_unit_price: unitPrice,
          diff_unit_price: 0,
          diff_rate: 0,
          total_diff_amount: 0,
          after_amount: itemAmount,
          price_source: item.price_source || 'ESTIMATED',
          price_source_label: 'AI 알고리즘 산출',
          remark: item.remark || 'BOM 및 가공 공정 알고리즘 자동 산출',
          modified_by: 'CADON AI',
          modified_at: item.created_at || quote.quote_date
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
        master_match_count: masterMatchCount,
        modified_count: manualCount,
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
