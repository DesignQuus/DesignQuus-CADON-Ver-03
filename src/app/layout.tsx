import type { Metadata } from 'next';
import './globals.css';
import Navigation from '@/components/Navigation';

export const metadata: Metadata = {
  title: 'CADON-BOM AI Ver-03 | CAD 도면 자동 BOM 분석 및 견적 산출 시스템',
  description: 'CAD Standalone 분석 엔진 기반 다단계 BOM 추출, 마스터 매칭, 검수자 승인 거버넌스 및 엑셀 견적 자동화',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body suppressHydrationWarning className="min-h-screen flex flex-col antialiased bg-slate-100/60">
        <Navigation />
        <main className="flex-1 w-full">
          {children}
        </main>
      </body>
    </html>
  );
}
