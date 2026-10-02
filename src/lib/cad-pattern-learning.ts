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
    direction: 'BOTTOM_UP' | 'TOP_DOWN' | 'UNKNOWN';
    headers: string[];
    columns_count: number;
    sample_rows?: Array<{
      no: string;
      partName: string;
      spec: string;
      qty: string;
      material: string;
      remark: string;
    }>;
    detected_columns?: Record<string, { label: string; x: number }>;
  };
  raw_sample_texts: string[];
  sample_summary_text: string;
  approval_count: number;
  created_at: string;
  updated_at?: string;
}

/**
 * CAD 텍스트 엔티티 로드 헬퍼
 */
function loadRawTexts(caseId: string, primaryFileId?: string): Array<{ t: string; x: number; y: number; h?: number }> {
  const derivedDir = getStorageSubdir('derived');
  const localDerived = path.join(process.cwd(), 'storage', 'derived');
  
  const candidates = [
    path.join(derivedDir, `${caseId}__cad_texts.json`),
    path.join(localDerived, `${caseId}__cad_texts.json`),
    primaryFileId ? path.join(derivedDir, `${caseId}_${primaryFileId}__cad_texts.json`) : null,
    primaryFileId ? path.join(localDerived, `${caseId}_${primaryFileId}__cad_texts.json`) : null
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const textData = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (textData?.texts?.length > 0) return textData.texts;
      } catch {}
    }
  }
  return [];
}

/**
 * 도면 시트 중 표제란 키워드(고객사, 도면번호, 프로젝트 등) 밀도가 가장 높고 완성도 높은 대표 시트 자동 선별
 */
function findBestTitleBlockDrawing(drawings: any[], rawTexts: any[]): any {
  if (!drawings || drawings.length === 0) return null;
  if (drawings.length === 1) return drawings[0];

  let bestDwg = drawings[0];
  let maxHits = -1;

  for (const d of drawings) {
    let fb = { min_x: 0, min_y: 0, max_x: 0, max_y: 0 };
    try { fb = JSON.parse(d.frame_bbox_json || '{}'); } catch {}
    if (!fb.max_x) continue;

    const inSheet = rawTexts.filter(t => 
      t.x >= fb.min_x && t.x <= fb.max_x && t.y >= fb.min_y && t.y <= fb.max_y
    );
    const tbHits = inSheet.filter(t => 
      /CUSTOMER|고객사|발주처|PROJECT|TITLE|DWG|도번|품명|SCALE|REV/i.test(t.t)
    ).length;

    if (tbHits > maxHits && (inSheet.length <= 150 || maxHits === -1)) {
      maxHits = tbHits;
      bestDwg = d;
    }
  }

  return bestDwg;
}

const HEADER_BLACKLIST_SET = new Set([
  'CUSTOMER', 'CLIENT', 'BUYER', 'PROJECT', 'PROJECTNO', 'PROJECTNUMBER', 'PJTNO',
  'TITLE', 'DWGNO', 'DRAWINGNO', 'DESIGN', 'DESIGNED', 'CHECK', 'APPROVE',
  'SUBSCRIPE', 'REFNO', 'PAGE', 'SCALE', 'REV', 'REVISION',
  'DATE', 'PLOTDATE', 'DESCRIPTION', 'SPECIFICATION', 'QTY', 'MATERIAL', 'FINISH', 'REMARK'
]);

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

    // 3. storage/derived에서 파싱된 CAD 텍스트 엔티티 로드
    const rawTexts = loadRawTexts(caseId, drawings[0]?.source_file_id);

    // 표제란 키워드 완성도가 가장 높은 대표 시트 자동 선별
    const primaryDwg = findBestTitleBlockDrawing(drawings, rawTexts) || drawings[0];

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

        // 인접 값 텍스트 탐색 (헤더 라벨 제외)
        const valCands = tbTexts.filter(t => {
          if (t === labelObj) return false;
          const norm = t.t.trim().toUpperCase().replace(/[\s:._/-]/g, '');
          if (HEADER_BLACKLIST_SET.has(norm)) return false;
          return (
            Math.abs(t.x - labelObj.x) <= tbW * 0.4 &&
            Math.abs(t.y - labelObj.y) <= tbH * 0.3
          );
        });

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

    // 5. 2단계 BOM 부품 목록표 추출
    const bomResult = extractAndValidateBomTable(rawTexts);
    const uniqueBomHeaders = Object.keys(bomResult.detectedColumns).map(k => bomResult.detectedColumns[k]?.label || k);

    // 6. 3단계~5단계 도면 가공 규칙 및 특성 추출
    const notesResult = extractNotesAndMultiplierRules(rawTexts);
    const stockResult = extractStockAndMaterialMapping(rawTexts, bomResult.sampleRows);
    const machiningResult = extractMachiningFeatures(rawTexts);

    // 7. 시맨틱 RAG용 종합 요약문 생성 (sample_summary_text)
    const patternTitle = options.patternName || `[${companyName}] 표준 도면 표제란 및 BOM 양식`;
    const fieldSummary = detectedFields.map(f => `${f.key}:${f.value_sample || '-'}`).join(', ');
    const headerSummary = uniqueBomHeaders.join(' | ') || '기본 헤더';
    const noteSummary = notesResult.notes.join(' / ') || '일반 기계 가공 규격';
    const matSummary = stockResult.sampleMaterials.map(m => m.isNormalized ? `${m.raw}→${m.standard}` : m.standard).join(', ');
    const tolSummary = machiningResult.precisionTolerances.join(', ');

    const sampleSummaryText = [
      `[고객사: ${companyName}]`,
      `[패턴명: ${patternTitle}]`,
      `[도면번호 예시: ${primaryDwg.drawing_no_raw || '2503-021-0A00-000'}]`,
      `[표제란 구성: 가로 ${Math.round(tbW)}mm x 세로 ${Math.round(tbH)}mm, 필드(${fieldSummary})]`,
      `[BOM 테이블: 적층 ${bomResult.direction}, 헤더(${headerSummary}), 부품 ${bomResult.rowCount}건]`,
      `[가공 시방/주기란: ${noteSummary}]`,
      `[재질 정규화: ${matSummary || '표준 재질'}]`,
      `[정밀 공차/후처리: ${tolSummary || '일반 공차'}, ${machiningResult.surfaceTreatments.join(', ')}]`
    ].filter(Boolean).join(' ');

    const now = new Date().toISOString();
    const patternId = `pat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const titleBlockLayout = {
      relative_width: Math.round(tbW / frameW * 1000) / 1000,
      relative_height: Math.round(tbH / frameH * 1000) / 1000,
      fields: detectedFields
    };

    const bomLayout = {
      direction: bomResult.direction,
      headers: uniqueBomHeaders,
      columns_count: Math.max(uniqueBomHeaders.length, 5),
      sample_rows: bomResult.sampleRows,
      detected_columns: bomResult.detectedColumns
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

export interface BomValidationDetail {
  hasBomTable: boolean;
  bomScore: number;
  status: 'EXCELLENT' | 'GOOD' | 'WARNING' | 'NOT_FOUND';
  direction: 'BOTTOM_UP' | 'TOP_DOWN' | 'UNKNOWN';
  detectedColumns: Record<string, { label: string; x: number }>;
  missingEssentialColumns: string[];
  rowCount: number;
  sampleRows: Array<{
    no: string;
    partName: string;
    spec: string;
    qty: string;
    material: string;
    remark: string;
  }>;
  warningMessage?: string;
}

export interface NotesAndRulesDetail {
  notes: string[];
  setMultiplier: number;
  hasMirrorSymmetry: boolean;
  multiplierRule: string;
}

export interface StockAndMaterialDetail {
  sampleMaterials: Array<{
    raw: string;
    standard: string;
    group: string;
    isNormalized: boolean;
  }>;
  stockDimensionTypes: string[];
}

export interface MachiningFeaturesDetail {
  precisionTolerances: string[];
  surfaceTreatments: string[];
}

export interface DryRunValidationResult {
  success: boolean;
  error?: string;
  caseId: string;
  caseNo: string;
  companyName: string;
  drawingCount: number;
  primaryDrawingNo: string;
  step1_titleBlock: {
    qualityScore: number;
    status: 'EXCELLENT' | 'GOOD' | 'WARNING';
    bboxRatio: {
      relativeWidth: number;
      relativeHeight: number;
      isQuadrantBottom: boolean;
    };
    detectedFields: Record<string, { label: string; valueSample: string; confidence: number }>;
    fieldsFoundCount: number;
    antiBogusPassed: boolean;
  };
  step2_bomTable: BomValidationDetail;
  step3_notesAndRules: NotesAndRulesDetail;
  step4_stockAndMaterial: StockAndMaterialDetail;
  step5_machiningFeatures: MachiningFeaturesDetail;
  overlapCheck: {
    hasExistingPattern: boolean;
    existingPatternsCount: number;
    existingPatterns: Array<{ id: string; name: string; type: string; createdAt: string }>;
    conflictType: 'NONE' | 'DUPLICATE_COMPANY' | 'SIMILAR_LAYOUT' | 'CONTRADICTION';
    recommendation: string;
  };
  warnings: string[];
  errors: string[];
  isSafeToSave: boolean;
}

const BOM_COLUMN_ALIASES: Record<string, string[]> = {
  NO: ['NO', 'NO.', 'N0', 'N0.', 'ITEM', 'ITEM NO', '순번', '번호'],
  PART_NAME: ['DESCRIPTION', 'PART NAME', 'PART_NAME', 'NAME', '품명', '도면명', '부품명', 'ITEM NAME'],
  SPEC: ['SPECIFICATION', 'SPEC', 'DIMENSION', '규격', '치수', '사이즈'],
  QTY: ['QTY', "Q'TY", 'QUANTITY', '수량'],
  MATERIAL: ['MATERIAL', 'MATL', 'MAT', '재질', '재료'],
  REMARK: ['FINISH / REMARK', 'REMARK', 'FINISH', '비고', '후처리', '표면처리']
};

const COMMON_MATERIALS = /S45C|SM45C|SS400|SS41|SUS304|SUS316|AL6061|A6061|AL5052|SKD11|SKD61|SCM440|POM|MC|AC4B|BRASS|황동|우레탄|URETHANE|RUBBER/i;

/**
 * 2단계: BOM 부품 목록표(Table) 무결성 및 컬럼 누락 검증 엔진
 */
export function extractAndValidateBomTable(allTexts: Array<{ t: string; x: number; y: number; w?: number; h?: number }>): BomValidationDetail {
  if (!allTexts || allTexts.length === 0) {
    return {
      hasBomTable: false,
      bomScore: 0,
      status: 'NOT_FOUND',
      direction: 'UNKNOWN',
      detectedColumns: {},
      missingEssentialColumns: ['품명(DESCRIPTION)', '수량(Q\'TY)', '재질(MATERIAL)'],
      rowCount: 0,
      sampleRows: [],
      warningMessage: '도면 텍스트 엔티티가 없습니다.'
    };
  }

  const normalizeToken = (t: string) => (t || '').trim().toUpperCase().replace(/[\s:._'-]/g, '');

  const headerCandidates: Array<{ t: string; x: number; y: number; w?: number; colKey: string; norm: string }> = [];

  for (const t of allTexts) {
    const norm = normalizeToken(t.t);
    for (const [colKey, aliases] of Object.entries(BOM_COLUMN_ALIASES)) {
      if (aliases.some(a => normalizeToken(a) === norm)) {
        headerCandidates.push({ ...t, colKey, norm });
        break;
      }
    }
  }

  // 1. 헤더 토큰 Y좌표 군집화 (|y1 - y2| <= 3.0)
  const clusters: Array<{ y: number; x: number; items: typeof headerCandidates }> = [];
  for (const hc of headerCandidates) {
    const matchedCluster = clusters.find(c => Math.abs(c.y - hc.y) <= 3.0 && Math.abs(c.x - hc.x) <= 300);
    if (matchedCluster) {
      matchedCluster.items.push(hc);
      matchedCluster.y = matchedCluster.items.reduce((s, it) => s + it.y, 0) / matchedCluster.items.length;
    } else {
      clusters.push({ y: hc.y, x: hc.x, items: [hc] });
    }
  }

  const validClusters = clusters
    .map(c => {
      const colMap: Record<string, typeof headerCandidates[0]> = {};
      for (const it of c.items) {
        if (!colMap[it.colKey]) {
          colMap[it.colKey] = it;
        }
      }
      const uniqueColKeys = Object.keys(colMap);
      return { ...c, colMap, uniqueColCount: uniqueColKeys.length, uniqueCols: uniqueColKeys };
    })
    .filter(c => c.uniqueColCount >= 3)
    .sort((a, b) => b.uniqueColCount - a.uniqueColCount);

  if (validClusters.length === 0) {
    return {
      hasBomTable: false,
      bomScore: 0,
      status: 'NOT_FOUND',
      direction: 'UNKNOWN',
      detectedColumns: {},
      missingEssentialColumns: ['품명(DESCRIPTION)', '수량(Q\'TY)', '재질(MATERIAL)'],
      rowCount: 0,
      sampleRows: [],
      warningMessage: '도면 내에서 BOM 부품 목록표(Table) 헤더를 감지하지 못했습니다.'
    };
  }

  const bestCluster = validClusters[0];
  const allParsedRows: Array<Record<string, string>> = [];

  for (const cluster of validClusters) {
    const sortedCols = Object.entries(cluster.colMap)
      .map(([key, item]) => ({ key, x: item.x, label: item.t, w: item.w || 5 }))
      .sort((a, b) => a.x - b.x);

    const minX = sortedCols[0].x - 15;
    const maxX = sortedCols[sortedCols.length - 1].x + 30;
    const headerY = cluster.y;

    // 헤더 상단 40mm 범위 내 데이터 행 탐색
    const textsAbove = allTexts.filter(t => t.x >= minX && t.x <= maxX && t.y > headerY + 1.0 && t.y <= headerY + 40);
    
    // Y좌표 1.5mm 공차로 행 군집화
    const rowYMap = new Map<number, Array<{ t: string; x: number; y: number }>>();
    for (const t of textsAbove) {
      if (/^[A-Z]$/.test(t.t.trim()) && t.x > maxX - 10) continue;
      
      let matchedY: number | null = null;
      for (const y of Array.from(rowYMap.keys())) {
        if (Math.abs(y - t.y) <= 1.5) {
          matchedY = y;
          break;
        }
      }
      if (matchedY !== null) {
        rowYMap.get(matchedY)!.push(t);
      } else {
        rowYMap.set(t.y, [t]);
      }
    }

    for (const [, rowTexts] of Array.from(rowYMap.entries())) {
      const rowObj: Record<string, string> = {};
      for (const t of rowTexts) {
        let nearestCol: { key: string; x: number } | null = null;
        let minDist = 99999;
        for (const col of sortedCols) {
          const dist = Math.abs(t.x - col.x);
          if (dist < minDist && dist <= 20) {
            minDist = dist;
            nearestCol = col;
          }
        }
        if (nearestCol) {
          rowObj[nearestCol.key] = t.t.trim();
        }
      }

      if (rowObj.PART_NAME || (rowObj.MATERIAL && rowObj.QTY) || (rowObj.NO && rowObj.PART_NAME)) {
        allParsedRows.push(rowObj);
      }
    }
  }

  // 중복 제거 및 치수 노이즈 필터링
  const uniqueRows: Array<{ no: string; partName: string; spec: string; qty: string; material: string; remark: string }> = [];
  const seenKeys = new Set<string>();

  for (const r of allParsedRows) {
    const partName = r.PART_NAME || '-';
    const material = r.MATERIAL || '-';
    const no = r.NO || '-';

    // 괄호로 시작하는 치수 노이즈 제외
    if (/^[\(\[\d]/.test(partName) && !COMMON_MATERIALS.test(material)) {
      continue;
    }

    const k = `${no}_${partName}_${material}`;
    if (!seenKeys.has(k)) {
      seenKeys.add(k);
      uniqueRows.push({
        no,
        partName,
        spec: r.SPEC || '-',
        qty: r.QTY || '1',
        material,
        remark: r.REMARK || '-'
      });
    }
  }

  // 점수 산정
  let bomScore = 0;
  if (bestCluster.colMap['PART_NAME']) bomScore += 30;
  if (bestCluster.colMap['QTY']) bomScore += 25;
  if (bestCluster.colMap['MATERIAL']) bomScore += 20;
  if (bestCluster.colMap['NO']) bomScore += 15;
  if (bestCluster.colMap['REMARK']) bomScore += 10;

  const missing: string[] = [];
  if (!bestCluster.colMap['PART_NAME']) missing.push('품명(DESCRIPTION)');
  if (!bestCluster.colMap['QTY']) missing.push('수량(Q\'TY)');
  if (!bestCluster.colMap['MATERIAL']) missing.push('재질(MATERIAL)');

  const status: 'EXCELLENT' | 'GOOD' | 'WARNING' = bomScore >= 85 ? 'EXCELLENT' : (bomScore >= 60 ? 'GOOD' : 'WARNING');

  return {
    hasBomTable: true,
    bomScore,
    status,
    direction: 'BOTTOM_UP',
    detectedColumns: Object.fromEntries(
      Object.entries(bestCluster.colMap).map(([k, v]) => [k, { label: v.t, x: Math.round(v.x * 10) / 10 }])
    ),
    missingEssentialColumns: missing,
    rowCount: uniqueRows.length,
    sampleRows: uniqueRows.slice(0, 10)
  };
}

/**
 * 3단계: 특기 시방서(Notes) 및 수량 승수, 대칭 가공 룰 엔진
 */
export function extractNotesAndMultiplierRules(allTexts: Array<{ t: string }>): NotesAndRulesDetail {
  const notes: string[] = [];
  let setMultiplier = 1;
  let hasMirrorSymmetry = false;

  for (const t of allTexts) {
    const text = (t.t || '').trim();

    // 세트 수량 승수 감지 (예: 제작 수량 : 4 SET, 13 SET)
    const setMatch = text.match(/(?:제작\s*수량|수량|PROD(?:UCTION)?\s*QTY)?\s*[:=]?\s*(\d+)\s*(?:SET|세트|대)/i);
    if (setMatch) {
      const num = parseInt(setMatch[1], 10);
      if (num > setMultiplier && num <= 100) {
        setMultiplier = num;
      }
    }

    // 대칭 가공 (LH/RH, 좌우 대칭, Mirror) 감지
    if (/(?:대칭|좌우|MIRROR|LH\s*[\/\&]\s*RH|LH\s*,\s*RH)/i.test(text)) {
      hasMirrorSymmetry = true;
    }

    // 특기 시방서 및 공차 지침 추출
    if (/(?:일반\s*기계\s*가공\s*공차|지정하지\s*않은\s*[CR]|NOTE|주기|열처리|도금|가공\s*후)/i.test(text)) {
      const cleanNote = text.replace(/[*#]/g, '').trim();
      if (cleanNote.length >= 5 && !notes.includes(cleanNote)) {
        notes.push(cleanNote);
      }
    }
  }

  return {
    notes: notes.slice(0, 5),
    setMultiplier,
    hasMirrorSymmetry,
    multiplierRule: setMultiplier > 1 ? `단품 BOM 수량 x ${setMultiplier} SET 일괄 승수 적용` : '기본 단품 1 SET 기준'
  };
}

/**
 * 4단계: 원소재 규격 체적 계산 및 재질 정규화 매핑 엔진
 */
const MATERIAL_MAP = [
  { rawPattern: /^SM45C$/i, standard: 'S45C', group: '탄소강' },
  { rawPattern: /^SS41$/i, standard: 'SS400', group: '구조용강' },
  { rawPattern: /^AL6061-T6$/i, standard: 'AL6061', group: '알루미늄' },
  { rawPattern: /^A6061$/i, standard: 'AL6061', group: '알루미늄' },
  { rawPattern: /^AL5052-H32$/i, standard: 'AL5052', group: '알루미늄' },
  { rawPattern: /^SUS304-2B$/i, standard: 'SUS304', group: '스테인리스' },
  { rawPattern: /^MC\s*NYLON$/i, standard: 'POM/MC', group: '수지' },
  { rawPattern: /^GUR$/i, standard: 'UHMW-PE(GUR)', group: '수지' },
  { rawPattern: /^SCM440H?$/i, standard: 'SCM440', group: '합금강' },
  { rawPattern: /^SKD11$/i, standard: 'SKD11', group: '공구강' }
];

export function extractStockAndMaterialMapping(
  allTexts: Array<{ t: string }>,
  bomRows: Array<{ material?: string }>
): StockAndMaterialDetail {
  const rawSet = new Set<string>();
  for (const r of bomRows) {
    if (r.material && r.material !== '-') rawSet.add(r.material);
  }

  const sampleMaterials = Array.from(rawSet).map(rawMat => {
    for (const m of MATERIAL_MAP) {
      if (m.rawPattern.test(rawMat.trim())) {
        return { raw: rawMat, standard: m.standard, group: m.group, isNormalized: true };
      }
    }
    return { raw: rawMat, standard: rawMat.trim(), group: '기타/일반재질', isNormalized: false };
  });

  const stockTypes: string[] = [];
  const hasPlate = allTexts.some(t => /\b\d+T\b|\bT\d+\b|\d+\s*[xX*]\s*\d+\s*[xX*]\s*\d+/i.test(t.t));
  const hasRoundBar = allTexts.some(t => /[ØΦ]\s*\d+|\b\d+Ø\b/i.test(t.t));

  if (hasPlate) stockTypes.push('판재(Plate T x W x L)');
  if (hasRoundBar) stockTypes.push('환봉(Round Bar Ø x L)');
  if (stockTypes.length === 0) stockTypes.push('표준 블록 소재');

  return {
    sampleMaterials,
    stockDimensionTypes: stockTypes
  };
}

/**
 * 5단계: 가공 특성(정밀 공차, 열처리, 도금) 추출 엔진
 */
export function extractMachiningFeatures(allTexts: Array<{ t: string }>): MachiningFeaturesDetail {
  const tolerances = new Set<string>();
  const surfaceTreatments = new Set<string>();

  for (const t of allTexts) {
    const text = (t.t || '').trim();
    // 끼워맞춤 정밀 공차 (H7, g6, f6, ±0.01 등)
    const fitMatch = text.match(/\b([HhGgFfDdEePpMmNnSsUu][5-9])\b|([ØΦ]?\d+(?:\.\d+)?\s*[fgHh]\d)|([+-]\s*0\.0[1-5])/);
    if (fitMatch) {
      tolerances.add(fitMatch[0]);
    }

    // 표면처리 및 후처리
    if (/크롬\s*도금|경질\s*크롬|무전해\s*니켈|흑색\s*착색|흑착색|아노다이징|착색|도금/i.test(text)) {
      const match = text.match(/([^\n,.]*(?:크롬\s*도금|아노다이징|니켈|착색)[^\n,.]*)/);
      if (match) surfaceTreatments.add(match[1].trim());
    }
    // 열처리
    if (/HRC\s*\d+|열처리|고주파|QT|Q\.T/i.test(text)) {
      const match = text.match(/([^\n,.]*(?:HRC\s*\d+|열처리|고주파|Q\.?T)[^\n,.]*)/i);
      if (match) surfaceTreatments.add(match[1].trim());
    }
  }

  return {
    precisionTolerances: Array.from(tolerances).slice(0, 8),
    surfaceTreatments: Array.from(surfaceTreatments).slice(0, 8)
  };
}

/**
 * 1단계~5단계 도면 AI 패턴 종합 사전 검증(Dry-run) 및 결함 체크 엔진
 * 강제 저장 전에 표제란 구조, BOM 목록표, 시방서 룰, 소재 규격, 가공 특성, 중복 충돌을 사전에 검증하여 리포트 반환
 */
export async function dryRunTitleBlockValidation(caseId: string): Promise<DryRunValidationResult> {
  const warnings: string[] = [];
  const errors: string[] = [];

  const defaultStep2: BomValidationDetail = {
    hasBomTable: false,
    bomScore: 0,
    status: 'NOT_FOUND',
    direction: 'UNKNOWN',
    detectedColumns: {},
    missingEssentialColumns: ['품명', '수량', '재질'],
    rowCount: 0,
    sampleRows: []
  };

  const defaultStep3: NotesAndRulesDetail = {
    notes: [],
    setMultiplier: 1,
    hasMirrorSymmetry: false,
    multiplierRule: '기본 단품 1 SET 기준'
  };

  const defaultStep4: StockAndMaterialDetail = {
    sampleMaterials: [],
    stockDimensionTypes: []
  };

  const defaultStep5: MachiningFeaturesDetail = {
    precisionTolerances: [],
    surfaceTreatments: []
  };

  // 1. 견적 케이스 조회
  const caseRow = (await db.prepare(`
    SELECT qc.*, c.company_name as resolved_company_name 
    FROM quotation_cases qc
    LEFT JOIN companies c ON qc.company_id = c.id
    WHERE qc.id = ?
  `).get(caseId)) as any;

  if (!caseRow) {
    return {
      success: false,
      error: '견적 케이스를 찾을 수 없습니다.',
      caseId,
      caseNo: '-',
      companyName: '미지정',
      drawingCount: 0,
      primaryDrawingNo: '-',
      step1_titleBlock: {
        qualityScore: 0,
        status: 'WARNING',
        bboxRatio: { relativeWidth: 0, relativeHeight: 0, isQuadrantBottom: false },
        detectedFields: {},
        fieldsFoundCount: 0,
        antiBogusPassed: false
      },
      step2_bomTable: defaultStep2,
      step3_notesAndRules: defaultStep3,
      step4_stockAndMaterial: defaultStep4,
      step5_machiningFeatures: defaultStep5,
      overlapCheck: {
        hasExistingPattern: false,
        existingPatternsCount: 0,
        existingPatterns: [],
        conflictType: 'NONE',
        recommendation: '도면 데이터를 확인할 수 없습니다.'
      },
      warnings: [],
      errors: ['견적의뢰 건이 존재하지 않습니다.'],
      isSafeToSave: false
    };
  }

  // 2. 도면 시트 목록 조회
  const drawings = (await db.prepare(`
    SELECT * FROM drawings 
    WHERE quotation_case_id = ? 
    ORDER BY drawing_index ASC
  `).all(caseId)) as any[];

  if (!drawings || drawings.length === 0) {
    return {
      success: false,
      error: '분석된 도면 시트가 없습니다.',
      caseId,
      caseNo: caseRow.case_no,
      companyName: caseRow.resolved_company_name || '미지정',
      drawingCount: 0,
      primaryDrawingNo: '-',
      step1_titleBlock: {
        qualityScore: 0,
        status: 'WARNING',
        bboxRatio: { relativeWidth: 0, relativeHeight: 0, isQuadrantBottom: false },
        detectedFields: {},
        fieldsFoundCount: 0,
        antiBogusPassed: false
      },
      step2_bomTable: defaultStep2,
      step3_notesAndRules: defaultStep3,
      step4_stockAndMaterial: defaultStep4,
      step5_machiningFeatures: defaultStep5,
      overlapCheck: {
        hasExistingPattern: false,
        existingPatternsCount: 0,
        existingPatterns: [],
        conflictType: 'NONE',
        recommendation: '도면을 먼저 등록해주세요.'
      },
      warnings: [],
      errors: ['도면 파일(DWG/DXF)이 등록되지 않았습니다.'],
      isSafeToSave: false
    };
  }

  // 3. CAD 텍스트 엔티티 로드 및 표제란 완성도 최고 대표 시트 자동 선별
  const rawTexts = loadRawTexts(caseId, drawings[0]?.source_file_id);
  const primaryDwg = findBestTitleBlockDrawing(drawings, rawTexts) || drawings[0];

  // 4. 기하 도곽 및 표제란 BBox 검증
  let tbBBox = { min_x: 0, min_y: 0, max_x: 1000, max_y: 1000 };
  let frameBBox = { min_x: 0, min_y: 0, max_x: 1000, max_y: 1000 };

  try {
    if (primaryDwg.title_block_bbox_json) tbBBox = JSON.parse(primaryDwg.title_block_bbox_json);
    if (primaryDwg.frame_bbox_json) frameBBox = JSON.parse(primaryDwg.frame_bbox_json);
  } catch {}

  const frameW = Math.max(frameBBox.max_x - frameBBox.min_x, 100);
  const frameH = Math.max(frameBBox.max_y - frameBBox.min_y, 100);
  const tbW = Math.max(tbBBox.max_x - tbBBox.min_x, 50);
  const tbH = Math.max(tbBBox.max_y - tbBBox.min_y, 30);

  const relW = Math.round((tbW / frameW) * 100) / 100;
  const relH = Math.round((tbH / frameH) * 100) / 100;

  // 표제란 하단부 위치 확인 (대부분의 표준 도면은 하단 우측 배치)
  const isBottomQuadrant = (tbBBox.min_y - frameBBox.min_y) <= (frameH * 0.45);

  let bboxScore = 0;
  if (relW >= 0.10 && relW <= 0.55 && relH >= 0.04 && relH <= 0.40) {
    bboxScore = 25;
  } else {
    bboxScore = 15;
    warnings.push(`표제란 크기 비율(폭 ${Math.round(relW * 100)}%, 높이 ${Math.round(relH * 100)}%)이 일반적인 표준 범위를 벗어났습니다.`);
  }

  const tbTexts = rawTexts.filter(t => 
    t.x >= tbBBox.min_x - 10 && t.x <= tbBBox.max_x + 10 &&
    t.y >= tbBBox.min_y - 10 && t.y <= tbBBox.max_y + 10
  );

  const KEY_LABELS: Record<string, string[]> = {
    CUSTOMER: ['CUSTOMER', '고객사', '발주처', 'CLIENT', 'BUYER', '수요처', '수요가'],
    PROJECT_NO: ['PROJECT NO.', 'PROJECT NO', 'PJT NO', 'PROJECT', '프로젝트'],
    TITLE: ['TITLE', '도명', '품명', 'DESCRIPTION', '도면명'],
    DWG_NO: ['DWG NO.', 'DWG NO', '도번', 'DRAWING NO', '도면번호'],
    DESIGNER: ['DESIGN', 'DESIGNED', '설계', '작성', '도면작성'],
    DATE: ['DATE', '일자', '작성일', 'PLOT DATE'],
    SCALE: ['SCALE', '척도', '축척'],
    REV: ['REV', 'REV.', 'REVISION', '개정']
  };

  const detectedFields: Record<string, { label: string; valueSample: string; confidence: number }> = {};

  for (const [fieldKey, aliases] of Object.entries(KEY_LABELS)) {
    const labelObj = tbTexts.find(t => {
      const clean = t.t.trim().toUpperCase().replace(/[\s:._/-]/g, '');
      return aliases.some(a => a.replace(/[\s:._/-]/g, '').toUpperCase() === clean);
    });

    if (labelObj) {
      const valCands = tbTexts.filter(t => {
        if (t === labelObj) return false;
        const norm = t.t.trim().toUpperCase().replace(/[\s:._/-]/g, '');
        if (HEADER_BLACKLIST_SET.has(norm)) return false;
        return (
          Math.abs(t.x - labelObj.x) <= tbW * 0.4 &&
          Math.abs(t.y - labelObj.y) <= tbH * 0.3
        );
      });

      let valSample = '';
      if (valCands.length > 0) {
        valCands.sort((a, b) => 
          ((a.x - labelObj.x)**2 + (a.y - labelObj.y)**2) - 
          ((b.x - labelObj.x)**2 + (b.y - labelObj.y)**2)
        );
        valSample = valCands[0].t.trim();
      }

      detectedFields[fieldKey] = {
        label: labelObj.t.trim(),
        valueSample: valSample,
        confidence: valSample ? 95 : 60
      };
    }
  }

  // 5. Anti-Bogus 헤더 가드 검사 (AGENTS.md 표준)
  let antiBogusPassed = true;
  let customerScore = 0;
  const resolvedCompany = (caseRow.resolved_company_name || '').trim();
  const customerField = detectedFields['CUSTOMER'];

  const BLACKLIST = ['PROJECT NO', 'PROJECT NUMBER', 'DWG NO', 'DRAWING NO', 'CUSTOMER', 'TITLE', 'SCALE', 'REV', 'DESCRIPTION', 'SPECIFICATION'];
  if (customerField?.valueSample) {
    const cleanSample = customerField.valueSample.replace(/[\s:._/-]/g, '').toUpperCase();
    if (BLACKLIST.some(b => b.replace(/[\s:._/-]/g, '').toUpperCase() === cleanSample)) {
      antiBogusPassed = false;
      warnings.push(`고객사명 자리에 표제란 헤더('${customerField.valueSample}')가 감지되어 차단되었습니다.`);
    }
  }

  if (resolvedCompany && resolvedCompany !== '고객사 미지정' && resolvedCompany !== '미지정 고객사' && resolvedCompany !== 'comp_unassigned') {
    customerScore = antiBogusPassed ? 25 : 10;
  } else {
    warnings.push('고객사가 미지정 상태입니다. 도면 AI 패턴 등록 전 고객사를 지정하는 것을 권장합니다.');
    customerScore = 5;
  }

  // 대표 도면번호 점수
  let dwgNoScore = 0;
  if (detectedFields['DWG_NO']?.valueSample || primaryDwg.drawing_no_normalized) {
    dwgNoScore = 20;
  } else {
    warnings.push('도면번호(DWG NO) 필드가 명확하게 추출되지 않았습니다.');
    dwgNoScore = 5;
  }

  // 타이틀/건명 점수
  let titleScore = 0;
  if (detectedFields['TITLE']?.valueSample || caseRow.case_name) {
    titleScore = 15;
  }

  // 척도 및 리비전 점수
  let scaleRevScore = 0;
  if (detectedFields['SCALE'] || detectedFields['REV']) {
    scaleRevScore = 15;
  }

  const qualityScore = Math.min(100, bboxScore + customerScore + dwgNoScore + titleScore + scaleRevScore);
  const status: 'EXCELLENT' | 'GOOD' | 'WARNING' = 
    qualityScore >= 80 ? 'EXCELLENT' : (qualityScore >= 60 ? 'GOOD' : 'WARNING');

  // 6. 2단계~5단계 도면 지능 엔진 실행
  const step2_bomTable = extractAndValidateBomTable(rawTexts);
  const step3_notesAndRules = extractNotesAndMultiplierRules(rawTexts);
  const step4_stockAndMaterial = extractStockAndMaterialMapping(rawTexts, step2_bomTable.sampleRows);
  const step5_machiningFeatures = extractMachiningFeatures(rawTexts);

  if (!step2_bomTable.hasBomTable) {
    warnings.push('BOM 부품 목록표(Table) 헤더를 감지하지 못했습니다. (단품도 또는 비표준 양식)');
  } else if (step2_bomTable.missingEssentialColumns.length > 0) {
    warnings.push(`BOM 목록표에서 권장 컬럼(${step2_bomTable.missingEssentialColumns.join(', ')})이 누락되었습니다.`);
  }

  if (step3_notesAndRules.setMultiplier > 1) {
    warnings.push(`도면 주기에서 세트 수량 승수(${step3_notesAndRules.setMultiplier} SET)가 감지되었습니다.`);
  }

  // 7. 기존 패턴과의 중복 및 충돌 예측 검사
  const existingRows = (await db.prepare(`
    SELECT id, pattern_name, pattern_type, company_name, rowid
    FROM cad_drawing_patterns
    WHERE company_name = ?
  `).all(resolvedCompany || '미지정 고객사')) as any[];

  let conflictType: 'NONE' | 'DUPLICATE_COMPANY' | 'SIMILAR_LAYOUT' | 'CONTRADICTION' = 'NONE';
  let recommendation = '신규 패턴으로 안전하게 등록 가능합니다.';

  if (existingRows.length > 0) {
    conflictType = 'DUPLICATE_COMPANY';
    recommendation = `동일 업체(${resolvedCompany})의 기등록 패턴이 ${existingRows.length}건 존재합니다. 등록 시 기존 서식과 함께 복수 서식으로 학습되거나 업데이트됩니다.`;
  }

  const isSafeToSave = errors.length === 0 && qualityScore >= 50;

  return {
    success: true,
    caseId,
    caseNo: caseRow.case_no,
    companyName: resolvedCompany || '미지정 고객사',
    drawingCount: drawings.length,
    primaryDrawingNo: primaryDwg.drawing_no_normalized || primaryDwg.drawing_no_raw || '-',
    step1_titleBlock: {
      qualityScore,
      status,
      bboxRatio: {
        relativeWidth: relW,
        relativeHeight: relH,
        isQuadrantBottom: isBottomQuadrant
      },
      detectedFields,
      fieldsFoundCount: Object.keys(detectedFields).length,
      antiBogusPassed
    },
    step2_bomTable,
    step3_notesAndRules,
    step4_stockAndMaterial,
    step5_machiningFeatures,
    overlapCheck: {
      hasExistingPattern: existingRows.length > 0,
      existingPatternsCount: existingRows.length,
      existingPatterns: existingRows.map((r: any) => ({
        id: r.id,
        name: r.pattern_name,
        type: r.pattern_type,
        createdAt: r.created_at || '-'
      })),
      conflictType,
      recommendation
    },
    warnings,
    errors,
    isSafeToSave
  };
}

export const dryRunCadPatternValidation = dryRunTitleBlockValidation;

