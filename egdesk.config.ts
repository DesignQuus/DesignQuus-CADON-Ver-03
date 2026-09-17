/**
 * EGDesk User Data Configuration
 * Generated at: 2026-09-17T13:43:03.174Z
 *
 * This file contains type-safe definitions for your EGDesk tables.
 */

export const EGDESK_CONFIG = {
  apiUrl: 'http://localhost:8080',
  tunnelUrl: 'https://tunneling-service.onrender.com/t/lee-mac-pc',
  apiKey: '48632c34-0fd1-4b53-b448-b8162e19b925',
} as const;

export interface TableDefinition {
  name: string;
  displayName: string;
  description?: string;
  /** Omitted or unknown until synced / counted */
  rowCount?: number;
  columnCount: number;
  columns: string[];
}

export const TABLES = {
  table1: {
    name: 'process_rates',
    displayName: '가공/공정 단가표',
    rowCount: 0,
    columnCount: 16,
    columns: ['id', '_version', 'process_code', 'process_name', 'unit_type', 'rate_amount', 'effective_date', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table2: {
    name: 'material_rates',
    displayName: '원자재 기준 시세표',
    rowCount: 0,
    columnCount: 17,
    columns: ['id', '_version', 'material_code', 'material_name', 'category', 'unit_price_per_kg', 'density', 'effective_date', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table3: {
    name: 'order_results',
    displayName: '견적 수주/실주 결과 대장',
    rowCount: 0,
    columnCount: 21,
    columns: ['id', '_version', 'quotation_case_id', 'case_no', 'quote_id', 'order_status', 'order_amount', 'lost_reason_category', 'lost_reason_detail', 'feedback_notes', 'registered_by', 'registered_at', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table4: {
    name: 'price_history_v2',
    displayName: 'v2.0 수량구간별 단가 이력',
    rowCount: 0,
    columnCount: 29,
    columns: ['id', '_version', 'part_master_id', 'part_key', 'quotation_case_id', 'quote_item_id', 'qty_tier', 'lot_quantity', 'material_cost', 'process_cost', 'subtotal_cost', 'margin_rate', 'unit_price', 'material_base_date', 'price_basis_type', 'basis_calc_json', 'is_ordered', 'confirmed_by', 'effective_from', 'effective_to', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table5: {
    name: 'part_masters_v2',
    displayName: 'v2.0 부품 식별 마스터',
    rowCount: 0,
    columnCount: 23,
    columns: ['id', '_version', 'part_key', 'part_group_key', 'company_id', 'drawing_no', 'revision', 'part_name', 'part_type', 'standard_material', 'specification', 'last_unit_price', 'last_quoted_at', 'usage_count', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table6: {
    name: 'part_cost_breakdowns',
    displayName: '부품별 제조원가 세부내역',
    rowCount: 0,
    columnCount: 23,
    columns: ['id', '_version', 'feature_id', 'quotation_case_id', 'material_cost', 'laser_cutting_cost', 'bending_cost', 'tapping_cost', 'machining_cost', 'surface_finish_cost', 'subtotal_cost', 'markup_rate', 'final_unit_price', 'calc_formula_json', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table7: {
    name: 'part_fabrication_features',
    displayName: '부품별 가공 피처 대장',
    rowCount: 0,
    columnCount: 30,
    columns: ['id', '_version', 'quotation_case_id', 'drawing_id', 'bom_item_id', 'process_type', 'material_code', 'material_density', 'bbox_width', 'bbox_length', 'bbox_thickness', 'cutting_length_total', 'pierce_count', 'bending_count', 'through_hole_count', 'tap_hole_count', 'part_weight_kg', 'surface_area_cm2', 'heat_treatment', 'surface_treatment', 'raw_features_json', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table8: {
    name: 'user_approval_permissions',
    displayName: '사용자별 결재/수정 세부 권한',
    rowCount: 1,
    columnCount: 17,
    columns: ['id', '_version', 'user_id', 'can_edit_own', 'can_approve_own', 'can_edit_others', 'can_approve_others', 'can_edit_price', 'can_approve_quote', 'updated_at', 'tenant_id', 'uuid', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table9: {
    name: 'user_company_access',
    displayName: '사용자-회사 접근 권한',
    rowCount: 4,
    columnCount: 14,
    columns: ['id', '_version', 'user_id', 'company_id', 'access_role', 'is_active', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table10: {
    name: 'projects',
    displayName: '프로젝트 관리',
    rowCount: 5,
    columnCount: 16,
    columns: ['id', '_version', 'company_id', 'project_code', 'project_name', 'description', 'status', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table11: {
    name: 'companies',
    displayName: '고객사/협력사 대장',
    rowCount: 2,
    columnCount: 15,
    columns: ['id', '_version', 'company_code', 'company_name', 'company_type', 'is_active', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table12: {
    name: 'users',
    displayName: '사용자 계정 대장',
    rowCount: 5,
    columnCount: 20,
    columns: ['id', '_version', 'login_id', 'password_hash', 'name', 'role', 'company_id', 'employee_number', 'phone', 'is_active', 'last_login_at', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table13: {
    name: 'audit_logs',
    displayName: 'audit_logs',
    rowCount: 0,
    columnCount: 10,
    columns: ['id', '_version', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table14: {
    name: 'user_activity_logs',
    displayName: '사용자 감사 활동 로그',
    rowCount: 102,
    columnCount: 20,
    columns: ['id', '_version', 'user_id', 'user_name', 'user_login_id', 'user_role', 'activity_type', 'quotation_case_id', 'case_name', 'details', 'ip_address', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table15: {
    name: 'dwg_conversion_runs',
    displayName: 'DWG 변환 실행 이력',
    rowCount: 5,
    columnCount: 27,
    columns: ['id', '_version', 'source_file_id', 'derived_file_id', 'provider', 'converter_version', 'source_dwg_signature', 'source_dwg_version', 'output_dxf_version', 'status', 'started_at', 'completed_at', 'duration_ms', 'exit_code', 'warning_count', 'warnings_json', 'error_code', 'error_message', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table16: {
    name: 'cad_parse_runs',
    displayName: 'CAD 파싱 실행 이력',
    rowCount: 2,
    columnCount: 18,
    columns: ['id', '_version', 'source_file_id', 'dxf_version', 'total_entities', 'entity_counts_json', 'global_bounds_json', 'status', 'duration_ms', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table17: {
    name: 'system_baselines',
    displayName: '골든 기준선 벤치마크',
    rowCount: 0,
    columnCount: 16,
    columns: ['id', '_version', 'golden_case_id', 'baseline_name', 'parser_version', 'metrics_json', 'created_by', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table18: {
    name: 'golden_cases',
    displayName: '골든 데이터셋 케이스',
    rowCount: 0,
    columnCount: 23,
    columns: ['id', '_version', 'project_id', 'quotation_case_id', 'case_code', 'name', 'description', 'data_classification', 'source_checksum', 'status', 'actual_drawing_count', 'actual_bom_count', 'actual_item_count', 'created_by', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table19: {
    name: 'approval_requests',
    displayName: '견적/단가 승인 결재 요청 대장',
    rowCount: 0,
    columnCount: 21,
    columns: ['id', '_version', 'quotation_case_id', 'request_type', 'requester_user_id', 'owner_user_id', 'reason', 'status', 'reviewed_by_user_id', 'review_comment', 'reviewed_at', 'expires_at', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table20: {
    name: 'excel_templates',
    displayName: '엑셀 템플릿 관리',
    rowCount: 0,
    columnCount: 20,
    columns: ['id', '_version', 'company_id', 'template_name', 'original_file_name', 'storage_path', 'template_type', 'version', 'is_active', 'is_default', 'created_by_user_id', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table21: {
    name: 'case_archives',
    displayName: '분석 스냅샷 아카이브',
    rowCount: 0,
    columnCount: 18,
    columns: ['id', '_version', 'quotation_case_id', 'archive_version', 'archive_name', 'drawings_count', 'bom_items_count', 'snapshot_data_json', 'created_by_user_id', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table22: {
    name: 'quote_exports',
    displayName: '견적서 엑셀 발행 이력',
    rowCount: 0,
    columnCount: 20,
    columns: ['id', '_version', 'quote_id', 'quote_version', 'template_id', 'file_name', 'storage_path', 'file_size', 'export_status', 'is_draft', 'exported_by_user_id', 'exported_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table23: {
    name: 'quote_items',
    displayName: '견적서 명세 품목',
    rowCount: 875,
    columnCount: 28,
    columns: ['id', '_version', 'quote_id', 'final_bom_item_id', 'master_id', 'item_no', 'master_code', 'item_name', 'specification', 'material', 'quantity', 'unit', 'unit_price', 'amount', 'price_source', 'price_status', 'drawing_no', 'remark', 'is_included', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table24: {
    name: 'quotes',
    displayName: '견적서 마스터',
    rowCount: 8,
    columnCount: 31,
    columns: ['id', '_version', 'quotation_case_id', 'quote_no', 'quote_version', 'company_id', 'project_id', 'status', 'currency', 'subtotal', 'discount_type', 'discount_rate', 'discount_amount', 'tax_rate', 'tax_amount', 'total_amount', 'quote_date', 'is_locked', 'created_by_user_id', 'approved_by_user_id', 'approved_at', 'override_reason', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table25: {
    name: 'manual_price_pool',
    displayName: '수기 단가 지식 풀',
    rowCount: 0,
    columnCount: 24,
    columns: ['id', '_version', 'item_name', 'specification', 'material', 'unit_price', 'remark', 'quotation_case_id', 'company_id', 'standard_name', 'standard_material', 'approval_count', 'last_used_at', 'source', 'created_by_user_id', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table26: {
    name: 'price_masters',
    displayName: '기준 단가 마스터',
    rowCount: 0,
    columnCount: 19,
    columns: ['id', '_version', 'master_id', 'company_id', 'price_type', 'unit_price', 'currency', 'effective_from', 'effective_to', 'is_active', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table27: {
    name: 'product_masters',
    displayName: '표준 마스터 품목 대장',
    rowCount: 0,
    columnCount: 19,
    columns: ['id', '_version', 'company_id', 'master_code', 'standard_name', 'category', 'specification', 'material', 'unit', 'status', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table28: {
    name: 'master_aliases',
    displayName: '마스터 품목 별칭 대장',
    rowCount: 0,
    columnCount: 18,
    columns: ['id', '_version', 'company_id', 'master_id', 'alias_name', 'alias_normalized', 'approval_count', 'rejection_count', 'scope', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table29: {
    name: 'master_candidates',
    displayName: '마스터 추천 매칭 후보',
    rowCount: 0,
    columnCount: 22,
    columns: ['id', '_version', 'normalized_item_id', 'master_id', 'master_code', 'standard_name', 'specification', 'material', 'rank', 'total_score', 'positive_evidence_json', 'negative_evidence_json', 'candidate_status', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table30: {
    name: 'bom_approval_records',
    displayName: 'BOM 승인/수정 이력',
    rowCount: 250,
    columnCount: 20,
    columns: ['id', '_version', 'quotation_case_id', 'normalized_item_id', 'selected_master_id', 'decision_type', 'decision_reason', 'difference_notes', 'is_override', 'approved_by_user_id', 'approved_at', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table31: {
    name: 'final_bom_items',
    displayName: '최종 확정 견적 BOM',
    rowCount: 250,
    columnCount: 23,
    columns: ['id', '_version', 'quotation_case_id', 'normalized_item_id', 'final_master_id', 'final_master_code', 'final_name', 'final_spec', 'final_material', 'final_quantity', 'final_unit', 'approval_status', 'approved_by_user_id', 'approved_at', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table32: {
    name: 'flattened_bom_items',
    displayName: '다단계 집계 BOM',
    rowCount: 250,
    columnCount: 21,
    columns: ['id', '_version', 'quotation_case_id', 'item_key', 'part_no', 'name', 'specification', 'material', 'total_quantity', 'unit', 'source_drawings_json', 'source_item_ids_json', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table33: {
    name: 'normalized_bom_items',
    displayName: '정규화 BOM 아이템',
    rowCount: 250,
    columnCount: 24,
    columns: ['id', '_version', 'quotation_case_id', 'raw_item_id', 'raw_name', 'normalized_name', 'search_name', 'direction', 'spec_candidate', 'material_candidate', 'quantity', 'unit', 'is_quote_included', 'exclude_reason', 'status', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table34: {
    name: 'raw_bom_items',
    displayName: 'CAD 추출 Raw BOM',
    rowCount: 1244,
    columnCount: 26,
    columns: ['id', '_version', 'quotation_case_id', 'source_file_id', 'drawing_no', 'row_index', 'item_no_raw', 'part_no_raw', 'name_raw', 'specification_raw', 'material_raw', 'quantity_raw', 'quantity_numeric', 'unit_raw', 'remark_raw', 'source_handles_json', 'status', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table35: {
    name: 'bom_areas',
    displayName: 'BOM 검출 영역',
    rowCount: 74,
    columnCount: 18,
    columns: ['id', '_version', 'quotation_case_id', 'source_file_id', 'drawing_no', 'table_type', 'bbox_json', 'confidence_score', 'status', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table36: {
    name: 'cad_objects',
    displayName: 'CAD 객체 기하 데이터',
    rowCount: 40002,
    columnCount: 19,
    columns: ['id', '_version', 'parse_run_id', 'handle', 'entity_type', 'layer', 'color', 'raw_text', 'bounding_box_json', 'geometry_data_json', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table37: {
    name: 'drawing_relationships',
    displayName: '도면 계층 관계',
    rowCount: 242,
    columnCount: 16,
    columns: ['id', '_version', 'quotation_case_id', 'parent_drawing_no', 'child_drawing_no', 'relationship_type', 'confidence_score', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table38: {
    name: 'drawings',
    displayName: '도면 시트 및 표제란',
    rowCount: 246,
    columnCount: 28,
    columns: ['id', '_version', 'quotation_case_id', 'source_file_id', 'drawing_index', 'drawing_no_raw', 'drawing_no_normalized', 'drawing_name_raw', 'drawing_name_normalized', 'revision', 'material', 'scale', 'drawing_type', 'is_quote_included', 'exclude_reason', 'frame_bbox_json', 'title_block_bbox_json', 'confidence_score', 'status', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table39: {
    name: 'uploaded_files',
    displayName: '업로드/파생 파일 관리',
    rowCount: 5,
    columnCount: 22,
    columns: ['id', '_version', 'quotation_case_id', 'original_file_name', 'stored_file_name', 'storage_path', 'file_type', 'file_role', 'derived_from_file_id', 'file_size', 'checksum', 'upload_status', 'uploaded_by_user_id', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table40: {
    name: 'quotation_cases',
    displayName: '견적의뢰 건 관리',
    rowCount: 2,
    columnCount: 20,
    columns: ['id', '_version', 'case_no', 'company_id', 'project_id', 'case_name', 'request_date', 'status', 'revision', 'quote_readiness', 'created_by_user_id', 'created_at', 'tenant_id', 'uuid', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table41: {
    name: 'system_approval_settings',
    displayName: '전사 결재 정책 설정',
    rowCount: 1,
    columnCount: 16,
    columns: ['id', '_version', 'cross_user_edit_policy', 'cross_user_approve_policy', 'require_admin_final_quote_approval', 'approval_valid_hours', 'is_approval_suspended', 'updated_by_user_id', 'updated_at', 'tenant_id', 'uuid', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table42: {
    name: 'cad_app_settings',
    displayName: '로컬 CAD 실행 경로',
    rowCount: 0,
    columnCount: 12,
    columns: ['id', '_version', 'key', 'value', 'updated_at', 'tenant_id', 'uuid', 'updated_by', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition,
  table43: {
    name: 'system_settings',
    displayName: '시스템 테넌트 설정 대장',
    rowCount: 1,
    columnCount: 13,
    columns: ['id', '_version', 'key', 'value', 'tenant_id', 'description', 'updated_at', 'updated_by', 'uuid', 'deleted_at', 'deleted_by', 'restored_at', 'restored_by']
  } as TableDefinition
} as const;


// Main table (first table by default)
export const MAIN_TABLE = TABLES.table1;


// Helper to get table by name
export function getTableByName(tableName: string): TableDefinition | undefined {
  return Object.values(TABLES).find(t => t.name === tableName);
}

// Export table names for easy access
export const TABLE_NAMES = {
  table1: 'process_rates',
  table2: 'material_rates',
  table3: 'order_results',
  table4: 'price_history_v2',
  table5: 'part_masters_v2',
  table6: 'part_cost_breakdowns',
  table7: 'part_fabrication_features',
  table8: 'user_approval_permissions',
  table9: 'user_company_access',
  table10: 'projects',
  table11: 'companies',
  table12: 'users',
  table13: 'audit_logs',
  table14: 'user_activity_logs',
  table15: 'dwg_conversion_runs',
  table16: 'cad_parse_runs',
  table17: 'system_baselines',
  table18: 'golden_cases',
  table19: 'approval_requests',
  table20: 'excel_templates',
  table21: 'case_archives',
  table22: 'quote_exports',
  table23: 'quote_items',
  table24: 'quotes',
  table25: 'manual_price_pool',
  table26: 'price_masters',
  table27: 'product_masters',
  table28: 'master_aliases',
  table29: 'master_candidates',
  table30: 'bom_approval_records',
  table31: 'final_bom_items',
  table32: 'flattened_bom_items',
  table33: 'normalized_bom_items',
  table34: 'raw_bom_items',
  table35: 'bom_areas',
  table36: 'cad_objects',
  table37: 'drawing_relationships',
  table38: 'drawings',
  table39: 'uploaded_files',
  table40: 'quotation_cases',
  table41: 'system_approval_settings',
  table42: 'cad_app_settings',
  table43: 'system_settings'
} as const;
