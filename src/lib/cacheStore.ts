'use client';

import { apiFetch } from './api';

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
}

// In-Memory Global Cache (클라이언트 세션 동안 메모리에 유지)
const memoryCache = new Map<string, CacheEntry>();

// 진행 중인 백그라운드 fetch Promise들을 추적하여 중복 네트워크 호출 방지
const pendingRequests = new Map<string, Promise<any>>();

/**
 * 캐시에서 데이터를 즉시 조회 (메모리 우선 -> localStorage 보조)
 */
export function getClientCache<T = any>(key: string): T | null {
  // 1. 메모리 캐시 확인
  const mem = memoryCache.get(key);
  if (mem) {
    return mem.data as T;
  }

  // 2. localStorage 확인
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(`cadon_cache_${key}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.data !== undefined) {
          // 메모리 캐시로 승격
          memoryCache.set(key, parsed);
          return parsed.data as T;
        }
      }
    } catch (e) {
      console.warn(`[cacheStore] Failed to read localStorage for key: ${key}`, e);
    }
  }

  return null;
}

/**
 * 캐시에 데이터 저장 (메모리 + localStorage 동시 저장)
 */
export function setClientCache<T = any>(key: string, data: T): void {
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now()
  };

  // 메모리 저장
  memoryCache.set(key, entry);

  // localStorage 저장
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`cadon_cache_${key}`, JSON.stringify(entry));
      // 이전 호환성용 기존 키도 동기화
      if (key === 'cases') {
        localStorage.setItem('cadon_cached_cases', JSON.stringify(data));
      }
    } catch (e) {
      // quota exceeded 등 안전 처리
    }
  }
}

/**
 * 캐시가 특정 시간(기본 20초) 이내에 갱신되었는지 확인
 */
export function isCacheFresh(key: string, maxAgeMs = 20000): boolean {
  const mem = memoryCache.get(key);
  if (mem && Date.now() - mem.timestamp < maxAgeMs) {
    return true;
  }
  return false;
}

/**
 * 특정 엔드포인트 데이터를 중복 없이 페치하고 캐시에 자동 저장
 */
export async function fetchWithCache<T = any>(
  key: string,
  url: string,
  options?: { forceFresh?: boolean; maxAgeMs?: number }
): Promise<T | null> {
  const maxAge = options?.maxAgeMs ?? 20000;

  // 캐시가 신선하고 강제 갱신이 아닌 경우 캐시 즉시 반환
  if (!options?.forceFresh && isCacheFresh(key, maxAge)) {
    return getClientCache<T>(key);
  }

  // 이미 동일 엔드포인트에 대한 요청이 진행 중인 경우 해당 Promise 재사용
  if (pendingRequests.has(url)) {
    try {
      return await pendingRequests.get(url)!;
    } catch {
      return getClientCache<T>(key);
    }
  }

  const reqPromise = (async () => {
    try {
      const res = await apiFetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      setClientCache(key, json);
      return json as T;
    } catch (err) {
      console.warn(`[cacheStore] Fetch error for ${url}:`, err);
      return null;
    } finally {
      pendingRequests.delete(url);
    }
  })();

  pendingRequests.set(url, reqPromise);
  return await reqPromise;
}

/**
 * 사용자가 메뉴에 마우스를 올리거나(Hover) 탭을 열 때 관련 페이지 데이터를 사전에 백그라운드 프리로드
 */
export function prefetchPageData(route: string): void {
  try {
    if (route === '/' || route.startsWith('/?')) {
      // 대시보드에 필요한 데이터 프리페치
      if (!isCacheFresh('cases', 15000)) {
        fetchWithCache('cases', '/api/quotation-cases');
      }
      if (!isCacheFresh('quotes', 15000)) {
        fetchWithCache('quotes', '/api/quotes');
      }
      if (!isCacheFresh('companies', 30000)) {
        fetchWithCache('companies', '/api/companies');
      }
    } else if (route.startsWith('/cases')) {
      // 견적의뢰 관리에 필요한 데이터 프리페치
      if (!isCacheFresh('cases', 15000)) {
        fetchWithCache('cases', '/api/quotation-cases');
      }
      if (!isCacheFresh('companies', 30000)) {
        fetchWithCache('companies', '/api/companies');
      }
      if (!isCacheFresh('operators', 30000)) {
        fetchWithCache('operators', '/api/operators');
      }
    } else if (route.startsWith('/quotes')) {
      // 공식 견적서 관리에 필요한 데이터 프리페치
      if (!isCacheFresh('quotes', 15000)) {
        fetchWithCache('quotes', '/api/quotes');
      }
    } else if (route.startsWith('/admin/masters')) {
      // 마스터 기준정보 프리페치
      if (!isCacheFresh('masters_materials', 30000)) {
        fetchWithCache('masters_materials', '/api/admin/masters/materials');
      }
    }
  } catch (e) {
    // 백그라운드 프리페치 실패는 조용히 무시
  }
}
