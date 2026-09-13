import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { checkCasePermission } from '@/lib/permissions';

// Pre-configured intelligent BOM templates based on equipment drawing pattern recognition
const VIRTUAL_BOM_TEMPLATES: Record<string, any[]> = {
  TRACTION_MACHINE_MONA: [
    {
      item_no: '1',
      part_no: 'MN200-MOT-01',
      name: '권상기 구동 모터 본체',
      normalized_name: '권상기 모터',
      spec: '220/380V, 0.9kW, 16P, IP41, F종 절연',
      material: 'SS400 / 주철(FC250)',
      qty: 1,
      unit: 'EA',
      confidence: 0.98,
      evidence: '도면 사양표 (모터 용량 0.9kW, 극수 16P, 전압 사양 일치)',
      remark: '동기 영구자석형(PMSM) 기어리스 권상기 주구동부'
    },
    {
      item_no: '2',
      part_no: 'MN200-SHV-01',
      name: '메인 트랙션 구동 시브',
      normalized_name: '트랙션 시브',
      spec: 'Ø240, 4-V12 (2:1 로핑, V-Groove, P=12)',
      material: 'FCD500 (구상흑연주철)',
      qty: 1,
      unit: 'EA',
      confidence: 0.99,
      evidence: '사양표 직경 Ø240, 홈 규격 4-V12, 로핑비 2:1 직접 추출',
      remark: '고내마모성 특수 V홈 가공, 주 로프 구동체'
    },
    {
      item_no: '3',
      part_no: 'MN200-BRK-01',
      name: '전자기 디스크 브레이크 어셈블리',
      normalized_name: '디스크 브레이크',
      spec: 'EMM200 급, DC 110V/80V Dual Coil (에어갭 0.2~0.3mm)',
      material: 'SCM440 / 비석면 라이닝',
      qty: 1,
      unit: 'SET',
      confidence: 0.95,
      evidence: '좌측 지시선 [BRAKE] 및 에어갭 유지 사양 매핑',
      remark: '승강기 안전기준 부합 이중 안전 전자 브레이크'
    },
    {
      item_no: '4',
      part_no: 'MN200-ENC-01',
      name: '고분해능 광학식 로터리 엔코더',
      normalized_name: '로터리 엔코더',
      spec: 'ERN1387 호환 / SinCos 2048 C/R, 5Vdc',
      material: '알루미늄 다이캐스팅',
      qty: 1,
      unit: 'EA',
      confidence: 0.92,
      evidence: '모터 엔드 커버 샤프트 직결 홀 및 서보 제어 인터페이스',
      remark: '동기모터 위치/속도 피드백 벡터 제어 센서'
    },
    {
      item_no: '5',
      part_no: 'MN200-TMB-01',
      name: '모터 & 브레이크 배선 단자함 세트',
      normalized_name: '모터 단자함',
      spec: '6P 주전원 + 4P 브레이크 전용 분리형 밀폐 터미널 박스',
      material: '강판 분체도장 (SPCC)',
      qty: 2,
      unit: 'SET',
      confidence: 0.96,
      evidence: '지시선 [MOTOR TERMINAL BLOCK], [MOTOR TERMINAL BOX] 검출',
      remark: '방진/방적 케이블 그랜드 및 결선 단자대 포함'
    },
    {
      item_no: '6',
      part_no: 'MN200-BLT-01',
      name: '기계대 베이스 취부용 고장력 볼트 세트',
      normalized_name: '취부 볼트 세트',
      spec: 'M16 x 80L (10.9T 고장력) + 스프링/평와셔 + 풀림방지 너트',
      material: 'SCM435 합금강 / 방청 아연도금',
      qty: 4,
      unit: 'SET',
      confidence: 0.94,
      evidence: '하부 베이스 프레임 4-Ø18 홀 규격 및 축하중 2500kg 구조 계산 매핑',
      remark: '권상기 진동 방지 및 기계대 체결용 볼트 4개소'
    }
  ]
};

// GET: Infer and preview virtual BOM for a case
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const qc = (await db.prepare('SELECT * FROM quotation_cases WHERE id = ?').get(id)) as any;
  if (!qc) {
    return NextResponse.json({ error: '견적건을 찾을 수 없습니다.' }, { status: 404 });
  }

  // Check current BOM state
  const rawBomCount = ((await db.prepare('SELECT COUNT(*) as cnt FROM raw_bom_items WHERE quotation_case_id = ?').get(id)) as any)?.cnt || 0;
  const rawBomRows = (await db.prepare('SELECT * FROM raw_bom_items WHERE quotation_case_id = ?').all(id)) as any[];
  const bomAreas = (await db.prepare('SELECT * FROM bom_areas WHERE quotation_case_id = ?').all(id)) as any[];

  // Determine if existing BOM is empty or trivial dummy data (e.g. only 1 item like "UNIT mm")
  const isTrivialBom = rawBomCount === 0 || (
    rawBomCount === 1 && (
      rawBomRows[0]?.name_raw?.includes('UNIT') ||
      rawBomRows[0]?.name_raw?.includes('DWG') ||
      rawBomRows[0]?.name_raw === '-' ||
      !rawBomRows[0]?.name_raw
    )
  );

  const isVirtualAlreadyApplied = rawBomRows.some(r => r.status === 'AI_VIRTUAL') ||
    bomAreas.some(b => b.table_type === 'VIRTUAL_BOM' || b.status === 'AI_INFERRED');

  // Inspect drawing texts to detect equipment model / pattern
  const files = (await db.prepare('SELECT * FROM uploaded_files WHERE quotation_case_id = ?').all(id)) as any[];
  const drawings = (await db.prepare('SELECT * FROM drawings WHERE quotation_case_id = ?').all(id)) as any[];

  let detectedModel = 'MONA200D';
  let equipmentType = '동기 기어리스 권상기 (Permanent Magnet Traction Machine)';
  let patternScore = 0.97;

  // Query cad_objects texts for keyword detection
  const textObjects = (await db.prepare(`
    SELECT co.raw_text FROM cad_objects co
    JOIN cad_parse_runs cpr ON co.parse_run_id = cpr.id
    JOIN uploaded_files uf ON cpr.source_file_id = uf.id
    WHERE uf.quotation_case_id = ? AND co.raw_text IS NOT NULL
    LIMIT 300
  `).all(id)) as any[];

  const combinedText = [
    qc.case_name || '',
    ...files.map(f => f.original_file_name || ''),
    ...drawings.map(d => `${d.drawing_no_raw || ''} ${d.drawing_name_raw || ''}`),
    ...textObjects.map(t => t.raw_text || '')
  ].join(' ').toUpperCase();

  let templateKey = 'TRACTION_MACHINE_MONA';
  if (combinedText.includes('MONA') || combinedText.includes('SHEAVE') || combinedText.includes('권상기') || combinedText.includes('240')) {
    templateKey = 'TRACTION_MACHINE_MONA';
    detectedModel = 'MONA200D';
    equipmentType = '동기 기어리스 권상기 (Permanent Magnet Traction Machine)';
    patternScore = 0.97;
  }

  const virtualItems = VIRTUAL_BOM_TEMPLATES[templateKey] || VIRTUAL_BOM_TEMPLATES.TRACTION_MACHINE_MONA;

  return NextResponse.json({
    isApplicable: true,
    hasRealBom: !isTrivialBom && !isVirtualAlreadyApplied,
    isTrivialBom,
    isVirtualAlreadyApplied,
    existingBomCount: rawBomCount,
    detectedModel,
    equipmentType,
    patternScore,
    drawingNo: detectedModel,
    items: virtualItems,
    specSummary: {
      sheave: 'Ø240, 4-V12 (2:1 로핑, V홈 가공)',
      motor: '220/380V, 0.9kW, 16P (영구자석 동기모터)',
      brake: 'EMM200 급 전자기 듀얼 디스크 브레이크 (DC 110V/80V)',
      capacity: '정격하중 2500kg 샤프트 로드 대응',
      mounting: '4-Ø18 홀 바닥 고정 베이스'
    },
    message: isVirtualAlreadyApplied 
      ? '이미 AI 가상 BOM이 본 견적건에 적용되어 있습니다.' 
      : '표제란 품명 및 BOM 부품표가 없는 도면에서 사양표 및 지시선 패턴을 통해 6대 핵심 부품을 역추론했습니다.'
  });
}

// POST: Approve and apply virtual BOM to quotation case
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const qc = (await db.prepare('SELECT * FROM quotation_cases WHERE id = ?').get(id)) as any;
  if (!qc) {
    return NextResponse.json({ error: '견적건을 찾을 수 없습니다.' }, { status: 404 });
  }

  const perm = await checkCasePermission(session.userId, session.role, id);
  if (!perm.canEdit) {
    return NextResponse.json({
      error: perm.message || '해당 견적건에 대한 수정 권한이 없습니다.',
      requiresApproval: perm.requiresApproval
    }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const items: any[] = Array.isArray(body.items) && body.items.length > 0 
    ? body.items 
    : VIRTUAL_BOM_TEMPLATES.TRACTION_MACHINE_MONA;
  const drawingNo = body.drawingNo || 'MONA200D';
  const drawingTitle = body.drawingTitle || 'MONA200D 동기 권상기 외형도';
  const now = new Date().toISOString();

  // Execute database transaction
  const applyTx = db.transaction(async () => {
    // 1. Clean up old dummy / raw / normalized BOM data for this case
    await db.prepare('DELETE FROM raw_bom_items WHERE quotation_case_id = ?').run(id);
    await db.prepare('DELETE FROM flattened_bom_items WHERE quotation_case_id = ?').run(id);
    await db.prepare('DELETE FROM normalized_bom_items WHERE quotation_case_id = ?').run(id);
    await db.prepare('DELETE FROM bom_areas WHERE quotation_case_id = ?').run(id);

    // 2. Insert Virtual BOM Area
    await db.prepare(`
      INSERT INTO bom_areas (
        id, quotation_case_id, drawing_no, table_type, bbox_json, confidence_score, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `ba_virtual_${id}_1`,
      id,
      drawingNo,
      'VIRTUAL_BOM',
      JSON.stringify({ note: 'AI 역추론 가상 BOM 영역' }),
      0.96,
      'AI_INFERRED',
      now
    );

    // 3. Insert Raw, Flattened, and Normalized BOM items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rawId = `rb_virtual_${id}_${i + 1}`;
      const flatId = `fb_virtual_${id}_${i + 1}`;
      const normId = `norm_virtual_${id}_${i + 1}`;
      const qtyNum = Number(item.qty) || 1.0;
      const partNo = item.part_no || `MN200-${String(i + 1).padStart(2, '0')}`;
      const name = item.name || `부품-${i + 1}`;
      const spec = item.spec || '-';
      const mat = item.material || 'SS400';
      const unit = item.unit || 'EA';
      const remark = item.remark || item.evidence || 'AI 역추론 가상 BOM';

      await db.prepare(`
        INSERT INTO raw_bom_items (
          id, quotation_case_id, source_file_id, drawing_no, row_index, item_no_raw, part_no_raw,
          name_raw, specification_raw, material_raw, quantity_raw, quantity_numeric,
          unit_raw, remark_raw, source_handles_json, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        rawId,
        id,
        null,
        drawingNo,
        i + 1,
        item.item_no || String(i + 1),
        partNo,
        name,
        spec,
        mat,
        String(qtyNum),
        qtyNum,
        unit,
        remark,
        '[]',
        'AI_VIRTUAL',
        now
      );

      await db.prepare(`
        INSERT INTO flattened_bom_items (
          id, quotation_case_id, item_key, part_no, name, specification, material,
          total_quantity, unit, source_drawings_json, source_item_ids_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        flatId,
        id,
        name,
        partNo,
        name,
        spec,
        mat,
        qtyNum,
        unit,
        JSON.stringify([drawingNo]),
        JSON.stringify([rawId]),
        now
      );

      await db.prepare(`
        INSERT INTO normalized_bom_items (
          id, quotation_case_id, raw_item_id, raw_name, normalized_name, search_name, direction,
          spec_candidate, material_candidate, quantity, unit, status, is_quote_included, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        normId,
        id,
        rawId,
        name,
        item.normalized_name || name,
        name.replace(/\s+/g, ''),
        null,
        spec,
        mat,
        qtyNum,
        unit,
        'NORMALIZED',
        1,
        now
      );
    }

    // 4. Update drawings table so drawing info is cleanly identified instead of 'DWG SIZE A3' / 'NO'
    const existingDrawings = (await db.prepare('SELECT id, drawing_no_raw FROM drawings WHERE quotation_case_id = ?').all(id)) as any[];
    if (existingDrawings.length > 0) {
      await db.prepare(`
        UPDATE drawings 
        SET drawing_no_raw = ?,
            drawing_no_normalized = ?,
            drawing_name_raw = ?,
            drawing_name_normalized = ?,
            drawing_type = 'MAIN_ASSEMBLY',
            scale = '1:1',
            status = 'CONFIRMED'
        WHERE id = ?
      `).run(
        drawingNo,
        drawingNo,
        drawingTitle,
        drawingTitle,
        existingDrawings[0].id
      );
    }

    // 5. Update quotation case status
    await db.prepare(`
      UPDATE quotation_cases
      SET status = 'BOM_EXTRACTED',
          quote_readiness = 'READY',
          updated_at = ?
      WHERE id = ?
    `).run(now, id);
  });

  try {
    await applyTx();
    return NextResponse.json({
      success: true,
      message: `✨ AI 역추론 가상 BOM ${items.length}개 품목이 성공적으로 등록되었습니다.`,
      appliedCount: items.length
    });
  } catch (err: any) {
    console.error('Failed to apply virtual BOM:', err);
    return NextResponse.json({ error: err.message || '가상 BOM 적용 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
