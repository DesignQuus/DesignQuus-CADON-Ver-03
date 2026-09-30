'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PermissionsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/members?tab=permissions');
  }, [router]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-6 text-center text-slate-500 text-sm">
      사원 및 권한 통합 관리 페이지로 이동 중입니다...
    </div>
  );
}
