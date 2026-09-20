# CADON-BOM AI Ver-03 — 클로드(Claude Code) 작업 인계 및 종합 실측 현황 보고서

> **수신**: Claude Code / Claude 엔지니어  
> **발신**: Antigravity Pair Programmer  
> **기준 일시**: 2026-09-20  
> **환경**: Next.js 15 (Port 4005) / EGDesk API (Port 8080) / SQLite (via `egdesk-helpers.ts`)  
> **프로젝트 ID**: `8dd35536-8cbb-4e1c-bb65-b35f2920cb03` (개발환경: `development`)  
> **검증 대상 케이스**: `case_1789766302590` (QT-20260918-002)

---

## 1. 정답셋 오염 규명 및 원가 엔진 원칙 (핵심 요약)

1. **`price_history_v2` (241건)는 Ground Truth로 사용 불가**:
   - 241건 중 91.28%(220건)가 과거 알고리즘 수식의 출력값(`_MODEL`)입니다.
   - 케이스 간 동일 부품 115건 전수가 20% 초과 편차를 보이며, 최대 편차가 **845.68%**에 달하는 내부 모순 데이터입니다.
   - **향후 어떤 검증에도 이 데이터를 정답셋으로 쓰지 마십시오.**
2. **7.60% 오차율 공식 폐기 및 성능 미측정 간주**:
   - 과거 수식 역산으로 맞춘 계수(스크랩율 1.08, 수량계수 1.05, 공수 0.40~0.46h, 박판 6,100원)는 근거가 소멸되었습니다.
   - 향후 원가 재검증은 실무자가 직접 매긴 **`HUMAN_VERIFIED`** 단가를 통해서만 수행해야 합니다.
3. **D-1~D-5 공학적 수정은 유효 자산으로 유지**:
   - 도면 실측 치수 추출(DIMENSION 레이어), 조립도 단품 원가 0원 배제, 표면처리 기본값 오염 제거, 열처리 복원은 물리적으로 옳은 수정으로 영구 유지됩니다.

---

## 2. Phase 3 (MRP-lite) 자재소요 산출 실측 및 3대 이상치 규명

### 2-1. 총 소요 수량 정밀 구분 (156 vs 118 규명)
- **가공 및 판금 제조 단품**: **118 EA**
- **시중 구매품 및 부자재**: **38 EA**
- **전체 단품 총계**: **156 EA** ($118 + 38 = 156$)

### 2-2. 판재 두께 전수 t3 원인 규명 (기본값 채움 결함)
- **실측치**: `part_fabrication_features` 125건 중 **106건(84.8%)이 정확히 `bbox_thickness = 3.0`**으로 기록됨.
- **원인**: 2D 도면 특성상 Z축 두께가 도면 BOM 텍스트에 기재되지 않은 경우, 스크립트(`apply-final-phase2d.ts`)에서 무조건 `let thickness = 3.0`으로 채우도록 하드코딩되어 있었음.
- **조치 방침**: 도면 텍스트에서 파싱 불가능한 품목은 임의 기본값 3.0을 배제하고 `NULL`로 보존하여 **실무자 확인 대상(Pending Review)**으로 분류해야 함.

### 2-3. 58 EA 중량 0kg 및 집계 누락 실측 규명
- **실측치**: 시스템 총 원자재 소요 중량 **84.687 kg**에 **58 EA의 중량이 완전히 누락(0.000 kg)**되어 있음.
- **원인**: 58개 부품은 봉재/축류가 아니라, `drawings` 및 `drawing_relationships` 계층에는 존재하는 도번(`240314-03-001` 등)이 `part_fabrication_features` 맵과 도번 불일치로 매칭되지 못해 `mrp-engine.ts`의 fallback 로직(`SS400`, `t0`, `0kg`)으로 빠진 **도면-BOM 매칭 미연결 부품**이었음.
- **조치 방침**:
  1. `drawings` 테이블의 도면 정보(`material`, 형상 크기)를 직접 결합하여 58개 결측 부품의 실제 중량을 산출하고 84.687 kg에 재합산해야 함.
  2. 판재(Sheet), 환봉(Round Bar, m/kg 단위), 형강(Structural Steel)으로 자재 분류 체계를 정립해야 함.

---

## 3. 조건 준수 현황 요약

- **조건 A (금액 완전 배제)**: 엔진(`src/lib/mrp-engine.ts`), API, 화면(`src/app/quotes/[id]/mrp/page.tsx`) 전 영역에서 단가/금액 일체 배제 (수량 EA, 중량 kg, 면적 m², 원판 Sheets만 산출).
- **조건 B (케이스 격리 바인딩)**: 모든 쿼리에 `WHERE quotation_case_id = 'case_1789766302590'` 하드 바인딩.
- **조건 C (3대 내부 보존 법칙)**: 외부 정답셋 없이도 수량 보존(156 EA), 중량 보존(단품합 = 소재집계합 오차 0.0000kg), 순환 루프 0건 검증 완료.

---

## 4. 실무 검토자용 대표 부품 25선 엑셀 템플릿 준비 완료

실무 검토자가 실제 발주 단가를 기입하여 순수 Ground Truth를 구축할 수 있도록 엑셀 파일이 준비되었습니다:

- **파일 위치**: [`C:\dev\CADON-Ver-03\HUMAN_VERIFICATION_25_PARTS.xlsx`](file:///c:/dev/CADON-Ver-03/HUMAN_VERIFICATION_25_PARTS.xlsx)
- **대상 부품 25선**:
  - 가공품 10선: `FREE ROLLER`(3.99kg), `SPACER COLLAR`(S45C), `HINGE SHAFT`(S45C), `HINGE BRACKET`, `STOPPER`, `LOCKING PIN`(열처리 대상품), `STOPPER PAD`, `MAIN CHAIN DRIVE-1`, `ROLLER POST`(AL6061), `TENSION BRACKET-1`(6.51kg)
  - 판금품 7선: `MAIN C/V DRIVE COVER`(4.11kg), `MAIN C/V DRIVE END COVER`, `MAIN C/V RETURN END COVER`, `SUB C/V SHAFT COVER`(3.03kg), `SUB C/V RETURN END COVER`, `BRACKET COVER-A`, `SENSOR COVER`(SUS304 박판)
  - 구매품 8선: `CDQ2B63-25DMZ-A93L`(에어 실린더 2 EA), `FLOATING JOINT`, `LMF16UU`(직동 베어링), `ITOH`(모터롤러), `MISUMI`(스프로킷), 표준 센서 및 볼트류
- **입력 열**: `실무 검토 단가(원)` 및 `단가 산출 근거 / 비고`
- **DB 적재 정책**: 실무자가 입력한 단가는 `price_basis_type = 'HUMAN_VERIFIED'`, `confirmed_by = 'USER_EXPERT'`로 적재하여 기존 241건 오염 데이터와 100% 분리 보관.

---

## 5. 클로드(Claude) 작업 환경 및 가이드라인

1. **포트 규칙**: Next.js 개발 서버는 **`4005`** (`http://localhost:4005`). (3000/4000 가정 금지)
2. **언어 규칙**: 대화, 코드 주석, 화면 텍스트 모두 **한국어(한글)** 필수.
3. **DB 접근**: 반드시 **`egdesk-helpers.ts`** 경유 (`egdesk.schema.ts`가 단일 진실 공급원, 신규 테이블 생성 금지).
4. **MRP 작업 화면**: `http://localhost:4005/quotes/case_1789766302590/mrp`
5. **빌드 상태**: `npm run build` 오류 0건 통과 완료 (`Exit code 0`).
