# Project Agent Rules

<!-- BEGIN:egdesk-dev-context -->
## EGDesk Development Context

EGDesk opened this project with the dev server on **port 4005** (http://localhost:4005, coding (dev)).
Do not assume port 3000 or 4000. Use port 4005 for local preview and dev commands.
EGDesk MCP/API runs at http://localhost:8080.

See `.agents/rules/egdesk-dev-context.md` for full details.
<!-- END:egdesk-dev-context -->

## 개발 서버 포트 기준 규칙 (EGDesk Port Rule)
- **절대 원칙**: 개발 서버는 항상 **EGDesk가 호스팅하는 서버(EGDesk 패널의 `DEV` 주소)** 를 기준으로 진행합니다. (사용자 확정 지시)
- EGDesk는 실행할 때마다 포트를 다시 할당할 수 있습니다(예: 4005 → 4006). 고정 번호를 가정하지 말고, 작업 전 `netstat`/HTTP 응답으로 EGDesk 서버 포트를 확인합니다. `.agents/rules/egdesk-dev-context.md`의 번호가 실제와 다르면 실제 EGDesk 포트를 우선합니다.
- 최근 확인된 EGDesk DEV 포트: **`4006`** (http://localhost:4006, 2026-10-04 기준)
- 4003(`npm run dev` 기본값), 4007 등 EGDesk가 아닌 별도 개발 서버를 임의로 띄우거나 그 포트를 기준으로 테스트·안내하지 않습니다.
- EGDesk 서버가 떠 있지 않으면 다른 포트로 우회하지 말고, 사용자에게 EGDesk에서 프로젝트 서버를 실행하도록 안내합니다.

## 언어 설정 (Language Preference)
- 사용자와의 모든 대화, 설명 및 응답은 반드시 **한국어(한글)**로 작성합니다.

## 표준 UI/UX 가이드라인: 텍스트 말줄임 및 인라인 오버레이 툴팁 (SmartTruncateTooltip)
- 프로젝트 내에서 긴 텍스트(도면명, 건명, 품명, 고객사/프로젝트명 등)가 폭 제한으로 말줄임(`truncate`)될 때, 반드시 아래 표준 컴포넌트를 재사용합니다:
  - **컴포넌트 경로**: `src/components/common/SmartTruncateTooltip.tsx`
  - **디자인 및 인터랙션 원칙**:
    1. **바탕색**: 백색 (`bg-white`)
    2. **테두리**: 먹 70% 가는 라인 (`border border-neutral-700`)
    3. **모서리**: 5픽셀 라운드 (`rounded-[5px]`)
    4. **위치(인라인 오버레이)**: 돌출 삼각형 꼬리표 없이, 텍스트 위치를 바로 덮는 인라인 오버레이 방식(`top-1/2 -translate-y-1/2 -left-2`)으로 띄워 상하 행 및 헤더 선택을 방해하지 않음.
    5. **1-클릭 복사**: 설명 텍스트 없이 우측에 미니멀한 복사 아이콘(`Copy` / `Check`)만 배치.

## 도면 렌더링 기술 보존 원칙 (Drawing Rendering Freeze Rule)
- **절대 원칙**: 사용자의 명시적이고 구체적인 변경 지시가 없는 한, 현재 확립된 **도면 렌더링 기술 및 파이프라인(WebGL 60FPS 벡터/텍스트/래스터 뷰어, HD 벡터 SVG 렌더러, DXF 파서 및 프레임 기하 렌더링 체계)은 절대 임의로 변경하거나 수정/교체하지 않습니다.**
- 현재 렌더링 품질이 검증 완료되었으므로, 관련 렌더러 및 파이프라인 파일(`scripts/cad_webgl_exporter.py`, `scripts/vector_svg_renderer.py`, `src/components/WebGlCadViewer.tsx`, `scripts/sheet_frame_engine.py` 등)의 핵심 구현을 온전히 보존(Immutable)합니다.

### 핵심 4대 렌더링 표준 기술 (Permanent Core Standards)
1. **Zero Override Principle (고유 레이어 색상 및 1px 세선 보존 원칙)**:
   - 모델 공간의 모든 엔티티(LINE, LWPOLYLINE, ARC, CIRCLE 등)는 도곽/그룹핑 박스 감지 여부와 상관없이 DXF 본래의 레이어/엔티티 색상(Magenta 6번, White 7번, Red 1번, Yellow 2번 등)과 정밀 1px 캐드 세선을 그대로 유지합니다 (`add_role_seg` 임의 주입 금지, `num_heavy: 0`).
   - 블록 내부(`promote_sheet_frames`)에서도 명시적 색상(`col > 0`)이 지정된 경우 본래 색상과 1px 세선을 보존하여, 3px 두께의 형광 박스로 일괄 왜곡되는 현상을 원천 방지합니다.
2. **Text LOD & Full Coverage Principle (시방서 및 전량 텍스트 표출 원칙)**:
   - 최소 표시 픽셀 높이 `minPxH = 0.8px` (정지 시 원경에서도 시방서 표 `* SPECIFICATION *`, `LINE SPEED` 및 주기 텍스트의 윤곽이 누락 없이 표출됨).
   - 최대 텍스트 렌더링 한도 `maxAllowedTexts = 30,000` (도면 내 1만 개 이상의 텍스트가 잘림 없이 100% 전량 표출).
3. **Adaptive Tessellation Principle (CNC/AutoCAD 기준 곡선 무결성 원칙)**:
   - Sagitta 허용 오차 $\le 0.05\text{mm}$ 기반 적응형 분할(32~256 스텝)로 원/호/타원/스플라인/불지 곡선이 각지지 않고 AutoCAD 원본과 동일하게 매끄러운 곡선으로 유지됩니다.
4. **Spacious Viewport & HUD Clearance Principle (뷰포트 여백 원칙)**:
   - 오버뷰 여백 18%(`margin = 1.18`) 및 상단 클리어런스(`topPadding = spanY * 0.08`)를 통해 상단 플로팅 HUD 뱃지에 도면 상단부가 가려지지 않고 온전히 시야에 들어오도록 보장합니다.

## 표준 입력 규칙: 전화번호/휴대폰 번호 자릿수 자동 하이픈('-') 포매팅 (Phone Auto-Hyphenation Rule)
- **절대 원칙**: 시스템 내 모든 전화번호, 휴대폰 번호, 연락처 입력 필드(사원 등록, 정보 수정, 고객사 연락처, 견적 담당자 등)에서는 사용자가 숫자를 입력할 때 자릿수에 맞춰 자동으로 하이픈(`-`)이 삽입되어야 합니다.
- **포맷 유틸리티**: `src/lib/formatters.ts` 내 `formatPhoneNumber(val: string): string` 표준 함수 사용.
- **지원 규격**:
  - 휴대폰 번호: `010-XXXX-XXXX` (11자리), `011-XXX-XXXX` (10자리)
  - 일반 지역번호: 서울 `02-XXXX-XXXX` / `02-XXX-XXXX`, 경기/지방 `031-XXX-XXXX` / `031-XXXX-XXXX`
  - 전국 대표번호: `1588-XXXX`, `1544-XXXX`, `1600-XXXX` 등 (8자리)
  - 최대 길이 제한: 숫자 11자리 기준 하이픈 포함 최대 13자(`maxLength={13}`).

## 표준 리스트 순서 정렬 규칙: 하이브리드 리오더링 (Hybrid Reordering & Zero Layout Shift)
- **절대 원칙**: 부서 목록, 공정 순서, 품목 분류 등 사용자가 표시 순서를 직접 변경해야 하는 모든 정렬 리스트 UI에서는 **마우스 드래그 앤 드롭 핸들(⋮⋮)과 원클릭 화살표 버튼(▲ / ▼)을 반드시 함께 병행 제공**합니다.
- **사용자 표준 요청 명령어 (Trigger Phrase)**: 사용자가 **"순서변경 기능을 넣어줘"**(또는 유사한 표현)라고 요청하면, 추가 질문 없이 본 하이브리드 리오더링(드래그 앤 드롭 + 화살표 이동 병행 및 제로 레이아웃 시프트) 규격을 해당 목록 UI에 즉시 구현합니다.
- **핵심 구현 지침**:
  1. **하이브리드 조작 체계 (Hybrid Controls)**:
     - **장거리 이동**: 좌측 전용 드래그 핸들(GripVertical ⋮⋮)을 잡고 원하는 위치로 슥 끌어다 놓기(Drag & Drop). 손가락 커서와 항목이 일체화되어 마우스를 쫓아다닐 필요 없이 1회 제스처로 완료.
     - **단거리 1칸 미세 이동**: 우측의 ▲ (위로) / ▼ (아래로) 화살표 버튼으로 1클릭 미세 조정.
  2. **0ms 즉각 반응 (Zero-latency Optimistic Update)**:
     - 조작 즉시 로컬 상태를 변경하여 지연(0ms) 없이 화면을 재배치.
     - 네트워크 통신 대기 중 화살표 버튼을 잠그지(disabled) 않아, 마우스 연타 시 씹힘이나 지연이 전혀 없어야 함 (맨 위 ▲, 맨 아래 ▼만 경계 가드로 비활성화).
  3. **스마트 디바운스 백그라운드 자동 저장 (350ms Debounce)**:
     - 연속 조작 시 불필요한 반복 네트워크 요청을 방지하고, 조작이 멈춘 후 350ms 뒤 최종 순서만 백엔드에 1회 안전하게 영구 저장.
  4. **제로 레이아웃 시프트 (Zero Layout Shift / 모달창 흔들림 방지)**:
     - 순서 변경 시 모달 높이를 가변적으로 밀어내는 팝업 알림 배너 주입을 금지.
     - 모달창 컨테이너에 고정 높이(h-[600px], shrink-0)를 부여하고, 하단에 고정 높이 미니멀 인디케이터(순서 변경 저장 중... / ✓ 순서 자동 저장 완료)를 배치하여 모달창 외곽이 1픽셀도 흔들리지 않도록 유지.

## 표준 데이터 갱신 및 스크롤 보존 규칙: 사일런트 백그라운드 싱크 & 스크롤 튕김 원천 방지 (Silent Background Sync & Zero Scroll Jump Rule)
- **절대 원칙**: 데이터 수정(PUT/PATCH), 등록, 상태 토글, 삭제 후 테이블/리스트를 재조회(refetch)할 때, **전체 화면을 로딩 스피너로 교체하여 기존 행을 언마운트하는 행위를 절대 금지**합니다 (`setIsLoading(true)` 재호출 금지).
- **스크롤 튕김의 원인**: 기존 데이터 행들이 순간적으로 사라지면 문서 전체 높이가 줄어들고(Collapse), 브라우저가 화면 스크롤 위치를 잃어 강제로 맨 위(`scrollY = 0`)로 튕겨 올라갑니다.
- **핵심 구현 지침**:
  1. **사일런트 백그라운드 동기화 (`fetchData(isSilent = true)`)**:
     - 페이지 최초 진입 시에만 전체 로딩 스켈레톤/스피너(`isSilent = false`)를 표출합니다.
     - 데이터 추가/수정/삭제 후 재조회 시에는 반드시 `isSilent = true`로 호출하여, 기존 UI와 테이블 높이를 온전히 유지한 채 데이터만 조용히 갱신합니다.
  2. **낙관적 업데이트 (Optimistic UI)**:
     - 모달 저장 즉시 로컬 상태(React state)를 0ms로 선반영하고 모달을 닫아 즉각적인 피드백을 제공합니다.
  3. **스크롤 위치 앵커링 (Scroll Position Anchor)**:
     - 저장 버튼 클릭 시점의 `window.scrollY`를 기억하고, 모달 닫힘 및 데이터 갱신 완료 후에도 사용자가 보고 있던 위치를 1픽셀의 오차 없이 그대로 유지합니다.
  4. **비침습형 플로팅 토스트 (Floating Toast Notifications)**:
     - 작업 성공/실패 메시지는 본문 레이아웃을 밀어내는 상단 인라인 배너 대신, **우측 상단 플로팅 토스트(`fixed top-6 right-6 z-[80] shadow-lg`)**로 띄워 페이지 전체의 높이 변화(CLS / Layout Shift)를 100% 방지합니다.

## 표준 리스트/테이블 행번호(순번) 필수 표출 규칙 (Mandatory Row Numbering Rule)
- **절대 원칙**: 프로젝트 내의 모든 데이터 테이블 및 리스트 UI(대시보드 접수 현황, 최근 견적서 목록, 견적서 관리 대장, 임직원 관리, 고객사 관리 등)에서는 **항상 좌측 맨 첫 번째 열에 직관적인 행번호(No. / 번호 / 순번)를 반드시 표출**합니다.
- **핵심 구현 지침**:
  1. **페이지네이션 연동 글로벌 순번 계산**:
     - 페이지가 나뉘는 테이블의 경우, 단순 1부터 다시 세지 않고 전체 데이터 기준의 실제 글로벌 인덱스(`(currentPage - 1) * pageSize + idx + 1`)를 정확히 계산하여 표출합니다.
     - 예: 1페이지(1~10), 2페이지(11~20), 3페이지(21~30)...
  2. **시각적 정렬 및 타이포그래피 표준**:
     - 자릿수 변화에도 흔들림이 없도록 모노스페이스 숫자(`font-mono`), 중앙 정렬(`text-center`), 적절한 너비(`w-12` 또는 `w-14`), 차분한 톤(`text-slate-400 font-bold`)을 적용합니다.
     - 대시보드 요약 테이블 등 세련된 스타일이 필요한 곳은 `01`, `02` 형태의 두 자리 패딩 표기를 활용합니다.
  3. **검색 및 필터링 시 순번 무결성**:
     - 검색어 입력이나 상태 필터링 시에도 현재 필터링된 결과물에 맞춰 1번부터 차례대로 매끄럽게 재정렬 표출되어야 합니다.

## 표준 도면 표제란 및 고객사 자동 인식 규칙 (Title Block & Customer Auto-Detection Rule)
- **절대 원칙**: 특정 도면이나 특정 회사명(예: 엠브이텍, 세창 등)을 임의로 하드코딩하지 않으며, **어떠한 제조/가공 CAD 도면이 입력되더라도 아래의 범용 4단계 인식 체계와 엄격한 라벨 정규화 원칙에 따라 고객사를 100% 정밀하게 식별하고 마스터에 자동 연동**합니다.
- **핵심 구현 지침**:
  1. **블랙리스트 완전 정규화 원칙 (Normalized Label Blacklist Rule)**:
     - 표제란 검출기(`scripts/title_block_detector.py`)에서 후보 텍스트 필터링 시, 공백/특수문자/대소문자가 완전히 제거된 정규화 세트(`LABEL_BLACKLIST_CLEAN`, `is_label_blacklisted`)를 반드시 사용합니다.
     - `CUSTOMER` 라벨 주변에 수직/수평으로 밀접한 다른 헤더(`PROJECT NO.`, `DWG NO.`, `TITLE`, `SCALE`, `REV`, `DESCRIPTION`, `SPECIFICATION` 등)가 0.1mm 단위의 거리 편차로 인해 실제 고객사명보다 우선 채택되는 현상을 원천 방지합니다.
     - 날짜 패턴(`YYYY.MM.DD`, `YYYY-MM-DD` 등) 및 프로젝트 번호 패턴(`XXXX-XXX`)은 고객사명 후보에서 엄격히 제외합니다.
  2. **범용 4단계 고객사 인식 체계 (4-Level Customer Hierarchy)**:
     - **1단계 (표준 라벨 공간 탐색)**: `CUSTOMER`, `CLIENT`, `BUYER`, `ORDERER`, `고객사`, `발주처`, `발주사`, `수요처`, `납품처` 등 국·영문 표준 라벨의 공간 근접도 기반 추출.
     - **2단계 (무라벨 법인 식별자 패턴)**: 라벨이 없는 자유 양식 도면은 `(주)`, `㈜`, `주식회사`, `CO., LTD.`, `INC.`, `CORP.`, `LLC`, `株式会社`, `有限公司` 등의 법인 접미어를 탐색하고, 반복 등장하는 자사(공급자) 명칭을 제외한 의뢰 고객사 선별.
     - **3단계 (전 시트 교차 상속, `customer_global`)**: 1번 시트(메인 조립도)에만 표제란 고객사가 존재하고 하위 단품 가공도에 생략된 경우, 도면 세트 전체에서 가장 신뢰도가 높은 고객사를 모든 시트에 일괄 상속.
     - **4단계 (제미나이 AI 심층분석 마스터 동기화)**: AI 분석(`ai_insights`)에서 판별된 고객사(`detectedCompany`)가 유효하고 견적 케이스가 `comp_unassigned`일 경우, 즉시 고객사 마스터(`companies`)에 자동 등록/연결하고 대시보드 캐시를 즉시 갱신(`invalidateCasesCache()`).
  3. **가짜 업체 유입 방지 가드 (Anti-Bogus Header Guard)**:
     - `PROJECT NO`, `DWG NO`, `CUSTOMER`, `TITLE` 등 표제란 헤더 명칭이나 플레이스홀더가 `companies` 테이블에 신규 업체로 등록되는 것을 파이프라인(`src/lib/cad-pipeline.ts`) 단에서 원천 차단합니다.

