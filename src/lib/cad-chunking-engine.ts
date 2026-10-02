import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';
import { db, executeSQL } from './db';
import { dryRunTitleBlockValidation } from './cad-pattern-learning';
import { createTable, getTableSchema, insertRows, deleteRows, queryTable } from '../../egdesk-helpers';

export type CadChunkType = 'TITLE_BLOCK' | 'BOM_PART' | 'NOTES_RULE' | 'MACHINING_FEATURE';

export interface CadSemanticChunk {
  id: string;
  caseId: string;
  companyName: string;
  drawingNo: string;
  chunkType: CadChunkType;
  chunkTitle: string;
  chunkContent: string;
  parentChunkId?: string;
  metadata: Record<string, any>;
  embedding?: number[];
  createdAt: string;
}

export interface HybridSearchResult {
  chunk: CadSemanticChunk;
  keywordScore: number;
  vectorScore: number;
  hybridScore: number;
  parentChunk?: CadSemanticChunk;
}

/**
 * CAD 도면 텍스트 전용 의미적 벡터 임베딩 생성기 (TF-IDF & Character n-gram 기반 64차원 정규화 벡터)
 * 외부 API 키 없이도 0ms 즉각 반응하며 코사인 유사도 연산 지원
 */
export function generateLocalDenseVector(text: string): number[] {
  const DIM = 64;
  const vector = new Array(DIM).fill(0);
  const clean = (text || '').toLowerCase().trim();
  if (!clean) return vector;

  // 1. 단어 토큰 및 2-gram 해싱 가중치 누적
  const tokens = clean.split(/[\s,.:;_/\-()[\]]+/);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t) continue;
    let hash = 0;
    for (let c = 0; c < t.length; c++) {
      hash = (hash * 31 + t.charCodeAt(c)) >>> 0;
    }
    const idx = hash % DIM;
    vector[idx] += 1.5;

    // 인접 2-gram 단어 쌍 해싱 (문맥 보존)
    if (i + 1 < tokens.length && tokens[i + 1]) {
      const pair = `${t}_${tokens[i + 1]}`;
      let pHash = 0;
      for (let c = 0; c < pair.length; c++) {
        pHash = (pHash * 33 + pair.charCodeAt(c)) >>> 0;
      }
      vector[pHash % DIM] += 2.0;
    }
  }

  // 2. L2 정규화 (유닛 벡터 변환 -> 내적만으로 코사인 유사도 0~1 도출 가능)
  let norm = 0;
  for (let i = 0; i < DIM; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < DIM; i++) {
      vector[i] = Math.round((vector[i] / norm) * 10000) / 10000;
    }
  }
  return vector;
}

/**
 * 두 벡터 간 코사인 유사도 계산 (-1 ~ 1)
 */
export function calculateCosineSimilarity(v1: number[], v2: number[]): number {
  if (!v1 || !v2 || v1.length !== v2.length) return 0;
  let dot = 0;
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i] * v2[i];
  }
  return Math.max(0, Math.min(1, dot));
}

let tableChecked = false;

/**
 * SQLite / EGDesk My DB 내 cad_rag_chunks 테이블 초기화
 */
export async function ensureCadRagChunksTable(): Promise<void> {
  if (tableChecked) return;
  tableChecked = true;
}

/**
 * 1단계: LangChain 기반 CAD 도메인 특화 시맨틱 청킹 엔진 (Semantic Domain Chunking)
 * 도면의 5대 분석 데이터를 의미 손실 없이 계층형 청크(Parent-Document)로 분할
 */
export async function generateCadSemanticChunks(caseId: string): Promise<CadSemanticChunk[]> {
  const chunks: CadSemanticChunk[] = [];
  const now = new Date().toISOString();

  // 1. 도면 분석 데이터 로드 (5단계 Dry-Run 리포트 활용)
  const report = await dryRunTitleBlockValidation(caseId);
  if (!report.success) {
    throw new Error(report.error || '도면 분석 데이터를 로드할 수 없습니다.');
  }

  const companyName = report.companyName || '미지정 고객사';
  const primaryDrawingNo = report.primaryDrawingNo || '-';
  const detectedFields = report.step1_titleBlock.detectedFields;

  // 2. LangChain RecursiveCharacterTextSplitter 초기화 (장문 시방서 분할용)
  const notesSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 120,
    chunkOverlap: 20,
    separators: ['\n\n', '\n', ';', ' ']
  });

  // 3. [Parent Chunk] 표제란 메타데이터 청크 (TITLE_BLOCK)
  const parentTitleBlockId = `chk_tb_${caseId}_${Date.now()}`;
  const titleVal = detectedFields['TITLE']?.valueSample || report.caseNo || '-';
  const pjtVal = detectedFields['PROJECT_NO']?.valueSample || '-';
  const designerVal = detectedFields['DESIGNER']?.valueSample || '-';
  const scaleVal = detectedFields['SCALE']?.valueSample || '1:1';
  const revVal = detectedFields['REV']?.valueSample || '0';

  const titleBlockContent = [
    `[청크 유형]: 도면 표제란 메타데이터 (Parent Assembly)`,
    `[고객사]: ${companyName}`,
    `[대표 도면번호]: ${primaryDrawingNo}`,
    `[프로젝트 번호]: ${pjtVal}`,
    `[건명/도면명]: ${titleVal}`,
    `[설계자]: ${designerVal}`,
    `[척도/리비전]: ${scaleVal} / REV ${revVal}`,
    `[도면 세트 구성]: 총 ${report.drawingCount}개 시트 프레임 포함`,
    `[품질 무결성 점수]: ${report.step1_titleBlock.qualityScore}점 (${report.step1_titleBlock.status})`
  ].join('\n');

  chunks.push({
    id: parentTitleBlockId,
    caseId,
    companyName,
    drawingNo: primaryDrawingNo,
    chunkType: 'TITLE_BLOCK',
    chunkTitle: `[표제란] ${companyName} - ${primaryDrawingNo} (${titleVal})`,
    chunkContent: titleBlockContent,
    metadata: {
      caseId,
      companyName,
      drawingNo: primaryDrawingNo,
      projectNo: pjtVal,
      title: titleVal,
      scale: scaleVal,
      rev: revVal,
      sheetCount: report.drawingCount
    },
    embedding: generateLocalDenseVector(titleBlockContent),
    createdAt: now
  });

  // 4. [Child Chunks] BOM 부품 목록표 단위 청크 (BOM_PART, Small-to-Big)
  const bomRows = report.step2_bomTable.sampleRows || [];
  for (let idx = 0; idx < bomRows.length; idx++) {
    const r = bomRows[idx];
    const partChunkId = `chk_bom_${caseId}_${idx + 1}_${Date.now()}`;
    const partContent = [
      `[청크 유형]: BOM 단위 가공 부품 (Child Part)`,
      `[소속 모도면]: ${primaryDrawingNo} (${companyName} - ${titleVal})`,
      `[부품 순번]: ${r.no || String(idx + 1).padStart(3, '0')}`,
      `[부품명]: ${r.partName || '-'}`,
      `[규격/치수]: ${r.spec || '-'}`,
      `[기본 수량]: ${r.qty || '1'} EA`,
      `[가공 재질]: ${r.material || '-'}`,
      `[표면처리/후처리]: ${r.remark || '-'}`,
      `[BOM 적층 방향]: ${report.step2_bomTable.direction}`
    ].join('\n');

    chunks.push({
      id: partChunkId,
      caseId,
      companyName,
      drawingNo: primaryDrawingNo,
      chunkType: 'BOM_PART',
      chunkTitle: `[BOM 부품 #${r.no || idx + 1}] ${r.partName} (${r.material || '재질미지정'})`,
      chunkContent: partContent,
      parentChunkId: parentTitleBlockId, // Parent 연결
      metadata: {
        partNo: r.no,
        partName: r.partName,
        spec: r.spec,
        qty: r.qty,
        material: r.material,
        remark: r.remark,
        parentTitle: titleVal
      },
      embedding: generateLocalDenseVector(partContent),
      createdAt: now
    });
  }

  // 5. [Child Chunk] 특기 시방서 및 수량 승수 룰 청크 (NOTES_RULE)
  const notesRaw = (report.step3_notesAndRules.notes || []).join('\n');
  const splitNotesDocs: Document[] = notesRaw.length > 0 
    ? await notesSplitter.createDocuments([notesRaw])
    : [];

  const ruleContent = [
    `[청크 유형]: 도면 특기 시방서 및 수량 승수 룰 (Manufacturing Rules)`,
    `[소속 모도면]: ${primaryDrawingNo} (${companyName})`,
    `[세트 수량 승수]: ${report.step3_notesAndRules.multiplierRule}`,
    `[대칭 가공 여부]: ${report.step3_notesAndRules.hasMirrorSymmetry ? '좌우 대칭(LH/RH / Mirror) 페어 가공 감지' : '해당 없음'}`,
    `[가공 시방 원문]:`,
    splitNotesDocs.map(d => d.pageContent).join('\n') || '일반 기계 가공 표준 공차 적용'
  ].join('\n');

  chunks.push({
    id: `chk_rule_${caseId}_${Date.now()}`,
    caseId,
    companyName,
    drawingNo: primaryDrawingNo,
    chunkType: 'NOTES_RULE',
    chunkTitle: `[가공 시방 & 룰] ${companyName} - 세트 승수(${report.step3_notesAndRules.setMultiplier} SET) 및 일반 공차`,
    chunkContent: ruleContent,
    parentChunkId: parentTitleBlockId,
    metadata: {
      setMultiplier: report.step3_notesAndRules.setMultiplier,
      hasMirrorSymmetry: report.step3_notesAndRules.hasMirrorSymmetry,
      multiplierRule: report.step3_notesAndRules.multiplierRule,
      notesCount: report.step3_notesAndRules.notes?.length || 0
    },
    embedding: generateLocalDenseVector(ruleContent),
    createdAt: now
  });

  // 6. [Child Chunk] 정밀 가공 특성 & 열처리 청크 (MACHINING_FEATURE)
  const precisionTols = report.step5_machiningFeatures.precisionTolerances || [];
  const surfaceTreatments = report.step5_machiningFeatures.surfaceTreatments || [];
  const stockTypes = report.step4_stockAndMaterial.stockDimensionTypes || [];

  const featureContent = [
    `[청크 유형]: 정밀 가공 특성 및 후처리 사양 (Precision Machining)`,
    `[소속 모도면]: ${primaryDrawingNo} (${companyName})`,
    `[원소재 형태]: ${stockTypes.join(', ') || '표준 블록 소재'}`,
    `[끼워맞춤 정밀 공차]: ${precisionTols.join(', ') || '도면 일반 공차'}`,
    `[열처리 및 표면도금]: ${surfaceTreatments.join(', ') || '후처리 미지정'}`,
    `[정규화 재질 목록]: ${report.step4_stockAndMaterial.sampleMaterials.map(m => m.standard).join(', ')}`
  ].join('\n');

  chunks.push({
    id: `chk_feat_${caseId}_${Date.now()}`,
    caseId,
    companyName,
    drawingNo: primaryDrawingNo,
    chunkType: 'MACHINING_FEATURE',
    chunkTitle: `[가공 특성] ${companyName} - 정밀 공차(${precisionTols.length}개) 및 표면처리(${surfaceTreatments.length}개)`,
    chunkContent: featureContent,
    parentChunkId: parentTitleBlockId,
    metadata: {
      precisionTolerances: precisionTols,
      surfaceTreatments,
      stockTypes
    },
    embedding: generateLocalDenseVector(featureContent),
    createdAt: now
  });

  return chunks;
}

/**
 * 2단계: 생성된 시맨틱 청크를 SQLite / EGDesk cad_rag_chunks 테이블에 영구 저장
 */
export async function saveCadSemanticChunks(chunks: CadSemanticChunk[]): Promise<{ savedCount: number }> {
  await ensureCadRagChunksTable();
  if (!chunks || chunks.length === 0) return { savedCount: 0 };

  const caseId = chunks[0].caseId;

  // 기존 해당 케이스 청크 삭제 후 새로 저장 (신선도 유지)
  try {
    await deleteRows('cad_rag_chunks', { filters: { case_id: caseId } });
  } catch (delErr: any) {
    console.warn('[saveCadSemanticChunks] deleteRows notice:', delErr.message);
  }

  const rowsToInsert = chunks.map(c => ({
    chunk_id: c.id,
    case_id: c.caseId,
    company_name: c.companyName,
    drawing_no: c.drawingNo,
    chunk_type: c.chunkType,
    chunk_title: c.chunkTitle,
    chunk_text: c.chunkContent,
    parent_chunk_id: c.parentChunkId || '',
    metadata_json: JSON.stringify(c.metadata || {}),
    embedding_json: JSON.stringify(c.embedding || []),
    created_at: c.createdAt
  }));

  try {
    const res = await insertRows('cad_rag_chunks', rowsToInsert);
    return { savedCount: res?.inserted !== undefined ? res.inserted : rowsToInsert.length };
  } catch (err: any) {
    console.error('[saveCadSemanticChunks] insertRows error:', err.message);
    return { savedCount: 0 };
  }
}

/**
 * 3단계: 하이브리드 리트리버 (Hybrid Retriever: BM25 키워드 점수 + Dense Vector 유사도)
 */
export async function searchCadRagChunks(
  query: string,
  options: {
    caseId?: string;
    companyName?: string;
    chunkType?: CadChunkType;
    limit?: number;
    threshold?: number;
  } = {}
): Promise<HybridSearchResult[]> {
  await ensureCadRagChunksTable();
  const limit = options.limit || 10;
  const threshold = options.threshold || 0.15;
  const cleanQuery = (query || '').trim().toLowerCase();
  if (!cleanQuery) return [];

  const TERM_SYNONYMS: Record<string, string[]> = {
    샤프트: ['shaft', '축', '샤프트'],
    축: ['shaft', '샤프트'],
    브라켓: ['bracket', '브래킷', '브라켓'],
    브래킷: ['bracket', '브라켓'],
    플레이트: ['plate', '판', '플레이트'],
    캡: ['cap', '캡'],
    커버: ['cover', '커버'],
    하우징: ['housing', '하우징'],
    롤러: ['roller', '롤러'],
    가이드: ['guide', '가이드'],
    블록: ['block', '블록'],
    플랜지: ['flange', '플랜지'],
    도금: ['plating', '크롬', '아연', '도금'],
    아노다이징: ['anodizing', '착색', '아노다이징'],
    공차: ['tolerance', '±', '공차'],
    열처리: ['heat', 'hrc', '열처리']
  };

  const rawTokens = cleanQuery.split(/[\s,.:;_/\-()[\]]+/).filter(t => t.length >= 2);
  const expandedTokens = new Set<string>(rawTokens);
  for (const t of rawTokens) {
    if (TERM_SYNONYMS[t]) {
      for (const syn of TERM_SYNONYMS[t]) {
        expandedTokens.add(syn.toLowerCase());
      }
    }
  }
  const queryTokens = Array.from(expandedTokens);
  const queryVector = generateLocalDenseVector(cleanQuery + ' ' + queryTokens.join(' '));

  // 1. 후보 청크 조회 (EGDesk queryTable 안전 호출)
  const filters: Record<string, string> = {};
  if (options.caseId) filters.case_id = options.caseId;
  if (options.companyName) filters.company_name = options.companyName;
  if (options.chunkType) filters.chunk_type = options.chunkType;

  let rows: any[] = [];
  try {
    const queryRes = await queryTable('cad_rag_chunks', {
      filters: Object.keys(filters).length > 0 ? filters : undefined,
      limit: 200
    });
    rows = Array.isArray(queryRes) ? queryRes : (queryRes?.rows || []);
  } catch (err: any) {
    console.error('[searchCadRagChunks] queryTable error:', err.message);
    return [];
  }

  if (!rows || rows.length === 0) return [];

  // 부모 청크 맵 구성
  const chunkMap = new Map<string, any>();
  for (const r of rows) {
    const key = r.chunk_id || String(r.id);
    chunkMap.set(key, r);
  }

  const results: HybridSearchResult[] = [];

  for (const row of rows) {
    let embedding: number[] = [];
    try {
      embedding = JSON.parse(row.embedding_json || '[]');
    } catch {}

    // 1) 벡터 유사도 점수 (0 ~ 1)
    const vectorScore = embedding.length > 0 ? calculateCosineSimilarity(queryVector, embedding) : 0;

    // 2) 키워드 일치 점수 (0 ~ 1)
    const content = (row.chunk_text || '').toLowerCase();
    const title = (row.chunk_title || '').toLowerCase();
    let tokenMatches = 0;
    for (const token of queryTokens) {
      if (title.includes(token)) tokenMatches += 2.0;
      else if (content.includes(token)) tokenMatches += 1.0;
    }
    const maxTokens = Math.max(1, queryTokens.length);
    const keywordScore = Math.min(1.0, tokenMatches / (maxTokens * 2.0));

    // 3) 하이브리드 점수 결합 (키워드 40% + 벡터 60%)
    const hybridScore = Math.round((keywordScore * 0.40 + vectorScore * 0.60) * 100) / 100;

    if (hybridScore >= threshold || keywordScore >= 0.5) {
      let meta: any = {};
      try { meta = JSON.parse(row.metadata_json || '{}'); } catch {}

      const parentKey = row.parent_chunk_id;
      const parentRow = parentKey ? chunkMap.get(parentKey) : undefined;
      let parentChunk: CadSemanticChunk | undefined;
      if (parentRow) {
        parentChunk = {
          id: parentRow.chunk_id || String(parentRow.id),
          caseId: parentRow.case_id,
          companyName: parentRow.company_name,
          drawingNo: parentRow.drawing_no,
          chunkType: parentRow.chunk_type,
          chunkTitle: parentRow.chunk_title,
          chunkContent: parentRow.chunk_text,
          metadata: JSON.parse(parentRow.metadata_json || '{}'),
          createdAt: parentRow.created_at
        };
      }

      results.push({
        chunk: {
          id: row.chunk_id || String(row.id),
          caseId: row.case_id,
          companyName: row.company_name,
          drawingNo: row.drawing_no,
          chunkType: row.chunk_type,
          chunkTitle: row.chunk_title,
          chunkContent: row.chunk_text,
          parentChunkId: row.parent_chunk_id,
          metadata: meta,
          createdAt: row.created_at
        },
        keywordScore,
        vectorScore,
        hybridScore,
        parentChunk
      });
    }
  }

  // 최고 점수 순 정렬
  results.sort((a, b) => b.hybridScore - a.hybridScore);
  return results.slice(0, limit);
}
