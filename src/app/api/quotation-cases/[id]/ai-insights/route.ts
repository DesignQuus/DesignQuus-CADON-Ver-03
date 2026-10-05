import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { analyzeCadCaseWithAi } from '@/lib/cad-ai-service';
import fs from 'fs';
import path from 'path';
import { getStorageSubdir } from '@/lib/storage';
import { db } from '@/lib/db';
import { invalidateCasesCache } from '@/app/api/quotation-cases/route';

async function syncCustomerFromAiResult(caseId: string, result: any) {
  const compRaw = result?.titleBlockAnalysis?.detectedCompany || 
                  (result?.titleBlockAnalysis?.customerCompany ? result.titleBlockAnalysis.customerCompany.split('(')[0].trim() : null);
  if (!compRaw || compRaw === '-' || compRaw.length < 2) return;
  const compClean = compRaw.replace(/[\s().:_-]/g, '').toLowerCase();
  if (['projectno', 'projectnumber', 'dwgno', 'customer'].includes(compClean)) return;
  if (compClean.includes('세창') || compClean.includes('sechang')) return;

  try {
    const caseRow = (await db.prepare('SELECT company_id FROM quotation_cases WHERE id = ?').get(caseId)) as any;
    let shouldSync = false;
    if (!caseRow || !caseRow.company_id || caseRow.company_id === 'comp_unassigned') {
      shouldSync = true;
    } else {
      const currentComp = (await db.prepare('SELECT company_name FROM companies WHERE id = ?').get(caseRow.company_id)) as any;
      const cName = (currentComp?.company_name || '').trim();
      if (cName === '' || /^T\d+\./i.test(cName) || /^\d+$/.test(cName) || cName.toUpperCase().includes('PROJECT NO')) {
        shouldSync = true;
      }
    }

    if (shouldSync) {
      let comp = (await db.prepare('SELECT id FROM companies WHERE company_name = ?').get(compRaw)) as any;
      const nowIso = new Date().toISOString();
      if (!comp) {
        const newCompId = `comp_${Date.now()}`;
        const compCode = `CUST-${Date.now().toString().slice(-4)}`;
        await db.prepare(`
          INSERT INTO companies (id, company_code, company_name, company_type, is_active, created_at, updated_at)
          VALUES (?, ?, ?, 'CUSTOMER', 1, ?, ?)
        `).run(newCompId, compCode, compRaw, nowIso, nowIso);
        comp = { id: newCompId };
      }
      await db.prepare('UPDATE quotation_cases SET company_id = ?, updated_at = ? WHERE id = ?').run(comp.id, nowIso, caseId);
      invalidateCasesCache();

      const normCaseId = caseId.startsWith('case_') ? caseId : `case_${caseId}`;
      const snapPath = path.join(process.cwd(), 'storage', 'derived', `${normCaseId}_snapshot.json`);
      if (fs.existsSync(snapPath)) {
        try { fs.unlinkSync(snapPath); } catch {}
      }
    }
  } catch (e) {
    console.warn('[ai-insights] syncCustomerFromAiResult warning:', e);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: '의뢰 건 ID가 필요합니다.' }, { status: 400 });
  }

  try {
    const result = await analyzeCadCaseWithAi(id);
    
    // Cache the AI analysis result in storage/derived
    const derivedDir = getStorageSubdir('derived');
    const cacheFile = path.join(derivedDir, `${id}__ai_insights.json`);
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2), 'utf-8');
    } catch (saveErr) {
      console.warn('[ai-insights] Cache save warning:', saveErr);
    }

    await syncCustomerFromAiResult(id, result);

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (err: any) {
    console.error('[POST /api/quotation-cases/[id]/ai-insights] error:', err);
    return NextResponse.json({ error: err.message || 'AI 분석 실행 실패' }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const derivedDir = getStorageSubdir('derived');
  const cacheFile = path.join(derivedDir, `${id}__ai_insights.json`);

  if (fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      await syncCustomerFromAiResult(id, cached);
      return NextResponse.json({ success: true, data: cached });
    } catch {}
  }

  // Not yet cached -> run analysis and cache
  try {
    const result = await analyzeCadCaseWithAi(id);
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2), 'utf-8');
    } catch {}
    await syncCustomerFromAiResult(id, result);
    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'AI 분석 실패' }, { status: 500 });
  }
}
