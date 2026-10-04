---
name: bkit-pdca
description: >-
  BKIT(Bkamp Vibecoding Kit)의 핵심 프레임워크인 PDCA(Plan-Design-Do-Check) 9단계 파이프라인 및
  설계 간극 분석(gap-detector) 스킬. EGDesk 및 CADON 엔터프라이즈 환경과 100% 호환되며,
  기획/설계/구현/검증 과정을 체계화하여 결함 없는 고품질 개발을 보장합니다.
---

# BKIT PDCA & 설계 검증 프레임워크 (Antigravity 맞춤형)

본 스킬은 팝업스튜디오(Popup Studio) / Bkamp의 **BKIT(Vibecoding Kit)** 핵심 프레임워크를
Google Antigravity 및 EGDesk 엔터프라이즈 환경에 맞게 최적화한 맞춤형 워크플로우입니다.
기존 EGDesk 포트 규칙과 CADON 도면 렌더링 보호 규정을 100% 준수하면서,
기획(Plan) - 설계(Design) - 실행(Do) - 검증(Check)의 4단계 9과정을 구조화하여 결함을 사전에 방지합니다.

---

## 1. PDCA 9단계 파이프라인 (The 9-Stage Pipeline)

### 🔵 Phase 1: Plan (기획)
- **1단계: 요구사항 분해 및 목표 확정 (Requirements Decomposition)**
  - 사용자의 자연어 요청을 구체적 기능 목록, 제약 조건, 완료 정의(Definition of Done)로 분해합니다.
  - 사용자 질문의 숨은 의도와 도메인 맥락(제조, 도면, 견적 등)을 식별합니다.
- **2단계: 사용자 여정 및 예외 케이스 정의 (User Journey & Edge Cases)**
  - 사용자가 화면에서 겪는 동선(시트 전환, 줌, 패널 리사이징, 데이터 수정 등)을 시나리오별로 정리합니다.
  - 네트워크 지연, 빈 데이터(0건), 대용량 데이터, 경계값 조작 등 예외 상황을 도출합니다.

### 🟣 Phase 2: Design (설계)
- **3단계: 데이터 흐름 및 상태 아키텍처 설계 (Architecture & State Flow)**
  - 컴포넌트 간 Props 전달, 전역/로컬 상태, 불변성 보장 구조를 설계합니다.
  - 렌더링 트리에서 불필요한 리렌더링 및 레이스 컨디션 발생 가능성을 사전 차단합니다.
- **4단계: UI/UX 및 인터랙션 명세 (Zero Layout Shift Specification)**
  - 표준 UI/UX 규칙(SmartTruncateTooltip, 사일런트 백그라운드 동기화, 제로 레이아웃 시프트)을 반영합니다.
  - 버튼 배치, 시각적 위계(Primary CTA vs Secondary Tools), 간격 및 패딩을 명시합니다.
- **5단계: 불변 안전 가드 확인 (Safety & Invariance Guard)**
  - [필수] **EGDesk 포트 규칙**: EGDesk 호스팅 포트(4005, 4006, 4007 등) 준수 확인.
  - [필수] **도면 렌더링 보존 원칙**: WebGL 60FPS 셰이더, Zero Override, Text LOD, 1px 세선 불변 유지.

### 🟢 Phase 3: Do (실행 및 구현)
- **6단계: 원자적 단계별 구현 (Atomic Implementation)**
  - 파일 수정 시 단일 책임 원칙에 따라 연관 컴포넌트를 정확한 라인 단위로 수정합니다.
  - 기존 주석, 타입 정의, 안전 가드를 온전히 보존합니다.
- **7단계: 실시간 컴파일 및 빌드 무결성 점검 (Continuous Validation)**
  - 코드 변경 후 즉시 `npx tsc --noEmit`을 통해 `src/` 내 타입 에러 0건을 확인합니다.
  - HMR(Hot Module Replacement) 반영 상태를 점검합니다.

### 🟡 Phase 4: Check (검증 및 간극 분석)
- **8단계: `gap-detector` (기획-구현 간극 검출기)**
  - **요구사항 대조 검증**: 기획 단계에서 수립한 목표가 누락 없이 100% 반영되었는지 대조.
  - **중복 요소 검출**: 화면 전체의 중복 버튼, 중복 정보 뱃지, 불필요한 라벨 조사.
  - **성능/렌더링 병목 검출**: 리사이즈 시 흔들림(Jitter), 캔버스 깜빡임(Flicker), 줌 펄스 등 그래픽 무결성 검증.
- **9단계: 사용자 검증 및 피드백 루프 (Verification & Feedback)**
  - 사용자에게 개선 결과, 기술적 근거, 브라우저 확인 방법을 명확한 한국어로 보고합니다.
  - 사용자의 추가 피드백을 수렴하여 즉시 미세 튜닝을 수행합니다.

---

## 2. BKIT `gap-detector` 핵심 체크리스트

코드를 작성하거나 리뷰할 때 아래 5대 간극 요소를 자동으로 점검합니다:

1. **기능 간극 (Functional Gap)**:
   - 사용자가 요청한 핵심 요구사항 중 누락되거나 미완성인 부분이 있는가?
2. **중복 간극 (Redundancy Gap)**:
   - 화면에 동일한 정보나 액션 버튼이 2중/3중으로 낭비되고 있지 않은가?
   - 품번/품명처럼 사실상 동일한 데이터가 분리되어 가로 폭을 낭비하고 있지 않은가?
3. **인터랙션 간극 (Interaction Gap)**:
   - 마우스 드래그, 스크롤, 줌 조작 시 화면이 떨리거나(Jitter) 깜빡이지(Flicker) 않는가?
   - 모달 조작이나 데이터 갱신 시 스크롤 위치가 위로 튕기지 않는가?
4. **아키텍처 간극 (Architectural Gap)**:
   - React 렌더 루프 내부에서 Canvas 버퍼 재할당 등 고비용 작업이 반복되고 있지 않은가?
   - RAF(RequestAnimationFrame) 동기화가 누락되어 프레임 드랍이 발생하지 않는가?
5. **안전성 간극 (Safety Gap)**:
   - EGDesk DEV 서버 포트 및 도면 렌더링 기술 보존 원칙이 철저히 지켜졌는가?

---

## 3. 트리거 명령어 및 활성화 가이드

사용자가 다음과 유사한 요청을 할 때 본 스킬을 적용하여 구조적으로 응답합니다:
- *"PDCA 방식으로 기획/설계해줘"*
- *"설계 검증 및 간극(gap-detector) 분석해줘"*
- *"BKIT 방식으로 검토해줘"*
- *"기능 구현 전 체크리스트 먼저 작성해줘"*
