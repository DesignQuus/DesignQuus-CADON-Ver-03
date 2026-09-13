import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

// Auto-read .env.development.local if process.env.NEXT_PUBLIC_EGDESK_PROJECT_ID is not yet set
if (typeof process !== 'undefined' && !process.env.NEXT_PUBLIC_EGDESK_PROJECT_ID) {
  try {
    const envPath = path.join(process.cwd(), '.env.development.local');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      for (const line of envContent.split('\n')) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          process.env[match[1].trim()] = match[2].trim();
        }
      }
    }
  } catch (e) {}
}

import {
  createTable,
  queryTable,
  insertRows,
  updateRows,
  deleteRows,
  executeSQL,
  getTableSchema,
  listTables
} from '../../egdesk-helpers';

/** 8종 표준 감사 컬럼 */
export const AUDIT_COLUMNS = [
  { name: 'tenant_id', type: 'TEXT' },
  { name: 'uuid', type: 'TEXT' },
  { name: 'updated_at', type: 'TEXT' },
  { name: 'updated_by', type: 'TEXT' },
  { name: 'deleted_at', type: 'TEXT' },
  { name: 'deleted_by', type: 'TEXT' },
  { name: 'restored_at', type: 'TEXT' },
  { name: 'restored_by', type: 'TEXT' }
];

interface TableSpec {
  name: string;
  displayName: string;
  description: string;
  columns: Array<{ name: string; type: string; notNull?: boolean }>;
  uniqueKeyColumns?: string[];
}

export const CADON_TABLE_SPECS: TableSpec[] = [
  {
    name: 'users',
    displayName: '사용자 계정 대장',
    description: '로그인 계정 및 역할 관리',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'login_id', type: 'TEXT', notNull: true },
      { name: 'password_hash', type: 'TEXT', notNull: true },
      { name: 'name', type: 'TEXT', notNull: true },
      { name: 'role', type: 'TEXT', notNull: true },
      { name: 'company_id', type: 'TEXT' },
      { name: 'is_active', type: 'INTEGER', notNull: true },
      { name: 'last_login_at', type: 'TEXT' },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'companies',
    displayName: '고객사/협력사 대장',
    description: '고객사 정보 및 테넌트 식별',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'company_code', type: 'TEXT', notNull: true },
      { name: 'company_name', type: 'TEXT', notNull: true },
      { name: 'company_type', type: 'TEXT', notNull: true },
      { name: 'is_active', type: 'INTEGER', notNull: true },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'user_company_access',
    displayName: '사용자-회사 접근 권한',
    description: '사용자별 소속/접근 허용 고객사 매핑',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'user_id', type: 'TEXT', notNull: true },
      { name: 'company_id', type: 'TEXT', notNull: true },
      { name: 'access_role', type: 'TEXT', notNull: true },
      { name: 'is_active', type: 'INTEGER', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'projects',
    displayName: '프로젝트 관리',
    description: '고객사별 프로젝트 마스터',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'company_id', type: 'TEXT', notNull: true },
      { name: 'project_code', type: 'TEXT', notNull: true },
      { name: 'project_name', type: 'TEXT', notNull: true },
      { name: 'description', type: 'TEXT' },
      { name: 'status', type: 'TEXT', notNull: true },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'quotation_cases',
    displayName: '견적의뢰 건 관리',
    description: '견적의뢰 번호, 상태, 진행 단계',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'case_no', type: 'TEXT', notNull: true },
      { name: 'company_id', type: 'TEXT', notNull: true },
      { name: 'project_id', type: 'TEXT', notNull: true },
      { name: 'case_name', type: 'TEXT', notNull: true },
      { name: 'request_date', type: 'TEXT', notNull: true },
      { name: 'status', type: 'TEXT', notNull: true },
      { name: 'revision', type: 'TEXT', notNull: true },
      { name: 'quote_readiness', type: 'TEXT', notNull: true },
      { name: 'created_by_user_id', type: 'TEXT', notNull: true },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'uploaded_files',
    displayName: '업로드/파생 파일 관리',
    description: 'DWG/DXF/PDF 원본 및 변환 파일 경로/메타데이터',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'quotation_case_id', type: 'TEXT', notNull: true },
      { name: 'original_file_name', type: 'TEXT', notNull: true },
      { name: 'stored_file_name', type: 'TEXT', notNull: true },
      { name: 'storage_path', type: 'TEXT', notNull: true },
      { name: 'file_type', type: 'TEXT', notNull: true },
      { name: 'file_role', type: 'TEXT', notNull: true },
      { name: 'derived_from_file_id', type: 'TEXT' },
      { name: 'file_size', type: 'INTEGER' },
      { name: 'checksum', type: 'TEXT' },
      { name: 'upload_status', type: 'TEXT', notNull: true },
      { name: 'uploaded_by_user_id', type: 'TEXT', notNull: true },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'dwg_conversion_runs',
    displayName: 'DWG 변환 실행 이력',
    description: 'LibreDWG 변환 실행 로그',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'source_file_id', type: 'TEXT', notNull: true },
      { name: 'derived_file_id', type: 'TEXT' },
      { name: 'provider', type: 'TEXT', notNull: true },
      { name: 'converter_version', type: 'TEXT' },
      { name: 'source_dwg_signature', type: 'TEXT' },
      { name: 'source_dwg_version', type: 'TEXT' },
      { name: 'output_dxf_version', type: 'TEXT' },
      { name: 'status', type: 'TEXT', notNull: true },
      { name: 'started_at', type: 'TEXT', notNull: true },
      { name: 'completed_at', type: 'TEXT' },
      { name: 'duration_ms', type: 'INTEGER' },
      { name: 'exit_code', type: 'INTEGER' },
      { name: 'warning_count', type: 'INTEGER' },
      { name: 'warnings_json', type: 'TEXT' },
      { name: 'error_code', type: 'TEXT' },
      { name: 'error_message', type: 'TEXT' },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'cad_parse_runs',
    displayName: 'CAD 파싱 실행 이력',
    description: 'CAD 엔티티 파싱 통계 및 결과',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'source_file_id', type: 'TEXT', notNull: true },
      { name: 'dxf_version', type: 'TEXT' },
      { name: 'total_entities', type: 'INTEGER', notNull: true },
      { name: 'entity_counts_json', type: 'TEXT' },
      { name: 'global_bounds_json', type: 'TEXT' },
      { name: 'status', type: 'TEXT', notNull: true },
      { name: 'duration_ms', type: 'INTEGER' },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'cad_objects',
    displayName: 'CAD 객체 기하 데이터',
    description: '도면 개별 CAD 엔티티 캐시',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'parse_run_id', type: 'TEXT', notNull: true },
      { name: 'handle', type: 'TEXT', notNull: true },
      { name: 'entity_type', type: 'TEXT', notNull: true },
      { name: 'layer', type: 'TEXT', notNull: true },
      { name: 'color', type: 'INTEGER' },
      { name: 'raw_text', type: 'TEXT' },
      { name: 'bounding_box_json', type: 'TEXT' },
      { name: 'geometry_data_json', type: 'TEXT' },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'drawings',
    displayName: '도면 시트 및 표제란',
    description: '도면 번호, 품명, 규격, 척도, 리비전',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'quotation_case_id', type: 'TEXT', notNull: true },
      { name: 'drawing_index', type: 'INTEGER', notNull: true },
      { name: 'drawing_no_raw', type: 'TEXT' },
      { name: 'drawing_no_normalized', type: 'TEXT' },
      { name: 'drawing_name_raw', type: 'TEXT' },
      { name: 'drawing_name_normalized', type: 'TEXT' },
      { name: 'revision', type: 'TEXT' },
      { name: 'material', type: 'TEXT' },
      { name: 'scale', type: 'TEXT' },
      { name: 'drawing_type', type: 'TEXT' },
      { name: 'frame_bbox_json', type: 'TEXT' },
      { name: 'title_block_bbox_json', type: 'TEXT' },
      { name: 'confidence_score', type: 'REAL', notNull: true },
      { name: 'status', type: 'TEXT', notNull: true },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'drawing_relationships',
    displayName: '도면 계층 관계',
    description: '조립도-부조립도-단품 종속 관계',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'quotation_case_id', type: 'TEXT', notNull: true },
      { name: 'parent_drawing_no', type: 'TEXT', notNull: true },
      { name: 'child_drawing_no', type: 'TEXT', notNull: true },
      { name: 'relationship_type', type: 'TEXT', notNull: true },
      { name: 'confidence_score', type: 'REAL', notNull: true },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'bom_areas',
    displayName: 'BOM 검출 영역',
    description: '도면 내 BOM 테이블 영역 바운딩 박스',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'quotation_case_id', type: 'TEXT', notNull: true },
      { name: 'drawing_no', type: 'TEXT', notNull: true },
      { name: 'table_type', type: 'TEXT', notNull: true },
      { name: 'bbox_json', type: 'TEXT', notNull: true },
      { name: 'confidence_score', type: 'REAL', notNull: true },
      { name: 'status', type: 'TEXT', notNull: true },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'raw_bom_items',
    displayName: 'CAD 추출 Raw BOM',
    description: '표/텍스트에서 추출한 최초 BOM 원시 행',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'quotation_case_id', type: 'TEXT', notNull: true },
      { name: 'drawing_no', type: 'TEXT', notNull: true },
      { name: 'row_index', type: 'INTEGER', notNull: true },
      { name: 'item_no_raw', type: 'TEXT' },
      { name: 'part_no_raw', type: 'TEXT' },
      { name: 'name_raw', type: 'TEXT' },
      { name: 'specification_raw', type: 'TEXT' },
      { name: 'material_raw', type: 'TEXT' },
      { name: 'quantity_raw', type: 'TEXT' },
      { name: 'quantity_numeric', type: 'REAL' },
      { name: 'unit_raw', type: 'TEXT' },
      { name: 'remark_raw', type: 'TEXT' },
      { name: 'source_handles_json', type: 'TEXT' },
      { name: 'status', type: 'TEXT', notNull: true },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'flattened_bom_items',
    displayName: '다단계 집계 BOM',
    description: '도면 계층 전개 및 수량 가중치 합산 BOM',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'quotation_case_id', type: 'TEXT', notNull: true },
      { name: 'item_key', type: 'TEXT', notNull: true },
      { name: 'part_no', type: 'TEXT' },
      { name: 'name', type: 'TEXT', notNull: true },
      { name: 'specification', type: 'TEXT' },
      { name: 'material', type: 'TEXT' },
      { name: 'total_quantity', type: 'REAL', notNull: true },
      { name: 'unit', type: 'TEXT', notNull: true },
      { name: 'source_drawings_json', type: 'TEXT' },
      { name: 'source_item_ids_json', type: 'TEXT' },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'normalized_bom_items',
    displayName: '정규화 BOM 아이템',
    description: '오탈자 교정, 방향 분리, 표준 명칭 후보 매핑',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'quotation_case_id', type: 'TEXT', notNull: true },
      { name: 'raw_item_id', type: 'TEXT', notNull: true },
      { name: 'raw_name', type: 'TEXT', notNull: true },
      { name: 'normalized_name', type: 'TEXT', notNull: true },
      { name: 'search_name', type: 'TEXT', notNull: true },
      { name: 'direction', type: 'TEXT' },
      { name: 'spec_candidate', type: 'TEXT' },
      { name: 'material_candidate', type: 'TEXT' },
      { name: 'quantity', type: 'REAL', notNull: true },
      { name: 'unit', type: 'TEXT', notNull: true },
      { name: 'status', type: 'TEXT', notNull: true },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'product_masters',
    displayName: '표준 마스터 품목 대장',
    description: '자사 표준 부품/자재 품목 마스터',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'company_id', type: 'TEXT' },
      { name: 'master_code', type: 'TEXT', notNull: true },
      { name: 'standard_name', type: 'TEXT', notNull: true },
      { name: 'category', type: 'TEXT', notNull: true },
      { name: 'specification', type: 'TEXT' },
      { name: 'material', type: 'TEXT' },
      { name: 'unit', type: 'TEXT', notNull: true },
      { name: 'status', type: 'TEXT', notNull: true },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'master_aliases',
    displayName: '마스터 품목 별칭 대장',
    description: '고객사별 도면 표기 이명/약칭 매핑 학습 DB',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'company_id', type: 'TEXT' },
      { name: 'master_id', type: 'TEXT', notNull: true },
      { name: 'alias_name', type: 'TEXT', notNull: true },
      { name: 'alias_normalized', type: 'TEXT', notNull: true },
      { name: 'approval_count', type: 'INTEGER', notNull: true },
      { name: 'rejection_count', type: 'INTEGER', notNull: true },
      { name: 'scope', type: 'TEXT', notNull: true },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'master_candidates',
    displayName: '마스터 추천 매칭 후보',
    description: 'BOM 품목별 추천 마스터 및 유사도 점수/근거',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'normalized_item_id', type: 'TEXT', notNull: true },
      { name: 'master_id', type: 'TEXT', notNull: true },
      { name: 'master_code', type: 'TEXT', notNull: true },
      { name: 'standard_name', type: 'TEXT', notNull: true },
      { name: 'specification', type: 'TEXT' },
      { name: 'material', type: 'TEXT' },
      { name: 'rank', type: 'INTEGER', notNull: true },
      { name: 'total_score', type: 'REAL', notNull: true },
      { name: 'positive_evidence_json', type: 'TEXT' },
      { name: 'negative_evidence_json', type: 'TEXT' },
      { name: 'candidate_status', type: 'TEXT', notNull: true },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'bom_approval_records',
    displayName: 'BOM 승인/수정 이력',
    description: '사용자 승인 결정 및 마스터 오버라이드',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'quotation_case_id', type: 'TEXT', notNull: true },
      { name: 'normalized_item_id', type: 'TEXT', notNull: true },
      { name: 'selected_master_id', type: 'TEXT' },
      { name: 'decision_type', type: 'TEXT', notNull: true },
      { name: 'decision_reason', type: 'TEXT' },
      { name: 'difference_notes', type: 'TEXT' },
      { name: 'is_override', type: 'INTEGER', notNull: true },
      { name: 'approved_by_user_id', type: 'TEXT', notNull: true },
      { name: 'approved_at', type: 'TEXT', notNull: true },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'final_bom_items',
    displayName: '최종 확정 견적 BOM',
    description: '사용자 승인 완료된 견적 투입 최종 BOM',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'quotation_case_id', type: 'TEXT', notNull: true },
      { name: 'normalized_item_id', type: 'TEXT', notNull: true },
      { name: 'final_master_id', type: 'TEXT' },
      { name: 'final_master_code', type: 'TEXT' },
      { name: 'final_name', type: 'TEXT', notNull: true },
      { name: 'final_spec', type: 'TEXT' },
      { name: 'final_material', type: 'TEXT' },
      { name: 'final_quantity', type: 'REAL', notNull: true },
      { name: 'final_unit', type: 'TEXT', notNull: true },
      { name: 'approval_status', type: 'TEXT', notNull: true },
      { name: 'approved_by_user_id', type: 'TEXT' },
      { name: 'approved_at', type: 'TEXT' },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'price_masters',
    displayName: '기준 단가 마스터',
    description: '마스터 품목별 표준/고객사 단가 및 유효기간',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'master_id', type: 'TEXT', notNull: true },
      { name: 'company_id', type: 'TEXT' },
      { name: 'price_type', type: 'TEXT', notNull: true },
      { name: 'unit_price', type: 'REAL', notNull: true },
      { name: 'currency', type: 'TEXT', notNull: true },
      { name: 'effective_from', type: 'TEXT', notNull: true },
      { name: 'effective_to', type: 'TEXT' },
      { name: 'is_active', type: 'INTEGER', notNull: true },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'quotes',
    displayName: '견적서 마스터',
    description: '견적서 버전, 공급가액, 할인율, 최종금액',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'quotation_case_id', type: 'TEXT', notNull: true },
      { name: 'quote_no', type: 'TEXT', notNull: true },
      { name: 'quote_version', type: 'INTEGER', notNull: true },
      { name: 'company_id', type: 'TEXT', notNull: true },
      { name: 'project_id', type: 'TEXT', notNull: true },
      { name: 'status', type: 'TEXT', notNull: true },
      { name: 'currency', type: 'TEXT', notNull: true },
      { name: 'subtotal', type: 'REAL', notNull: true },
      { name: 'discount_type', type: 'TEXT', notNull: true },
      { name: 'discount_rate', type: 'REAL', notNull: true },
      { name: 'discount_amount', type: 'REAL', notNull: true },
      { name: 'tax_rate', type: 'REAL', notNull: true },
      { name: 'tax_amount', type: 'REAL', notNull: true },
      { name: 'total_amount', type: 'REAL', notNull: true },
      { name: 'quote_date', type: 'TEXT', notNull: true },
      { name: 'is_locked', type: 'INTEGER', notNull: true },
      { name: 'created_by_user_id', type: 'TEXT', notNull: true },
      { name: 'approved_by_user_id', type: 'TEXT' },
      { name: 'approved_at', type: 'TEXT' },
      { name: 'override_reason', type: 'TEXT' },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'quote_items',
    displayName: '견적서 명세 품목',
    description: '견적서 포함 품목 및 적용 단가/공급가',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'quote_id', type: 'TEXT', notNull: true },
      { name: 'final_bom_item_id', type: 'TEXT' },
      { name: 'master_id', type: 'TEXT' },
      { name: 'item_no', type: 'INTEGER', notNull: true },
      { name: 'master_code', type: 'TEXT' },
      { name: 'item_name', type: 'TEXT', notNull: true },
      { name: 'specification', type: 'TEXT' },
      { name: 'material', type: 'TEXT' },
      { name: 'quantity', type: 'REAL', notNull: true },
      { name: 'unit', type: 'TEXT', notNull: true },
      { name: 'unit_price', type: 'REAL', notNull: true },
      { name: 'amount', type: 'REAL', notNull: true },
      { name: 'price_source', type: 'TEXT', notNull: true },
      { name: 'price_status', type: 'TEXT', notNull: true },
      { name: 'remark', type: 'TEXT' },
      { name: 'is_included', type: 'INTEGER', notNull: true },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'manual_price_pool',
    displayName: '수기 단가 지식 풀',
    description: '미등록 품목 수기 입력 단가 축적 DB',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'item_name', type: 'TEXT', notNull: true },
      { name: 'specification', type: 'TEXT' },
      { name: 'material', type: 'TEXT' },
      { name: 'unit_price', type: 'REAL', notNull: true },
      { name: 'remark', type: 'TEXT' },
      { name: 'quotation_case_id', type: 'TEXT' },
      { name: 'company_id', type: 'TEXT' },
      { name: 'standard_name', type: 'TEXT' },
      { name: 'standard_material', type: 'TEXT' },
      { name: 'approval_count', type: 'INTEGER' },
      { name: 'last_used_at', type: 'TEXT' },
      { name: 'source', type: 'TEXT' },
      { name: 'created_by_user_id', type: 'TEXT', notNull: true },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'excel_templates',
    displayName: '엑셀 템플릿 관리',
    description: '공식 견적서 엑셀 양식 관리',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'company_id', type: 'TEXT' },
      { name: 'template_name', type: 'TEXT', notNull: true },
      { name: 'original_file_name', type: 'TEXT', notNull: true },
      { name: 'storage_path', type: 'TEXT', notNull: true },
      { name: 'template_type', type: 'TEXT', notNull: true },
      { name: 'version', type: 'TEXT', notNull: true },
      { name: 'is_active', type: 'INTEGER', notNull: true },
      { name: 'is_default', type: 'INTEGER', notNull: true },
      { name: 'created_by_user_id', type: 'TEXT', notNull: true },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'quote_exports',
    displayName: '견적서 엑셀 발행 이력',
    description: '견적서 엑셀 다운로드/발행 로그',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'quote_id', type: 'TEXT', notNull: true },
      { name: 'quote_version', type: 'INTEGER', notNull: true },
      { name: 'template_id', type: 'TEXT', notNull: true },
      { name: 'file_name', type: 'TEXT', notNull: true },
      { name: 'storage_path', type: 'TEXT', notNull: true },
      { name: 'file_size', type: 'INTEGER' },
      { name: 'export_status', type: 'TEXT', notNull: true },
      { name: 'is_draft', type: 'INTEGER', notNull: true },
      { name: 'exported_by_user_id', type: 'TEXT', notNull: true },
      { name: 'exported_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'case_archives',
    displayName: '분석 스냅샷 아카이브',
    description: '견적 건 분석 상태 스냅샷',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'quotation_case_id', type: 'TEXT', notNull: true },
      { name: 'archive_version', type: 'INTEGER', notNull: true },
      { name: 'archive_name', type: 'TEXT', notNull: true },
      { name: 'drawings_count', type: 'INTEGER', notNull: true },
      { name: 'bom_items_count', type: 'INTEGER', notNull: true },
      { name: 'snapshot_data_json', type: 'TEXT', notNull: true },
      { name: 'created_by_user_id', type: 'TEXT', notNull: true },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'cad_app_settings',
    displayName: '로컬 CAD 실행 경로',
    description: 'AutoCAD / DWG FastView / TrueView 경로',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'key', type: 'TEXT', notNull: true },
      { name: 'value', type: 'TEXT', notNull: true },
      { name: 'updated_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'golden_cases',
    displayName: '골든 데이터셋 케이스',
    description: '벤치마크 및 회귀 테스트용 기준 데이터셋',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'project_id', type: 'TEXT' },
      { name: 'quotation_case_id', type: 'TEXT' },
      { name: 'case_code', type: 'TEXT', notNull: true },
      { name: 'name', type: 'TEXT', notNull: true },
      { name: 'description', type: 'TEXT' },
      { name: 'data_classification', type: 'TEXT', notNull: true },
      { name: 'source_checksum', type: 'TEXT' },
      { name: 'status', type: 'TEXT', notNull: true },
      { name: 'actual_drawing_count', type: 'INTEGER' },
      { name: 'actual_bom_count', type: 'INTEGER' },
      { name: 'actual_item_count', type: 'INTEGER' },
      { name: 'created_by', type: 'TEXT', notNull: true },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'system_baselines',
    displayName: '골든 기준선 벤치마크',
    description: '골든 데이터셋 파싱 기준선 정밀도 지표',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'golden_case_id', type: 'TEXT', notNull: true },
      { name: 'baseline_name', type: 'TEXT', notNull: true },
      { name: 'parser_version', type: 'TEXT', notNull: true },
      { name: 'metrics_json', type: 'TEXT', notNull: true },
      { name: 'created_by', type: 'TEXT', notNull: true },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'user_activity_logs',
    displayName: '사용자 감사 활동 로그',
    description: '작업자별 로그인/견적수정/승인/파일업로드 이력',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'user_id', type: 'TEXT', notNull: true },
      { name: 'user_name', type: 'TEXT', notNull: true },
      { name: 'user_login_id', type: 'TEXT', notNull: true },
      { name: 'user_role', type: 'TEXT', notNull: true },
      { name: 'activity_type', type: 'TEXT', notNull: true },
      { name: 'quotation_case_id', type: 'TEXT' },
      { name: 'case_name', type: 'TEXT' },
      { name: 'details', type: 'TEXT' },
      { name: 'ip_address', type: 'TEXT' },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'system_approval_settings',
    displayName: '전사 결재 정책 설정',
    description: '타인 견적 수정/승인 및 관리자 최종결재 통제',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'cross_user_edit_policy', type: 'TEXT', notNull: true },
      { name: 'cross_user_approve_policy', type: 'TEXT', notNull: true },
      { name: 'require_admin_final_quote_approval', type: 'INTEGER', notNull: true },
      { name: 'approval_valid_hours', type: 'INTEGER', notNull: true },
      { name: 'is_approval_suspended', type: 'INTEGER', notNull: true },
      { name: 'updated_by_user_id', type: 'TEXT' },
      { name: 'updated_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  },
  {
    name: 'user_approval_permissions',
    displayName: '사용자별 결재/수정 세부 권한',
    description: '작업자별 단가 수정, 견적 승인, 타인 건 수정 권한',
    columns: [
      { name: 'user_id', type: 'TEXT', notNull: true },
      { name: 'can_edit_own', type: 'INTEGER', notNull: true },
      { name: 'can_approve_own', type: 'INTEGER', notNull: true },
      { name: 'can_edit_others', type: 'TEXT', notNull: true },
      { name: 'can_approve_others', type: 'TEXT', notNull: true },
      { name: 'can_edit_price', type: 'INTEGER', notNull: true },
      { name: 'can_approve_quote', type: 'INTEGER', notNull: true },
      { name: 'updated_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['user_id']
  },
  {
    name: 'approval_requests',
    displayName: '견적/단가 승인 결재 요청 대장',
    description: '타인 건 수정/승인 요청 및 심사 승인/반려 대장',
    columns: [
      { name: 'id', type: 'TEXT', notNull: true },
      { name: 'quotation_case_id', type: 'TEXT', notNull: true },
      { name: 'request_type', type: 'TEXT', notNull: true },
      { name: 'requester_id', type: 'TEXT', notNull: true },
      { name: 'target_owner_id', type: 'TEXT', notNull: true },
      { name: 'reason', type: 'TEXT', notNull: true },
      { name: 'status', type: 'TEXT', notNull: true },
      { name: 'reviewer_id', type: 'TEXT' },
      { name: 'reviewer_comment', type: 'TEXT' },
      { name: 'reviewed_at', type: 'TEXT' },
      { name: 'expires_at', type: 'TEXT', notNull: true },
      { name: 'created_at', type: 'TEXT', notNull: true }
    ],
    uniqueKeyColumns: ['id']
  }
];

export async function setupDatabase(): Promise<{ success: boolean; message: string; results?: any }> {
  console.log('🚀 [CADON Zero-Config Setup] Initializing EGDesk Database with Auto-Audit Columns...');
  const now = new Date().toISOString();

  // 1. 현재 존재하는 테이블 목록 조회
  let existingTables: string[] = [];
  try {
    const listRes = await listTables();
    existingTables = (listRes.tables || []).map((t: any) => t.tableName.toLowerCase());
  } catch (e: any) {
    console.warn('⚠️ listTables check failed, will try direct operations:', e.message);
  }

  // 2. 34개 테이블 순회하며 8종 감사 컬럼 주입 및 생성/보정
  for (const spec of CADON_TABLE_SPECS) {
    const tableName = spec.name;
    const tableDisplayName = spec.displayName;
    
    // 복사본 생성 후 8종 감사 컬럼 주입
    const finalColumns = spec.columns.map(c => ({ ...c }));
    for (const auditCol of AUDIT_COLUMNS) {
      if (!finalColumns.some(c => c.name.toLowerCase() === auditCol.name.toLowerCase())) {
        finalColumns.push({ ...auditCol });
      }
    }

    if (!existingTables.includes(tableName.toLowerCase())) {
      console.log(`[Setup] Creating table "${tableName}" with audit columns...`);
      try {
        await createTable(tableDisplayName, finalColumns as any, {
          tableName,
          uniqueKeyColumns: spec.uniqueKeyColumns || ['id']
        });
        console.log(`✓ Table "${tableName}" created.`);
      } catch (err: any) {
        console.error(`❌ Failed to create table "${tableName}":`, err.message);
      }
    } else {
      // 기존 테이블의 감사 컬럼 누락 여부 확인 및 ALTER TABLE 자동 보정
      try {
        const schemaInfo = await getTableSchema(tableName);
        const currentCols = (schemaInfo?.schema || []).map((c: any) => c.name.toLowerCase());
        
        for (const auditCol of AUDIT_COLUMNS) {
          if (!currentCols.includes(auditCol.name.toLowerCase())) {
            console.log(`[Auto-Migration] Injecting missing audit column "${auditCol.name}" into "${tableName}"...`);
            await executeSQL(`ALTER TABLE ${tableName} ADD COLUMN ${auditCol.name} ${auditCol.type};`);
          }
        }
      } catch (altErr: any) {
        // 이미 존재하거나 조용한 성공 처리
      }
    }
  }

  // 3. 기본 계정 및 마스터 데이터 시딩 (Users, Companies, Product Masters, Approval Config)
  console.log('🌱 [CADON Zero-Config Setup] Verifying and Seeding Default Master Data...');

  // A. 관리자 & 5인 영업담당자 시딩
  const userCountRes = await executeSQL('SELECT COUNT(*) as cnt FROM users');
  const userCount = Number(userCountRes?.rows?.[0]?.cnt || 0);

  if (userCount === 0) {
    console.log('🌱 Seeding initial user accounts...');
    const defaultPassHash = bcrypt.hashSync('Cadon1234!@', 10);
    const legacyPassHash = bcrypt.hashSync('admin1234!', 10);
    const usersToInsert = [
      {
        id: 'usr_admin',
        login_id: 'admin',
        password_hash: defaultPassHash,
        name: '시스템 최고관리자',
        role: 'SUPER_ADMIN',
        company_id: null,
        is_active: 1,
        tenant_id: 'tenant-cadon',
        uuid: 'usr_admin',
        created_at: now,
        updated_at: now
      },
      {
        id: 'usr_sales1',
        login_id: 'sales1',
        password_hash: defaultPassHash,
        name: '영업1팀 담당자',
        role: 'SALES_USER',
        company_id: 'comp_001',
        is_active: 1,
        tenant_id: 'tenant-cadon',
        uuid: 'usr_sales1',
        created_at: now,
        updated_at: now
      },
      {
        id: 'usr_kim',
        login_id: 'kim',
        password_hash: defaultPassHash,
        name: '김견적 과장',
        role: 'SALES_USER',
        company_id: 'comp_001',
        is_active: 1,
        tenant_id: 'tenant-cadon',
        uuid: 'usr_kim',
        created_at: now,
        updated_at: now
      },
      {
        id: 'usr_lee',
        login_id: 'lee',
        password_hash: defaultPassHash,
        name: '이견적 대리',
        role: 'SALES_USER',
        company_id: 'comp_001',
        is_active: 1,
        tenant_id: 'tenant-cadon',
        uuid: 'usr_lee',
        created_at: now,
        updated_at: now
      },
      {
        id: 'usr_choi',
        login_id: 'choi',
        password_hash: defaultPassHash,
        name: '최견적 차장',
        role: 'SALES_USER',
        company_id: 'comp_002',
        is_active: 1,
        tenant_id: 'tenant-cadon',
        uuid: 'usr_choi',
        created_at: now,
        updated_at: now
      },
      {
        id: 'usr_song',
        login_id: 'song',
        password_hash: defaultPassHash,
        name: '송견적 주임',
        role: 'SALES_USER',
        company_id: 'comp_002',
        is_active: 1,
        tenant_id: 'tenant-cadon',
        uuid: 'usr_song',
        created_at: now,
        updated_at: now
      },
      {
        id: 'usr_park',
        login_id: 'park',
        password_hash: defaultPassHash,
        name: '박견적 대리',
        role: 'SALES_USER',
        company_id: 'comp_001',
        is_active: 1,
        tenant_id: 'tenant-cadon',
        uuid: 'usr_park',
        created_at: now,
        updated_at: now
      }
    ];
    await insertRows('users', usersToInsert);
    console.log('✓ User accounts seeded.');
  } else {
    // Ensure usr_sales1 exists for test compatibility
    const sales1Res = await executeSQL("SELECT COUNT(*) as cnt FROM users WHERE login_id = 'sales1'");
    if (Number(sales1Res?.rows?.[0]?.cnt || 0) === 0) {
      const defaultPassHash = bcrypt.hashSync('Cadon1234!@', 10);
      await insertRows('users', [{
        id: 'usr_sales1',
        login_id: 'sales1',
        password_hash: defaultPassHash,
        name: '영업1팀 담당자',
        role: 'SALES_USER',
        company_id: 'comp_001',
        is_active: 1,
        tenant_id: 'tenant-cadon',
        uuid: 'usr_sales1',
        created_at: now,
        updated_at: now
      }]);
    }
  }

  // B. 기본 고객사 시딩
  const compCountRes = await executeSQL('SELECT COUNT(*) as cnt FROM companies');
  const compCount = Number(compCountRes?.rows?.[0]?.cnt || 0);

  if (compCount === 0) {
    console.log('🌱 Seeding initial demo companies...');
    const companiesToInsert = [
      {
        id: 'comp_sechang',
        company_code: 'CUST-SECHANG',
        company_name: '(주)세창인터내셔널',
        company_type: 'CUSTOMER',
        is_active: 1,
        tenant_id: 'tenant-cadon',
        uuid: 'comp_sechang',
        created_at: now,
        updated_at: now
      },
      {
        id: 'comp_001',
        company_code: 'CUST-0001',
        company_name: 'A기계공업 (주)',
        company_type: 'CUSTOMER',
        is_active: 1,
        tenant_id: 'tenant-cadon',
        uuid: 'comp_001',
        created_at: now,
        updated_at: now
      },
      {
        id: 'comp_002',
        company_code: 'CUST-0002',
        company_name: 'B자동화시스템 (주)',
        company_type: 'CUSTOMER',
        is_active: 1,
        tenant_id: 'tenant-cadon',
        uuid: 'comp_002',
        created_at: now,
        updated_at: now
      }
    ];
    await insertRows('companies', companiesToInsert);

    // 접근 권한 매핑
    await insertRows('user_company_access', [
      { id: 'uca_1', user_id: 'usr_sales1', company_id: 'comp_001', access_role: 'MANAGER', is_active: 1, tenant_id: 'tenant-cadon', uuid: 'uca_1', updated_at: now },
      { id: 'uca_2', user_id: 'usr_admin', company_id: 'comp_001', access_role: 'MANAGER', is_active: 1, tenant_id: 'tenant-cadon', uuid: 'uca_2', updated_at: now },
      { id: 'uca_3', user_id: 'usr_admin', company_id: 'comp_002', access_role: 'MANAGER', is_active: 1, tenant_id: 'tenant-cadon', uuid: 'uca_3', updated_at: now },
      { id: 'uca_4', user_id: 'usr_admin', company_id: 'comp_sechang', access_role: 'MANAGER', is_active: 1, tenant_id: 'tenant-cadon', uuid: 'uca_4', updated_at: now }
    ]);

    // 프로젝트 & 케이스 시딩
    await insertRows('projects', [
      {
        id: 'proj_001',
        company_id: 'comp_001',
        project_code: 'PRJ-2026-01',
        project_name: '2026 고속 가이드레일 및 프레임 증설라인',
        description: 'A기계 메인 생산라인 증설 견적 건',
        status: 'ACTIVE',
        tenant_id: 'tenant-cadon',
        uuid: 'proj_001',
        created_at: now,
        updated_at: now
      }
    ]);

    await insertRows('quotation_cases', [
      {
        id: 'case_001',
        case_no: 'QT-20260901-001',
        company_id: 'comp_001',
        project_id: 'proj_001',
        case_name: 'A기계 고속라인 가이드레일/모터베이스 제작 견적의뢰',
        request_date: '2026-09-01',
        status: 'DRAFT',
        revision: '0',
        quote_readiness: 'NOT_READY',
        created_by_user_id: 'usr_kim',
        tenant_id: 'tenant-cadon',
        uuid: 'case_001',
        created_at: now,
        updated_at: now
      }
    ]);

    // 표준 마스터 부품 시딩
    const masters = [
      { id: 'mst_001', code: 'GR-1200', name: 'GUIDE RAIL ASSY 1200', cat: 'GUIDE_RAIL', spec: '1200L', mat: 'AL6063', unit: 'EA', price: 120000 },
      { id: 'mst_002', code: 'GR-1000', name: 'GUIDE RAIL ASSY 1000', cat: 'GUIDE_RAIL', spec: '1000L', mat: 'AL6063', unit: 'EA', price: 95000 },
      { id: 'mst_003', code: 'MB-001', name: 'MOTOR BASE BRACKET', cat: 'BRACKET', spec: '150x120x10T', mat: 'SS400', unit: 'EA', price: 45000 },
      { id: 'mst_004', code: 'FR-101-LH', name: 'MAIN FRAME LH', cat: 'FRAME', spec: '800x600', mat: 'SS400', unit: 'EA', price: 65000 },
      { id: 'mst_005', code: 'FR-101-RH', name: 'MAIN FRAME RH', cat: 'FRAME', spec: '800x600', mat: 'SS400', unit: 'EA', price: 65000 },
      { id: 'mst_006', code: 'SF-102', name: 'DRIVE SHAFT D25', cat: 'SHAFT', spec: 'DIA 25x300L', mat: 'S45C', unit: 'EA', price: 28000 },
      { id: 'mst_007', code: 'BK-003', name: 'GUIDE BRACKET SIDE', cat: 'BRACKET', spec: '50x50x5T', mat: 'SUS304', unit: 'EA', price: 18000 }
    ];

    const prodMastersToInsert = masters.map(m => ({
      id: m.id,
      master_code: m.code,
      standard_name: m.name,
      category: m.cat,
      specification: m.spec,
      material: m.mat,
      unit: m.unit,
      status: 'ACTIVE',
      tenant_id: 'tenant-cadon',
      uuid: m.id,
      created_at: now,
      updated_at: now
    }));
    await insertRows('product_masters', prodMastersToInsert);

    const priceMastersToInsert = masters.map(m => ({
      id: `prc_${m.id}`,
      master_id: m.id,
      company_id: null,
      price_type: 'STANDARD',
      unit_price: m.price,
      currency: 'KRW',
      effective_from: '2026-01-01',
      effective_to: null,
      is_active: 1,
      tenant_id: 'tenant-cadon',
      uuid: `prc_${m.id}`,
      created_at: now,
      updated_at: now
    }));
    await insertRows('price_masters', priceMastersToInsert);
    console.log('✓ Companies, Projects, and 7 Standard Product Masters seeded.');
  }

  // C. 전사 결재 설정 시딩 (GLOBAL_CONFIG)
  const approvalConfigRes = await executeSQL("SELECT COUNT(*) as cnt FROM system_approval_settings WHERE id = 'GLOBAL_CONFIG'");
  const hasApprovalConfig = Number(approvalConfigRes?.rows?.[0]?.cnt || 0) > 0;
  if (!hasApprovalConfig) {
    await insertRows('system_approval_settings', [
      {
        id: 'GLOBAL_CONFIG',
        cross_user_edit_policy: 'REQUIRE_APPROVAL',
        cross_user_approve_policy: 'REQUIRE_APPROVAL',
        require_admin_final_quote_approval: 0,
        approval_valid_hours: 48,
        is_approval_suspended: 1,
        updated_by_user_id: 'usr_admin',
        tenant_id: 'tenant-cadon',
        uuid: 'GLOBAL_CONFIG',
        updated_at: now
      }
    ]);

    const allUsers = [
      'usr_admin', 'usr_kim', 'usr_lee', 'usr_choi', 'usr_song', 'usr_park'
    ];
    const userPermissions = allUsers.map(uId => ({
      user_id: uId,
      can_edit_own: 1,
      can_approve_own: 1,
      can_edit_others: uId === 'usr_admin' ? 'ALLOW' : 'REQUIRE_APPROVAL',
      can_approve_others: uId === 'usr_admin' ? 'ALLOW' : 'REQUIRE_APPROVAL',
      can_edit_price: 1,
      can_approve_quote: 1,
      tenant_id: 'tenant-cadon',
      uuid: `perm_${uId}`,
      updated_at: now
    }));
    await insertRows('user_approval_permissions', userPermissions);
    console.log('✓ Global Approval Config and User Permissions seeded.');
  }

  console.log('✨ [CADON Zero-Config Setup] Database Setup and Audit Injections Completed Successfully.');
  return { success: true, message: 'Database setup complete with audit columns injected and demo data seeded.' };
}
