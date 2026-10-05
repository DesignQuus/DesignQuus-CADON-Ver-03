'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import DrawingInboxWorkbench from '@/components/inbox/DrawingInboxWorkbench';

export default function InboxPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <DrawingInboxWorkbench
          showBackHeader={true}
          onBackToCases={() => router.push('/cases')}
        />
      </main>
    </div>
  );
}
