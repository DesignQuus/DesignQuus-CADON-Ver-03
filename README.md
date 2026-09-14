# CADON-BOM AI (Ver-02)

> **CAD 도면(DWG/DXF) 자동 분석, BOM 추출, 마스터 부품 매핑 및 견적 생성 자동화 시스템**

---

## 🌟 핵심 아키텍처 특징

본 프로젝트는 **EGDesk (이지데스크)** 플랫폼 전용 백엔드 아키텍처로 구축되어 있습니다.

1. **물리적 데이터베이스 & 스토리지의 EGDesk 일원화**
   - 로컬 파일 시스템의 무거운 C++ 네이티브 모듈(`better-sqlite3`)을 **완전히 제거**했습니다.
   - 모든 데이터와 업로드/변환 파일은 **EGDesk 서버의 My DB 및 프로젝트 스토리지**에서 안전하게 관리됩니다.
   - DB 접근은 오직 EGDesk 공식 도구인 `egdesk-helpers.ts`와 `setup-db.ts`를 통해서만 수행됩니다.

2. **전 테이블 8종 표준 감사(Audit) 컬럼 자동 주입**
   - 시스템 내 정의된 총 34개 전 테이블에 대해 생성/마이그레이션 시 8종 표준 감사 컬럼이 자동 주입되고 관리됩니다:
     - `tenant_id`: 멀티 테넌트 격리 식별자
     - `uuid`: 범용 고유 식별자
     - `updated_at`, `updated_by`: 최종 수정 일시 및 수정자
     - `deleted_at`, `deleted_by`: 소프트 딜리트 일시 및 삭제자
     - `restored_at`, `restored_by`: 데이터 복원 일시 및 복원자

3. **깃허브 클론 후 "제로 셋업 (Zero-Config)" 구동**
   - 깃허브에서 클론한 뒤 복잡한 DB 설치, 마이그레이션 스크립트 작성 등의 번거로운 수동 설정이 일절 필요 없습니다.
   - 서버 시작 및 최초 DB 요청 시 `setup-db.ts`가 자동으로 스키마를 검사하고, 누락된 테이블/컬럼/시드 데이터를 실시간으로 주입합니다.

---

## 🚀 빠른 시작 (Quick Start)

### 1. 저장소 클론 및 패키지 설치
```bash
git clone https://github.com/DesignQuus/CADON-Ver-02.git
cd CADON-Ver-02
npm install
```

### 2. 개발 서버 실행 (포트 4000)
```bash
npm run dev
```
> EGDesk 개발 서버는 **포트 4000**(`http://localhost:4000`)에서 구동됩니다.

### 3. 데이터베이스 초기화 (선택 사항)
서버 실행 시 첫 요청에 자동으로 제로-셋업이 수행되지만, 즉시 수동으로 세팅하려면 다음 중 편한 방법을 사용하실 수 있습니다:

- **방법 A (CLI 스크립트)**:
  ```bash
  npm run setup:db
  ```
- **방법 B (웹 브라우저 접속)**:
  - 브라우저에서 `http://localhost:4000/api/setup` 접속

---

## 🔑 기본 관리자 계정

시스템 초기화 시 마스터 데이터 및 최고관리자 계정이 자동으로 시딩됩니다:

| 역할 (Role) | 아이디 (Login ID) | 비밀번호 (Password) | 비고 |
| :--- | :--- | :--- | :--- |
| **시스템 최고관리자** | `admin` | `Cadon1234!@` | 전체 견적/단가/사용자/감사로그 관리 |

> 일반 사용자 및 회원사 계정은 최고관리자 로그인 후 **[임직원 및 회원사 관리](/admin/members)** 메뉴에서 직접 등록하여 사용합니다.
> 계정 재설정이 필요할 경우 브라우저에서 `http://localhost:4000/api/setup-admin?force=true`로 접속하시면 기본 최고관리자 계정이 즉시 복구됩니다.

---

## 📁 주요 디렉토리 구조

```plaintext
CADON-Ver-03/
├── src/
│   ├── app/                 # Next.js App Router (UI 화면 및 REST API)
│   │   ├── admin/           # 관리자 콘솔 (감사 로그, 권한, 골든 데이터셋)
│   │   ├── api/             # 백엔드 API 라우트
│   │   │   ├── setup/       # 제로 셋업 웹 트리거 엔드포인트
│   │   │   └── ...
│   ├── components/          # 공용 UI 컴포넌트 및 네비게이션
│   └── lib/                 # 핵심 비즈니스 로직 및 라이브러리
│       ├── db.ts            # EGDesk My DB 호환 데이터베이스 엔진
│       ├── setup-db.ts      # 34개 테이블 스키마, 8종 감사 컬럼 주입, 시드 데이터
│       ├── storage.ts       # EGDesk 프로젝트 스토리지 연동 모듈
│       ├── auth.ts          # 세션 및 인증 모듈
│       └── cad-pipeline.ts  # CAD 파싱 및 BOM 생성 파이프라인
├── egdesk-helpers.ts        # EGDesk 공식 My DB 연동 헬퍼
├── scripts/
│   ├── run-setup-db.ts      # DB 제로 셋업 실행기 (npm run setup:db)
│   └── test-cadon-system.ts # 통합 인수 테스트 스크립트 (npm run test:all)
└── storage/                 # 로컬 캐시/개발용 스토리지
```

---

## 🧪 시스템 검증 테스트

```bash
# 전체 시스템 기능 및 비즈니스 로직 테스트 실행
npm run test:all
```
