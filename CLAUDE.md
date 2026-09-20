# CADON-BOM AI Ver-03 (EGDesk 기반) 프로젝트 가이드 for Claude Code

이 문서는 **Claude Code(클로드 코드)**가 본 프로젝트의 **이지데스크(EGDesk) 기반 화면 구성, UI/UX 아키텍처, 데이터 연동 흐름**을 완벽하게 이해하고 개발할 수 있도록 작성된 공식 아키텍처 지침서입니다.

---

## 1. EGDesk 개발 환경 및 핵심 규칙 (Core Rules)

* **개발 서버 포트**: **`4005`** (`http://localhost:4005`)
  - ⚠️ 절대 3000이나 4000 포트로 가정하지 마십시오. EGDesk 연동 포트는 4005입니다.
* **EGDesk 플랫폼 API**: `http://localhost:8080`
* **언어 설정**: 모든 대화, 코드 주석, 화면 텍스트는 **한국어(한글)**를 기본으로 합니다.
* **통신 및 DB 래퍼**:
  - `egdesk-helpers.ts`: Next.js 전용 헬퍼 SDK (`apiFetch`, `queryTable`, `updateRows`, `insertRows` 등)
  - `egdesk.schema.ts`: 33개 실제 비즈니스 테이블 정의 (휴대용 단일 진실 공급원)
* **프레임워크**: Next.js 15.2.1 (App Router), Tailwind CSS v4, Three.js (WebGL 60 FPS 렌더링)

---

## 2. 전체 화면 라우팅 맵 (Page Routing Map)

시스템은 엔지니어링 견적 워크플로우에 맞춰 **3단계 파이프라인 + 관리자 센터**로 구성됩니다:

```
[메인 대시보드 (/cases)]
         │
         ▼
[1단계: 도면 등록 & BOM 검증 (/cases/[id])]
         │  ▲ (상단 파이프라인 1클릭 양방향 이동)
         ▼  │
[2단계: 3분할 통합 단가 검토 (/quotes/[id]/review)]
         │
         ▼
[3단계: 리비전 Diff & 견적 발행 (/quotes/[id]/diff or /publish)]
         │
[기준정보 마스터 관리 센터 (/admin/masters)]
```

---

## 3. 핵심 화면별 상세 UI/UX 구성 및 컴포넌트 계층

### 📌 1) [1단계] 도면 등록 & BOM 정합 검증 (`/cases/[id]`)
* **목적**: 123개 도면 시트가 포함된 원본 DWG 분석, 표제란 계층 판독, 조립도 자동 제외, 가상 BOM 정합
* **화면 레이아웃**:
  - **상단 내비게이터 (`PipelineNavigator.tsx`)**: 1단계(현재 활성), 2단계 바로가기
  - **중앙 도면/시트 뷰어 (`CadViewer.tsx`)**:
    - **모드 전환 탭**: `[2D CAD 벡터 도면 (WebGL 60 FPS)]` ↔ `[표제란 엑셀 시트 123개]`
    - **우측 툴바**: `[AutoCAD 원클릭 실행]`, `[⚙ CAD 설정]`, `[도면 시트 선택 드롭다운]`
  - **표제란 엑셀 시트 테이블**:
    - 다중 체크박스 대신 **1열에 `No.` 배치 (대안 A)**
    - 조립도 항목은 **`[📦 조립제외]` 뱃지** 부착 및 기본 견적 미포함 처리
    - 품번, 품명, 규격, 재질, 척도 인라인 수정 지원

---

### 📌 2) [2단계] 3분할 통합 단가 검토 (`/quotes/[id]/review`)
* **목적**: 도면 벡터 시각화 + 부품 그리드 + 실시간 공학 원가 산출 + 마스터 DB 학습이 한 화면에서 이뤄지는 **핵심 워크스페이스**
* **화면 분할 구조 (3-Pane Workspace Layout)**:

```
┌───────────────────────────────────────┬───────────────────────────────────────────┐
│ 1. 좌측 영역 (CAD 도면 벡터 뷰어)      │ 2. 우측 상단 영역 (견적 부품 그리드)        │
│    - ReviewCadViewer.tsx              │    - QuoteLineGrid.tsx                    │
│    - 1줄 통합 다크 슬레이트 툴바       │    - 조립도 자동 배제 (107개 가공품 전용)    │
│      [도면시트 ▾] [AutoCAD]            │    - 미확정 카운트 (미확정 N/107)           │
│      [풍선알림] [영역] [TXT] [CAD설정]  │    - 품목 클릭 시 좌측 도면 자동 줌인 연동  │
│    - 행 선택 시 해당 도면 자동 줌인      ├───────────────────────────────────────────┤
│    - 풍선 포커스 핀 및 하이라이트      │ 3. 우측 하단 영역 (상세 원가 산출 패널)     │
│                                       │    - CostBreakdownPanel.tsx               │
│                                       │    - 소재비/가공비/후처리비 직접 수정      │
│                                       │    - 별도 비용추가 1, 2, 3 직접 수정 창    │
│                                       │    - 단위원가 ⟷ 세부항목 양방향 실시간 합산 │
│                                       │    - [💾 이 단가를 마스터 DB에 저장] 버튼  │
│                                       │    - MasterRecommendationCard.tsx         │
│                                       │      (사내 마스터 DB Top-3 단가 추천)     │
└───────────────────────────────────────┴───────────────────────────────────────────┘
```

#### 🛠️ 우측 하단 `CostBreakdownPanel.tsx` 세부 구성:
1. **기본 3대 제조원가 (직접 수정 가능)**:
   - 소재비 (₩ 직접 입력)
   - 가공/공정비 (₩ 직접 입력)
   - 열처리/후처리비 (₩ 직접 입력)
2. **별도 비용추가 1, 2, 3 (직접 수정 가능)**:
   - 항목명 커스텀 지원 (예: `치공구/지그비`, `검사/성적서비`, `특수포장/운송비` 등)
   - 금액(₩) 입력 시 최종 단위원가에 실시간 자동 합산
3. **최종 단위원가 (합산 연동)**:
   $$\text{단위원가} = \text{소재비} + \text{가공비} + \text{후처리비} + \text{추가비 1} + \text{추가비 2} + \text{추가비 3}$$
   - 단위원가를 직접 고칠 경우 추가비용을 뺀 나머지 금액이 기본 3대 원가에 비례 재분배됨
4. **마스터 DB 영구 저장**:
   - `[이 단가를 마스터 DB에 저장]` 클릭 시 추가비용 명세가 `remark`에 함께 포함되어 `product_masters` 및 `price_masters`에 영구 축적됨

---

### 📌 3) [3단계] 리비전 Diff & 공식 견적 발행 (`/quotes/[id]/diff` or `/publish`)
* **목적**: 도면 설계 변경 시 이전 견적 단가 일괄 계승 및 2종 견적서 출력
* **견적서 2종 양식**:
  - **내부 심사용 (상세 원가 명세서)**: 재료비, 가공비, 추가비용, 마진율이 모두 표시된 원가 계산서
  - **고객 제출용 (대외 공식 견적서)**: 총 수량, 규격, 확정 공급단가, 세액만 정돈된 공식 인쇄물 (PDF/Excel)

---

### 📌 4) 기준정보(마스터) 관리 센터 (`/admin/masters`)
* **목적**: 사내 표준 부품 단가표 관리 및 가공 임률 설정
* **화면 구성**:
  - **상단 요약 통계 카드**: 6대 실무 분류(가공품, 판금/제관, 주조품, 규격철물, 전장/공압, 조립품) 보유 현황
  - **액션 툴바**:
    - **`[📥 엑셀 템플릿 다운로드]`**: `CADON_마스터기준정보_등록템플릿.xlsx` 즉시 다운로드 (가이드 시트 + 샘플 6종 내장)
    - **`[엑셀 일괄 업로드]`**: `.xlsx`, `.xls`, `.csv` 파일 직접 드래그 앤 드롭 및 자동 헤더 매핑
    - **`[+ 신규 품목 등록]`**: 단일 마스터 등록 모달
  - **탭 전환**: `[표준 품목 및 단가 대장]` ↔ `[소재 시세 & 가공 임률 설정]` (분체도장, 아노다이징, 레이저 절단 단가 등)

---

## 4. 핵심 컴포넌트 목록 및 파일 경로

| 컴포넌트 명 | 파일 경로 | 주요 역할 |
| :--- | :--- | :--- |
| `PipelineNavigator` | `src/components/common/PipelineNavigator.tsx` | 상단 3단계 파이프라인 1클릭 이동 네비게이션 바 |
| `CadViewer` | `src/components/CadViewer.tsx` | 2D WebGL CAD 벡터 뷰어 및 표제란 엑셀 시트 뷰어 |
| `WebGlCadViewer` | `src/components/WebGlCadViewer.tsx` | Three.js 기반 초고속 60 FPS GPU 렌더링 엔진 (도면 프레임/텍스트) |
| `ReviewCadViewer` | `src/components/review/ReviewCadViewer.tsx` | 2단계 전용 뷰어 래퍼 (풍선 알림 연동, 1줄 다크 슬레이트 툴바) |
| `QuoteLineGrid` | `src/components/review/QuoteLineGrid.tsx` | 2단계 견적 행 리스트 (조립도 배제, 미확정 카운트, 상태 토글) |
| `CostBreakdownPanel` | `src/components/review/CostBreakdownPanel.tsx` | 세부 원가 직접 수정, 별도비용 1·2·3, 마스터 DB 저장 |
| `MasterRecommendationCard` | `src/components/review/MasterRecommendationCard.tsx` | 과거 수주 단가 및 마스터 단가 Top-3 자동 추천 카드 |

---

## 5. 비즈니스 로직 및 코딩 시 주의사항 (Critical Rules)

1. **조립도(Assembly)는 견적 산출에서 반드시 제외**:
   - `qi.drawing_type === 'MAIN_ASSEMBLY'` 또는 `SUB_ASSEMBLY`, 품명에 '조립/assembly' 포함 시 `isAssembly = true`
   - 기본 필터(`filterType === 'ALL'`)에서는 조립도를 자동 숨김 처리하며, 견적 합계 금액(`totalCost`, `totalSupply`)에서도 배제해야 합니다.
2. **실시간 DB 비동기 저장 (Zero-Data-Loss)**:
   - 2단계에서 단가나 추가비용을 수정하면 즉시 `/api/quotes/${caseId}/confirm-line`을 비동기 호출하여 DB에 기록합니다. (1단계로 이동해도 작업 내용 유지)
3. **WebGL 60 FPS 성능 유지**:
   - 도면 캔버스 조작 시 불필요한 React State 재렌더링을 피하고 Three.js Ref 기반 On-demand 렌더링 패턴을 유지하십시오.
4. **포트 충돌 금지**:
   - 로컬 테스트는 무조건 `http://localhost:4005`를 사용하십시오.

---

## 6. 현재 데이터베이스 적재 현황 (Database Status)

> 상세 현황 문서: `CLAUDE_DATABASE_STATUS.md`

| 테이블명 | 한글 명칭 | 행 수 (Count) | 데이터 상태 |
| :--- | :--- | :---: | :--- |
| **`raw_bom_items`** | CAD 추출 Raw BOM | **2,488** | 123개 도면에서 추출된 원시 BOM 완벽 적재 |
| **`normalized_bom_items`** | 정규화 BOM 아이템 | **500** | 오탈자 교정 및 표준 명칭 후보 매핑 완료 |
| **`flattened_bom_items`** | 다단계 집계 BOM | **500** | 계층 전개 및 수량 가중치 합산 완료 |
| **`final_bom_items`** | 최종 확정 견적 BOM | **250** | 견적 투입 대상 확정 BOM |
| **`quotes`** | 견적서 마스터 | **9** | 활성 견적서 헤더 |
| **`quote_items`** | 견적서 명세 품목 | **1,000** | 견적서 부품 단가 및 공급가 데이터 |
| **`price_history_v2`** | 수량구간별 단가 이력 | **241** | 확정 단가 및 산출 근거(PRICE_BASIS) 학습 데이터 |
| `drawings` | 도면 시트 및 표제란 | 246 | A&G 도면 123개 시트 분석 데이터 |
| `cad_objects` | CAD 기하 엔티티 | 40,002 | WebGL 60 FPS 렌더링용 기하 데이터 |
