import { NextRequest, NextResponse } from 'next/server';
import { queryTable, updateRows, insertRows } from '@/../egdesk-helpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: caseId } = await params;
    const body = await request.json();
    const { titleBlock, bomItems, saveAsTemplate, templateName, isConditional } = body;

    // 1. 신뢰도 'LOW' 행 잔존 여부 서버 측 검증 (보안 및 무결성 보장)
    const hasLow = (bomItems || []).some((it: any) => it.confidence === 'LOW');
    if (hasLow) {
      return NextResponse.json(
        { error: '신뢰도 [낮음] 항목이 해결되지 않아 추출 결과를 승인할 수 없습니다.' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // 2. 도면 표제란(drawings) 업데이트
    if (titleBlock) {
      await updateRows('drawings', {
        filters: { quotation_case_id: caseId },
        updates: {
          drawing_no_normalized: titleBlock.drawingNo,
          drawing_name_normalized: titleBlock.partName,
          revision: titleBlock.revision,
          scale: titleBlock.scale,
          confidence_score: titleBlock.confidence === 'HIGH' ? 0.95 : 0.75,
          status: 'VERIFIED',
          updated_at: now
        }
      });
    }

    // 3. 정제된 BOM 아이템 반영 (normalized_bom_items 갱신/삽입)
    if (Array.isArray(bomItems) && bomItems.length > 0) {
      for (const item of bomItems) {
        if (item.id && !item.id.startsWith('new_')) {
          await updateRows('normalized_bom_items', {
            filters: { id: item.id },
            updates: {
              normalized_name: item.partName,
              spec_candidate: item.partNo,
              material_candidate: item.material,
              quantity: item.quantity,
              status: 'VERIFIED',
              updated_at: now
            }
          });
        }
      }
    }

    // 4. 견적 케이스 상태 전이: 추출검증대기 -> 단가검토중
    await updateRows('quotation_cases', {
      filters: { id: caseId },
      updates: {
        status: '단가검토중',
        quote_readiness: isConditional ? 'CONDITIONAL' : 'READY',
        updated_at: now
      }
    });

    return NextResponse.json({
      success: true,
      message: '도면 추출 결과 검증이 승인되어 단가검토 단계로 전이되었습니다.',
      nextUrl: `/cases/${caseId}`
    });
  } catch (err: any) {
    console.error('Extract verify API error:', err);
    return NextResponse.json({ error: err.message || '검증 승인 처리 실패' }, { status: 500 });
  }
}
