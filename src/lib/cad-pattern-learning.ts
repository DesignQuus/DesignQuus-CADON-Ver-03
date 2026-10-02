import { db } from './db';
import fs from 'fs';
import path from 'path';
import { getStorageSubdir } from './storage';
import { callAiCallerTool, callUserDataTool } from '../../egdesk-helpers';

export interface LearnedCadPattern {
  id: string;
  company_id: string | null;
  company_name: string | null;
  pattern_name: string;
  pattern_type: string;
  source_case_id: string | null;
  source_drawing_no: string | null;
  title_block_layout: {
    relative_width: number;
    relative_height: number;
    fields: Array<{
      key: string;
      label_offset: { x: number; y: number };
      value_sample?: string;
      value_offset: { x: number; y: number };
    }>;
  };
  bom_layout: {
    direction: 'BOTTOM_UP' | 'TOP_DOWN';
    headers: string[];
    columns_count: number;
  };
  raw_sample_texts: string[];
  sample_summary_text: string;
  approval_count: number;
  created_at: string;
  updated_at?: string;
}

/**
 * 학습 대상 도면의 원본 텍스트 및 기하 구조를 분석하여 재사용 가능한 CAD 패턴으로 영구 저장
 */
export async function learnCadDrawingPattern(
  caseId: string,
  options: { patternName?: string; companyId?: string; companyName?: string } = {}
): Promise<{ success: boolean; pattern?: LearnedCadPattern; error?: string }> {
  try {
    // 1. 견적 케이스 및 고객사 정보 조회
    const caseRow = (await db.prepare(`
      SELECT qc.*, c.company_name as resolved_company_name 
      FROM quotation_cases qc
      LEFT JOIN companies c ON qc.company_id = c.id
      WHERE qc.id = ?
    `).get(caseId)) as any;

    if (!caseRow) {
      return { success: false, error: '견적 케이스를 찾을 수 없습니다.' };
    }

    const companyId = options.companyId || caseRow.company_id;
    let companyName = options.companyName || caseRow.resolved_company_name || '미지정 고객사';
    if (companyName === '고객사 미지정' || companyName === 'comp_unassigned') {
      companyName = '미지정 고객사';
    }

    // 2. 도면 메타데이터 조회 (1번 메인 조립도 우선)
    const drawings = (await db.prepare(`
      SELECT * FROM drawings 
      WHERE quotation_case_id = ? 
      ORDER BY drawing_index ASC
    `).all(caseId)) as any[];

    if (!drawings || drawings.length === 0) {
      return { success: false, error: '분석된 도면 시트가 없습니다.' };
    }

    const primaryDwg = drawings.find((d: any) => 
      d.drawing_type === 'MAIN_ASSEMBLY' || (d.drawing_no_raw && d.drawing_no_raw.endsWith('-000'))
    ) || drawings[0];

    // 3. storage/derived에서 파싱된 CAD 텍스트 엔티티 로드
    const derivedDir = getStorageSubdir('derived');
    const localDerived = path.join(process.cwd(), 'storage', 'derived');
    
    let textData: any = null;
    const candidates = [
      path.join(derivedDir, `${caseId}__cad_texts.json`),
      path.join(localDerived, `${caseId}__cad_texts.json`),
      path.join(derivedDir, `${caseId}_${primaryDwg.source_file_id}__cad_texts.json`),
      path.join(localDerived, `${caseId}_${primaryDwg.source_file_id}__cad_texts.json`)
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try {
          textData = JSON.parse(fs.readFileSync(p, 'utf-8'));
          if (textData?.texts?.length > 0) break;
        } catch {}
      }
    }

    const rawTexts: Array<{ t: string; x: number; y: number; h?: number }> = textData?.texts || [];

    // 4. 표제란 BBox 영역 내 텍스트 정밀 클러스터링
    let tbBBox = { min_x: 0, min_y: 0, max_x: 1000, max_y: 1000 };
    let frameBBox = { min_x: 0, min_y: 0, max_x: 1000, max_y: 1000 };

    try {
      if (primaryDwg.title_block_bbox_json) {
        tbBBox = JSON.parse(primaryDwg.title_block_bbox_json);
      }
      if (primaryDwg.frame_bbox_json) {
        frameBBox = JSON.parse(primaryDwg.frame_bbox_json);
      }
    } catch {}

    const frameW = Math.max(frameBBox.max_x - frameBBox.min_x, 100);
    const frameH = Math.max(frameBBox.max_y - frameBBox.min_y, 100);
    const tbW = Math.max(tbBBox.max_x - tbBBox.min_x, 50);
    const tbH = Math.max(tbBBox.max_y - tbBBox.min_y, 30);

    // 표제란 내부 텍스트 선별
    const tbTexts = rawTexts.filter(t => 
      t.x >= tbBBox.min_x - 10 && t.x <= tbBBox.max_x + 10 &&
      t.y >= tbBBox.min_y - 10 && t.y <= tbBBox.max_y + 10
    );

    // 주요 표제란 필드 상대 오프셋 추출
    const KEY_LABELS: Record<string, string[]> = {
      CUSTOMER: ['CUSTOMER', '고객사', '발주처', 'CLIENT', 'BUYER'],
      PROJECT_NO: ['PROJECT NO.', 'PROJECT NO', 'PJT NO', 'PROJECT'],
      TITLE: ['TITLE', '도명', '품명', 'DESCRIPTION'],
      DWG_NO: ['DWG NO.', 'DWG NO', '도번', 'DRAWING NO'],
      DESIGNER: ['DESIGN', 'DESIGNED', '설계', '작성'],
      DATE: ['DATE', '일자', '작성일', 'PLOT DATE'],
      SCALE: ['SCALE', '척도'],
      REV: ['REV', 'REV.', 'REVISION']
    };

    const detectedFields: Array<{
      key: string;
      label_offset: { x: number; y: number };
      value_sample?: string;
      value_offset: { x: number; y: number };
    }> = [];

    for (const [fieldKey, aliases] of Object.entries(KEY_LABELS)) {
      const labelObj = tbTexts.find(t => {
        const clean = t.t.trim().toUpperCase().replace(/[\s:._/-]/g, '');
        return aliases.some(a => a.replace(/[\s:._/-]/g, '').toUpperCase() === clean);
      });

      if (labelObj) {
        const lNormX = (labelObj.x - tbBBox.min_x) / tbW;
        const lNormY = (labelObj.y - tbBBox.min_y) / tbH;

        // 인접 값 텍스트 탐색 (동일 또는 인접 셀)
        const valCands = tbTexts.filter(t => 
          t !== labelObj &&
          Math.abs(t.x - labelObj.x) <= tbW * 0.4 &&
          Math.abs(t.y - labelObj.y) <= tbH * 0.3
        );

        let valSample = '';
        let valNormX = lNormX;
        let valNormY = lNormY;

        if (valCands.length > 0) {
          valCands.sort((a, b) => 
            ((a.x - labelObj.x)**2 + (a.y - labelObj.y)**2) - 
            ((b.x - labelObj.x)**2 + (b.y - labelObj.y)**2)
          );
          valSample = valCands[0].t.trim();
          valNormX = (valCands[0].x - tbBBox.min_x) / tbW;
          valNormY = (valCands[0].y - tbBBox.min_y) / tbH;
        }

        detectedFields.push({
          key: fieldKey,
          label_offset: { x: Math.round(lNormX * 1000) / 1000, y: Math.round(lNormY * 1000) / 1000 },
          value_sample: valSample || undefined,
          value_offset: { x: Math.round(valNormX * 1000) / 1000, y: Math.round(valNormY * 1000) / 1000 }
        });
      }
    }

    // 5. BOM 테이블 헤더 레이아웃 감지
    const BOM_HEADERS = ['NO', 'DESCRIPTION', 'SPECIFICATION', 'QTY', 'MATERIAL', 'REMARK', '품명', '규격', '수량', '재질', '비고'];
    const detectedBomHeaders = rawTexts
      .filter(t => BOM_HEADERS.some(h => t.t.trim().toUpperCase().replace(/[\s:._'-]/g, '') === h))
      .map(t => t.t.trim());

    const uniqueBomHeaders = Array.from(new Set(detectedBomHeaders));

    // 6. 대표 가공 지침/주기 텍스트 추출
    const noteTexts = rawTexts
      .filter(t => /공차|가공|열처리|연마|아노다이징|HrC|도금|C0\.|R0\.|SET|EA/i.test(t.t))
      .map(t => t.t.trim())
      .slice(0, 10);

    // 7. 시맨틱 RAG용 종합 요약문 생성 (sample_summary_text)
    const patternTitle = options.patternName || `[${companyName}] 표준 도면 표제란 및 BOM 양식`;
    const fieldSummary = detectedFields.map(f => `${f.key}:${f.value_sample || '-'}`).join(', ');
    const headerSummary = uniqueBomHeaders.join(' | ') || '기본 헤더';
    const noteSummary = noteTexts.join(' / ') || '일반 기계 가공 규격';

    const sampleSummaryText = [
      `[고객사: ${companyName}]`,
      `[패턴명: ${patternTitle}]`,
      `[도면번호 예시: ${primaryDwg.drawing_no_raw || '2503-021-0A00-000'}]`,
      `[표제란 구성: 가로 ${Math.round(tbW)}mm x 세로 ${Math.round(tbH)}mm, 필드(${fieldSummary})]`,
      `[BOM 테이블 헤더: ${headerSummary}]`,
      `[가공 시방/주기란: ${noteSummary}]`
    ].join(' ');

    const now = new Date().toISOString();
    const patternId = `pat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const titleBlockLayout = {
      relative_width: Math.round(tbW / frameW * 1000) / 1000,
      relative_height: Math.round(tbH / frameH * 1000) / 1000,
      fields: detectedFields
    };

    const bomLayout = {
      direction: 'BOTTOM_UP' as const,
      headers: uniqueBomHeaders,
      columns_count: Math.max(uniqueBomHeaders.length, 5)
    };

    // 8. cad_drawing_patterns 테이블에 저장 (동일 고객사/동일 패턴명 시 업데이트)
    const existing = (await db.prepare(`
      SELECT id, approval_count FROM cad_drawing_patterns 
      WHERE (company_id = ? OR company_name = ?) AND pattern_name = ?
    `).get(companyId, companyName, patternTitle)) as any;

    if (existing) {
      await db.prepare(`
        UPDATE cad_drawing_patterns SET
          title_block_layout_json = ?,
          bom_layout_json = ?,
          raw_sample_texts_json = ?,
          sample_summary_text = ?,
          approval_count = approval_count + 1,
          updated_at = ?
        WHERE id = ?
      `).run(
        JSON.stringify(titleBlockLayout),
        JSON.stringify(bomLayout),
        JSON.stringify(tbTexts.map(t => t.t).slice(0, 50)),
        sampleSummaryText,
        now,
        existing.id
      );
    } else {
      await db.prepare(`
        INSERT INTO cad_drawing_patterns (
          id, company_id, company_name, pattern_name, pattern_type,
          source_case_id, source_drawing_no, title_block_layout_json,
          bom_layout_json, raw_sample_texts_json, sample_summary_text,
          approval_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'CAD_FULL_PATTERN', ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        patternId,
        companyId,
        companyName,
        patternTitle,
        caseId,
        primaryDwg.drawing_no_raw || null,
        JSON.stringify(titleBlockLayout),
        JSON.stringify(bomLayout),
        JSON.stringify(tbTexts.map(t => t.t).slice(0, 50)),
        sampleSummaryText,
        now,
        now
      );
    }

    // 9. egdesk-user-data 벡터 임베딩 생성 시도 (비동기 논블로킹)
    try {
      callUserDataTool('user_data_embed_table_columns', {
        tableName: 'cad_drawing_patterns',
        columnNames: ['sample_summary_text']
      }).catch(err => {
        console.warn('[learnCadDrawingPattern] user_data_embed_table_columns background notice:', err?.message);
      });
    } catch {}

    const resultPattern: LearnedCadPattern = {
      id: existing ? existing.id : patternId,
      company_id: companyId,
      company_name: companyName,
      pattern_name: patternTitle,
      pattern_type: 'CAD_FULL_PATTERN',
      source_case_id: caseId,
      source_drawing_no: primaryDwg.drawing_no_raw || null,
      title_block_layout: titleBlockLayout,
      bom_layout: bomLayout,
      raw_sample_texts: tbTexts.map(t => t.t).slice(0, 50),
      sample_summary_text: sampleSummaryText,
      approval_count: existing ? existing.approval_count + 1 : 1,
      created_at: now
    };

    return {
      success: true,
      pattern: resultPattern
    };
  } catch (err: any) {
    console.error('[learnCadDrawingPattern] error:', err);
    return { success: false, error: err.message || '패턴 학습 중 오류가 발생했습니다.' };
  }
}

/**
 * 신규 도면 분석 시 기학습된 도면 패턴 중 가장 유사한 패턴을 RAG로 인출
 */
export async function findMatchingCadPattern(
  caseTexts: string[],
  companyHint?: string
): Promise<{ matched: boolean; pattern?: LearnedCadPattern; similarityScore: number }> {
  try {
    const patterns = (await db.prepare(`
      SELECT * FROM cad_drawing_patterns 
      ORDER BY approval_count DESC, created_at DESC
    `).all()) as any[];

    if (!patterns || patterns.length === 0) {
      return { matched: false, similarityScore: 0 };
    }

    const fullTextUpper = caseTexts.join(' ').toUpperCase();

    let bestPattern: any = null;
    let highestScore = 0;

    for (const pat of patterns) {
      let score = 0;

      // 1. 고객사명 직접 매칭 (가중치 40%)
      if (pat.company_name && pat.company_name !== '미지정 고객사') {
        const cNameUpper = pat.company_name.toUpperCase();
        if (fullTextUpper.includes(cNameUpper) || (companyHint && companyHint.toUpperCase().includes(cNameUpper))) {
          score += 0.40;
        }
      }

      // 2. 표제란 텍스트 스니펫 키워드 교집합 (가중치 35%)
      let sampleKeywords: string[] = [];
      try {
        sampleKeywords = JSON.parse(pat.raw_sample_texts_json || '[]');
      } catch {}

      if (sampleKeywords.length > 0) {
        const matchedKw = sampleKeywords.filter(kw => kw.length >= 2 && fullTextUpper.includes(kw.toUpperCase()));
        const kwRatio = matchedKw.length / Math.min(sampleKeywords.length, 20);
        score += Math.min(kwRatio, 1.0) * 0.35;
      }

      // 3. BOM 헤더 매칭 (가중치 25%)
      let bomHeaders: string[] = [];
      try {
        const bLayout = JSON.parse(pat.bom_layout_json || '{}');
        bomHeaders = bLayout.headers || [];
      } catch {}

      if (bomHeaders.length > 0) {
        const matchedHeaders = bomHeaders.filter(h => fullTextUpper.includes(h.toUpperCase()));
        const headerRatio = matchedHeaders.length / bomHeaders.length;
        score += Math.min(headerRatio, 1.0) * 0.25;
      }

      if (score > highestScore) {
        highestScore = score;
        bestPattern = pat;
      }
    }

    if (bestPattern && highestScore >= 0.50) {
      let tbLayout = { relative_width: 0.3, relative_height: 0.2, fields: [] };
      let bLayout = { direction: 'BOTTOM_UP' as const, headers: [], columns_count: 5 };
      try { tbLayout = JSON.parse(bestPattern.title_block_layout_json || '{}'); } catch {}
      try { bLayout = JSON.parse(bestPattern.bom_layout_json || '{}'); } catch {}

      return {
        matched: true,
        similarityScore: Math.round(highestScore * 100) / 100,
        pattern: {
          id: bestPattern.id,
          company_id: bestPattern.company_id,
          company_name: bestPattern.company_name,
          pattern_name: bestPattern.pattern_name,
          pattern_type: bestPattern.pattern_type,
          source_case_id: bestPattern.source_case_id,
          source_drawing_no: bestPattern.source_drawing_no,
          title_block_layout: tbLayout,
          bom_layout: bLayout,
          raw_sample_texts: [],
          sample_summary_text: bestPattern.sample_summary_text,
          approval_count: bestPattern.approval_count,
          created_at: bestPattern.created_at
        }
      };
    }

    return { matched: false, similarityScore: highestScore };
  } catch (err) {
    console.warn('[findMatchingCadPattern] search warning:', err);
    return { matched: false, similarityScore: 0 };
  }
}

/**
 * 학습된 모든 패턴 목록 조회
 */
export async function getLearnedCadPatterns(): Promise<LearnedCadPattern[]> {
  try {
    const rows = (await db.prepare(`
      SELECT * FROM cad_drawing_patterns 
      ORDER BY approval_count DESC, created_at DESC
    `).all()) as any[];

    return rows.map(r => {
      let tbLayout = { relative_width: 0.3, relative_height: 0.2, fields: [] };
      let bLayout = { direction: 'BOTTOM_UP' as const, headers: [], columns_count: 5 };
      let samples: string[] = [];
      try { tbLayout = JSON.parse(r.title_block_layout_json || '{}'); } catch {}
      try { bLayout = JSON.parse(r.bom_layout_json || '{}'); } catch {}
      try { samples = JSON.parse(r.raw_sample_texts_json || '[]'); } catch {}

      return {
        id: r.id,
        company_id: r.company_id,
        company_name: r.company_name,
        pattern_name: r.pattern_name,
        pattern_type: r.pattern_type || 'CAD_FULL_PATTERN',
        source_case_id: r.source_case_id,
        source_drawing_no: r.source_drawing_no,
        title_block_layout: tbLayout,
        bom_layout: bLayout,
        raw_sample_texts: samples,
        sample_summary_text: r.sample_summary_text,
        approval_count: r.approval_count || 1,
        created_at: r.created_at
      };
    });
  } catch (e) {
    console.error('[getLearnedCadPatterns] error:', e);
    return [];
  }
}
