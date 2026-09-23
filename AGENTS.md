# Project Agent Rules

<!-- BEGIN:egdesk-dev-context -->
## EGDesk Development Context

EGDesk opened this project with the dev server on **port 4005** (http://localhost:4005, coding (dev)).
Do not assume port 3000 or 4000. Use port 4005 for local preview and dev commands.
EGDesk MCP/API runs at http://localhost:8080.

See `.agents/rules/egdesk-dev-context.md` for full details.
<!-- END:egdesk-dev-context -->

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


