# EGDesk Helpers (이지데스크 헬퍼스) 완벽 가이드 및 레퍼런스 매뉴얼

> **문서 버전**: 1.0.0  
> **생성 일시**: 2026-09-20  
> **원본 파일**: `egdesk-helpers.ts` (총 5,113 라인, 454개 export 함수/타입)  
> **라이브러리**: `@egdesk/next-api-plugin`

---

## 📑 목차
1. [개요 및 아키텍처](#1-개요-및-아키텍처)
2. [공통 통신 및 환경 설정](#2-공통-통신-및-환경-설정)
3. [User Data (My DB) - 데이터베이스 & 파일 스토리지](#3-user-data-my-db---데이터베이스--파일-스토리지)
4. [비동기 큐 & Cron 스케줄러](#4-비동기-큐--cron-스케줄러)
5. [Google Workspace 연동 (Sheets, Drive, Gmail, Apps Script)](#5-google-workspace-연동)
6. [FinanceHub - 금융 & 세무 (은행, 카드, 홈택스)](#6-financehub---금융--세무)
7. [AI 엔진 연동 (Gemini AI Caller & Ollama 로컬 에이전트)](#7-ai-엔진-연동)
8. [공공 데이터 & 리서치 (법제처 법률, 기업마당 지원사업, 국민연금)](#8-공공-데이터--리서치)
9. [브라우저 레코더 (Browser Recording & 웹 자동화)](#9-브라우저-레코더)
10. [커뮤니케이션 & 마케팅 (카카오톡, 안드로이드 문자, SNS)](#10-커뮤니케이션--마케팅)
11. [CADON 프로젝트 내 실제 연동 예제](#11-cadon-프로젝트-내-실제-연동-예제)

---

## 1. 개요 및 아키텍처

`egdesk-helpers.ts`는 **EGDesk 플랫폼의 코어 엔진(포트 8080)과 Next.js 애플리케이션을 완벽하게 연결해 주는 풀스택 SDK 라이브러리**입니다.

* **동작 환경**:
  - 클라이언트 컴포넌트 (`'use client'`)
  - 서버 컴포넌트 및 API 라우트 (`'use server'`, Next.js App Router API Handlers)
* **주요 특징**:
  - **Type-safe**: TypeScript 기반 완전한 인터페이스 및 매개변수 검증
  - **터널링 지원**: 프로덕션 및 로컬 개발 환경(`http://localhost:4005`)에서 올바른 basePath 자동 감지 및 헤더 주입
  - **MCP 통합**: Claude Desktop / Antigravity / Cursor 등 AI Agent 환경에서 MCP 도구와 100% 호환

---

## 2. 공통 통신 및 환경 설정

```typescript
import { getEgdeskBasePath, apiFetch } from '@/../egdesk-helpers';
```

### 주요 함수
* **`getEgdeskBasePath(): string`**
  - Next.js 배포 환경 또는 로컬 터널의 basePath(예: `/t/{tunnelId}/p/{projectName}`)를 클라이언트/서버에서 자동으로 감지합니다.
* **`apiFetch(path: string, options?: RequestInit): Promise<Response>`**
  - 상대 경로(`/api/...`) 호출 시 EGDesk basePath를 자동으로 접두사로 붙여 `fetch()`를 수행합니다.
* **`callEgdeskHttp(...)`**
  - EGDesk 서버의 REST API를 인증 헤더(`X-Api-Key`, `X-EGDesk-Project-Id`)와 함께 직접 호출하는 저수준 통신 함수입니다.

---

## 3. User Data (My DB) - 데이터베이스 & 파일 스토리지

사내 비즈니스 데이터 및 CADON 부품/단가 데이터를 영구 관리하는 데이터베이스 헬퍼입니다.

```typescript
import { 
  queryTable, 
  insertRows, 
  updateRows, 
  deleteRows, 
  executeSQL,
  uploadFile,
  downloadFile
} from '@/../egdesk-helpers';
```

### 1) 테이블 데이터 조회 (`queryTable`)
```typescript
const result = await queryTable('quote_items', {
  filters: { quotation_case_id: 'case_1789766302590' },
  sort: { column: 'item_no', ascending: true },
  limit: 100,
  offset: 0
});
console.log(result.rows, result.totalCount);
```

### 2) 데이터 삽입 (`insertRows`)
```typescript
await insertRows('price_history_v2', [
  {
    id: 'prc_001',
    part_key: 'PARTNER_A:BASE_PLATE:B',
    unit_price: 34500,
    material_cost: 14490,
    process_cost: 16560,
    created_at: new Date().toISOString()
  }
]);
```

### 3) 데이터 수정 (`updateRows`)
```typescript
await updateRows('quote_items', {
  filters: { id: 'line_123' },
  updates: {
    unit_price: 38000,
    price_status: 'CONFIRMED',
    updated_at: new Date().toISOString()
  }
});
```

### 4) 고급 SQL 쿼리 실행 (`executeSQL`)
```typescript
const stats = await executeSQL(`
  SELECT 
    category, 
    COUNT(*) as count, 
    AVG(unit_price) as avg_price 
  FROM product_masters 
  GROUP BY category
`);
```

### 5) 파일 업로드 및 다운로드
* `uploadFile(file: File | Blob, options)`: 도면, PDF, 엑셀 파일을 My DB 스토리지에 업로드
* `downloadFile(fileId: string)`: 저장된 파일을 Blob/ArrayBuffer로 다운로드

---

## 4. 비동기 큐 & Cron 스케줄러

대량 DWG 파싱, 단가 일괄 재계산 등 장기 실행 작업을 백그라운드에서 처리합니다.

### 1) 백그라운드 큐 등록 (`enqueueUserDataQueueJob`)
```typescript
import { enqueueUserDataQueueJob } from '@/../egdesk-helpers';

const job = await enqueueUserDataQueueJob({
  action: 'RUN_WORKFLOW',
  payload: { caseId: 'case_1789766302590', task: 'RECALCULATE_ALL_PRICES' }
});
```

### 2) 정기 배치 등록 (`createUserDataCronJob`)
```typescript
import { createUserDataCronJob } from '@/../egdesk-helpers';

// 매일 새벽 3시에 최신 원자재 시세 동기화
await createUserDataCronJob({
  frequency: 'DAILY',
  time: '03:00',
  action: 'SYNC_RATES',
  payload: { sources: ['LME', 'POSCO'] }
});
```

---

## 5. Google Workspace 연동

Google 스프레드시트, 드라이브, 문서, Gmail과 실시간으로 연동합니다.

### 1) Google Sheets 읽기/쓰기
```typescript
import { callSheetsTool } from '@/../egdesk-helpers';

// 시트에 견적 결과 행 추가
await callSheetsTool('sheets_append_values', {
  spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
  range: '견적대장!A2:E2',
  values: [['2026-09-20', 'BASE PLATE', 1, 34500, '확정']]
});
```

### 2) Google Drive 파일 백업
```typescript
import { callDriveTool } from '@/../egdesk-helpers';

// 생성된 공식 견적서 PDF를 구글 드라이브 지정 폴더로 업로드
await callDriveTool('drive_upload', {
  folderId: 'folder_xyz',
  fileName: 'QT-20260920-001_공식견적서.pdf',
  fileData: pdfBase64
});
```

### 3) Google Apps Script 원격 실행
* `pushAppsScriptToGoogle(projectId, files)`
* `setupAppsScriptEgdeskTunnel(projectId)`

---

## 6. FinanceHub - 금융 & 세무

사내 금융 자산 및 세무 증빙을 연동합니다.

```typescript
import { 
  listBanks, 
  queryBankTransactions, 
  queryCardTransactions,
  callFinanceHubTool 
} from '@/../egdesk-helpers';
```

* **은행 계좌 거래내역**: `queryBankTransactions({ bankCode, accountNo, startDate, endDate })`
* **법인카드 승인내역**: `queryCardTransactions({ cardNo, startDate, endDate })`
* **국세청 홈택스 전자세금계산서 조회**:
  ```typescript
  const taxInvoices = await callFinanceHubTool('financehub_query_tax_invoices', {
    businessNumber: '123-45-67890',
    type: 'PURCHASE', // 매입 세금계산서
    startDate: '2026-09-01',
    endDate: '2026-09-20'
  });
  ```

---

## 7. AI 엔진 연동

Gemini 및 오프라인 로컬 LLM을 통한 엔지니어링 분석을 수행합니다.

### 1) Gemini API 호출 (`aiCallerCall`)
```typescript
import { aiCallerCall } from '@/../egdesk-helpers';

const response = await aiCallerCall({
  model: 'gemini-2.0-flash',
  messages: [
    { role: 'user', content: '이 기계 부품(SUS304, 150x120x10T)의 레이저 가공 표준 공수를 계산해 줘.' }
  ]
});
```

### 2) 로컬 오프라인 LLM 추론 (`callLocalAgentTool`)
* Ollama 기반 로컬 보안 인퍼런스 (`Gemma 4 QAT` 등)
* 인터넷 연결이 차단된 사내망에서도 도면 텍스트 해석 가능

---

## 8. 공공 데이터 & 리서치

국내 공공기관 API를 직접 연동하여 실무 검증을 보조합니다.

### 1) 법제처 국가법령정보 검색 (`searchKoreanLaw`)
```typescript
import { searchKoreanLaw } from '@/../egdesk-helpers';

// 중소기업 하도급 대금 지급 관련 법령 검색
const laws = await searchKoreanLaw('하도급거래 공정화에 관한 법률', 'LAW');
```

### 2) 기업마당 정부 지원사업 공고 (`callBizinfoTool`)
* 제조업 공정 개선, 스마트공장 지원금 공고 실시간 스크랩

### 3) 국민연금 사업장 가입자 내역 (`callNpsTool`)
* 협력사/외주 가공처의 상시 근로자 수 및 고용 안정성 실시간 조회

---

## 9. 브라우저 레코더 (Browser Recording)

웹 브라우저를 통한 반복 업무 자동화 및 화면 녹화 기능입니다.

* `runBrowserRecording(testFile, options)`: 기 저장된 브라우저 매크로(예: 원자재 시세 사이트 스크래핑) 실행
* `fillBrowserRecordingForm(sessionId, selector, value)`: 웹 폼 자동 채우기
* `inspectBrowserRecordingPage(sessionId)`: 웹 페이지 DOM 구조 추출

---

## 10. 커뮤니케이션 & 마케팅

고객 견적서 발송 및 비즈니스 알림 채널입니다.

* **카카오 알림톡/채널 (`callKakaoTool`)**: 견적 승인 알림톡 전송
* **안드로이드 Phone 문자 (`callPhoneTool`)**: 고객사 담당자에게 긴급 견적 완료 SMS 발송
* **블로그/유튜브 (`callBlogTool`, `callYoutubeTool`)**: 기술 블로그 및 쇼츠 홍보물 자동 발행

---

## 11. CADON 프로젝트 내 실제 연동 예제

우리 **CADON-BOM AI** 시스템에서 실제로 사용 중인 대표적인 연동 코드 스니펫입니다:

```typescript
// src/app/api/quotes/[id]/confirm-line/route.ts 일부
import { updateRows, insertRows } from '@/../egdesk-helpers';

// 1. 견적 확정 시 정규화 BOM 항목 상태 변경
await updateRows('normalized_bom_items', {
  filters: { id: lineId },
  updates: {
    status: isConfirmed ? 'CONFIRMED' : 'NEEDS_REVIEW',
    approval_status: isConfirmed ? 'APPROVED' : 'NEEDS_REVIEW',
    is_quote_included: isConfirmed ? 1 : 0,
    updated_at: new Date().toISOString()
  }
});

// 2. 단가 이력 마스터에 자동 축적 (지식풀 강화)
await insertRows('price_history_v2', [
  {
    id: historyId,
    part_master_id: lineId,
    quotation_case_id: caseId,
    unit_price: unitPrice,
    material_cost: materialCost,
    process_cost: processCost,
    margin_rate: 0.18,
    price_basis_type: 'MANUAL_REVIEW',
    created_at: new Date().toISOString()
  }
]);
```

---
*문서 작성 완료: CADON-BOM AI Development Team*
