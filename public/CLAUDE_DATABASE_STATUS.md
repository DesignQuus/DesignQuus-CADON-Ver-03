# CADON-BOM AI Database Status for Claude (데이터베이스 현황 보고서)

> **문서 대상**: Claude (클로드) / Claude Code  
> **조회 시점**: 2026-09-20  
> **조회 도구**: `egdesk-helpers.ts`의 `executeSQL` (Read-only SELECT)  
> **기준 환경**: `development` (Project ID: `8dd35536-8cbb-4e1c-bb65-b35f2920cb03`)

---

## 1. 요청 10개 핵심 테이블 행 수 (Row Count) 현황

클로드가 CADON 시스템의 백엔드 및 UI 로직을 분석하거나 쿼리를 작성할 때 참고해야 할 실제 데이터베이스 적재 현황입니다:

| No | 테이블명 (`table_name`) | 한글 테이블 명칭 | 행 수 (`count`) | 데이터 상태 및 특징 |
| :---: | :--- | :--- | :---: | :--- |
| 1 | **`raw_bom_items`** | CAD 추출 Raw BOM | **2,488** | 도면 표/텍스트에서 추출된 원시 BOM 데이터 완벽 적재 |
| 2 | **`normalized_bom_items`** | 정규화 BOM 아이템 | **500** | 오탈자 교정, 방향 분리, 표준 품명 매핑 완료 데이터 |
| 3 | **`master_candidates`** | 마스터 추천 매칭 후보 | **0** | 마스터 품목 자동 매칭 알고리즘 실행 대기 중 |
| 4 | **`flattened_bom_items`** | 다단계 집계 BOM | **500** | 도면 계층 구조 전개 및 수량 가중치 합산 완료 |
| 5 | **`final_bom_items`** | 최종 확정 견적 BOM | **250** | 검수자 승인 및 견적 투입 대상 확정 BOM |
| 6 | **`quotes`** | 견적서 마스터 | **9** | 현재 생성 및 관리 중인 견적서 마스터 헤더 |
| 7 | **`quote_items`** | 견적서 명세 품목 | **1,000** | 견적서에 포함된 부품별 단가, 공급가, 제외 여부 데이터 |
| 8 | **`part_fabrication_features`** | 부품별 가공 피처 대장 | **0** | 절단길이, 절곡수, 탭수 등 피처 추출 대기 |
| 9 | **`part_cost_breakdowns`** | 부품별 제조원가 세부내역 | **0** | 재료비/가공비/후처리비 세부 산출식 로그 |
| 10 | **`price_history_v2`** | 수량구간별 단가 이력 | **241** | 검토자가 확정한 단가 및 산출 근거(PRICE_BASIS) 이력 (자가 학습 풀) |

---

## 2. 추가 핵심 테이블 데이터 현황 (참고용)

* **`quotation_cases`** (견적의뢰 건): **2건** (활성 케이스: `case_1789766302590` 등)
* **`drawings`** (도면 시트 및 표제란): **246건** (A&G 123개 도면 시트 분석 완료)
* **`cad_objects`** (CAD 기하 엔티티): **40,002건** (WebGL 60 FPS 렌더링용 기하 데이터)
* **`bom_areas`** (도면 내 BOM 검출 영역): **74건**
* **`uploaded_files`** (원본 DWG 및 파생 DXF/SVG): **6건**

---

## 3. 클로드(Claude) 개발 시 중요 가이드라인

1. **활성 데이터가 풍부한 핵심 테이블을 활용할 것**:
   - 2단계 단가 검토 개발 시: `quote_items`(1,000건)와 `price_history_v2`(241건)를 우선 조회하여 단가 추천 로직을 테스트하세요.
   - 1단계 도면/BOM 정합 개발 시: `drawings`(246건)와 `raw_bom_items`(2,488건), `normalized_bom_items`(500건)를 기준으로 쿼리하십시오.
2. **데이터 접근은 반드시 `egdesk-helpers.ts`를 경유할 것**:
   - `executeSQL(sql)`: 복잡한 조인 및 SELECT 쿼리 수행 시 사용
   - `queryTable(tableName, options)`: 단일 테이블 필터링 및 페이징 시 사용
   - `updateRows(tableName, options)`: 단가 및 상태 갱신 시 사용
3. **조립도 제외 비즈니스 룰 준수**:
   - `quote_items` 및 `drawings` 조회 시 `drawing_type`이 `MAIN_ASSEMBLY` 또는 `SUB_ASSEMBLY`이거나 `is_included = 0`인 행은 견적 금액 합산에서 배제해야 합니다.
4. **환경 변수**:
   - 개발 환경 DB를 대상으로 작업할 때는 `.env.development.local`의 `NEXT_PUBLIC_EGDESK_ENV=development` 설정을 유지해야 합니다.
