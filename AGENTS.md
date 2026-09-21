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
- 현재 렌더링 품질이 검증 완료되었으므로, 관련 렌더러 및 파이프라인 파일(`scripts/webgl_binary_exporter.py`, `scripts/vector_svg_renderer.py`, `src/components/cad/CadViewerWebGL.tsx` 등)의 핵심 구현을 온전히 보존(Immutable)합니다.

