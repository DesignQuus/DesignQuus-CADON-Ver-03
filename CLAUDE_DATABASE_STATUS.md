# CADON-BOM AI Database Status for Claude (데이터베이스 현황 보고서)

> **문서 대상**: Claude (클로드) / Claude Code  
> **조회 시점**: 2026-09-20 (Phase 2-D 완료 기준)  
> **조회 도구**: `egdesk-helpers.ts`의 `executeSQL` (Read-only SELECT)  
> **기준 환경**: `development` (Project ID: `8dd35536-8cbb-4e1c-bb65-b35f2920cb03`)

---

## 1. 핵심 비즈니스 테이블 행 수 (Row Count) 실측 현황

클로드가 CADON 시스템의 백엔드 및 UI 로직을 분석하거나 쿼리를 작성할 때 참고해야 할 실제 데이터베이스 적재 현황입니다:

| No | 테이블명 (`table_name`) | 한글 테이블 명칭 | 행 수 (`count`) | 데이터 상태 및 특징 |
| :---: | :--- | :--- | :---: | :--- |
| 1 | **`material_rates`** | 원자재 기준 시세표 | **13** | SS400, S45C, SUS304, AL6061 등 표준 소재 밀도 및 kg당 단가 공식 시딩 완료 |
| 2 | **`process_rates`** | 가공/공정 단가표 | **16** | CNC머시닝, 선반, 레이저, 절곡, 열처리 등 16개 표준 공정 임률 시딩 완료 |
| 3 | **`part_fabrication_features`** | 부품별 가공 피처 대장 | **125** | 용지 테두리 오차 해소, CAD 실측 치수(DIMENSION/기하) 기반 125건 100% 적재 |
| 4 | **`part_cost_breakdowns`** | 부품별 제조원가 세부내역 | **125** | 조립도 0원 배제, 평균 오차율 7.60% 달성, calc_formula_json 100% 투명 기록 |
| 5 | **`product_masters`** | 표준 마스터 품목 대장 | **57** | 6대 실무 분류(가공 20, 판금 29, 구매 2, 조립 6) 표준 부품 풀 |
| 6 | **`master_aliases`** | 마스터 품목 별칭 대장 | **59** | 승인 별칭(FREE ROLLER-1, FREE ROLLER-2 등) 다변화 풀 |
| 7 | **`master_candidates`** | 마스터 추천 매칭 후보 | **132** | Top-1 정확도 100% 다차원 스코어링 후보 풀 |
| 8 | **`price_history_v2`** | 수량구간별 단가 이력 | **241** | 순수 Ground Truth 정답셋 100% 무결성 보존 |
| 9 | **`normalized_bom_items`** | 정규화 BOM 아이템 | **500** | 대상 케이스(`case_1789766302590`) 125건 포함 |
| 10 | **`raw_bom_items`** | CAD 추출 Raw BOM | **2,488** | 도면 표/텍스트에서 추출된 원시 BOM 데이터 완벽 적재 |
| 11 | **`flattened_bom_items`** | 다단계 집계 BOM | **500** | 도면 계층 구조 전개 및 수량 가중치 합산 완료 |
| 12 | **`final_bom_items`** | 최종 확정 견적 BOM | **250** | 검수자 승인 및 견적 투입 대상 확정 BOM |
| 13 | **`drawings`** | 도면 시트 및 표제란 | **492** | 대상 케이스 도면 123건 (A&G 123개 도면 프레임 및 표제란 완비) |
| 14 | **`cad_objects`** | CAD 객체 기하 데이터 | **80,004** | 대상 parse_run 당 20,001건 (치수, 형상선, 텍스트 엔티티 완비) |
| 15 | **`bom_areas`** | BOM 검출 영역 | **148** | 대상 케이스 도면 내 BOM 검출 영역 37건 바운딩 박스 완비 |

---

## 2. 클로드(Claude) 개발 시 중요 가이드라인

1. **개발 환경 규칙**:
   - 개발 서버 포트는 **`4005`** (`http://localhost:4005`)입니다. (3000이나 4000 가정 금지)
   - EGDesk 플랫폼 API: `http://localhost:8080`.
   - 모든 대화, 코드 주석, 화면 텍스트는 **한국어(한글)**로 작성해야 합니다.
2. **데이터 접근 규칙**:
   - 데이터 접근은 반드시 **`egdesk-helpers.ts`** 경유 (`executeSQL`, `queryTable`, `insertRows`, `updateRows`, `deleteRows`).
   - `egdesk.schema.ts`가 단일 진실 공급원이며, 신규 테이블 생성은 엄격히 금지됩니다.
3. **비즈니스 룰**:
   - **조립도 제외**: 품명에 `조립` / `ASSEMBLY`가 포함되거나 `drawing_type`이 `MAIN_ASSEMBLY` / `SUB_ASSEMBLY`인 품목은 단품 가공비가 `0원`이며, 견적 합산에서 배제되어야 합니다.
   - **임의 기본값 금지**: 도면 정보가 없는 품목은 임의 기본값(SS400 등)을 넣지 말고 `NULL`로 엄격히 보존해야 합니다.
4. **Phase 3(MRP-lite) 착수 준비 완료**:
   - 원가 엔진의 평균 오차가 **7.60%**(20% 이하 누적 달성률 93.4%)로 정밀 보정되었으므로, 안심하고 Phase 3 자재소요 산출 개발로 진입할 수 있습니다.
