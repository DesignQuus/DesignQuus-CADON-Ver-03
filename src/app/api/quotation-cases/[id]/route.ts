import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { resolveStoragePath, getStorageSubdir } from '@/lib/storage';
import { checkCasePermission } from '@/lib/permissions';
import { analyzeBomSimilarity } from '@/lib/bom-similarity';
import { getLearnedPricePool } from '@/lib/self-learning';
import fs from 'fs';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const rawQc = (await db.prepare('SELECT * FROM quotation_cases WHERE id = ?').get(id)) as any;
  if (!rawQc) {
    return NextResponse.json({ error: '견적건을 찾을 수 없습니다.' }, { status: 404 });
  }

  const [company, project, creator] = await Promise.all([
    rawQc.company_id ? db.prepare('SELECT company_name, company_code FROM companies WHERE id = ?').get(rawQc.company_id) as Promise<any> : Promise.resolve(null),
    rawQc.project_id ? db.prepare('SELECT project_name, project_code FROM projects WHERE id = ?').get(rawQc.project_id) as Promise<any> : Promise.resolve(null),
    rawQc.created_by_user_id ? db.prepare('SELECT name FROM users WHERE id = ?').get(rawQc.created_by_user_id) as Promise<any> : Promise.resolve(null)
  ]);

  const qc = {
    ...rawQc,
    company_name: company?.company_name || '',
    company_code: company?.company_code || '',
    project_name: project?.project_name || '',
    project_code: project?.project_code || '',
    created_by_name: creator?.name || '담당자'
  };

  // Tenant Isolation Check
  if (session.role !== 'SUPER_ADMIN') {
    const isOwner = qc.created_by_user_id === session.userId;
    const isUnassigned = !qc.company_id || qc.company_id === 'comp_unassigned';
    if (!isOwner && !isUnassigned) {
      const access = await db.prepare(`
        SELECT 1 FROM user_company_access
        WHERE user_id = ? AND company_id = ? AND is_active = 1
      `).get(session.userId, qc.company_id);
      if (!access) {
        return NextResponse.json({ error: '해당 고객사의 견적건에 접근할 권한이 없습니다.' }, { status: 403 });
      }
    }
  }

  // Fetch all related entities (Exclude internal conversion artifacts from user-facing files)
  const allCaseFiles = (await db.prepare(`
    SELECT * FROM uploaded_files
    WHERE quotation_case_id = ?
    ORDER BY rowid ASC
  `).all(id)) as any[];

  // Primary source files (exclude internal conversion artifacts like DERIVED and VECTOR_SVG)
  const sourceFiles = allCaseFiles.filter((f: any) => 
    f.file_role !== 'VECTOR_SVG' && 
    f.file_type !== 'SVG' && 
    f.file_role !== 'DERIVED' && 
    !f.original_file_name.endsWith('.svg') &&
    !f.original_file_name.endsWith('.dwg.dxf')
  );

  // Deduplicate by original_file_name and attach conversion metadata
  const files: any[] = [];
  const seenFileNames = new Set<string>();
  for (const sf of sourceFiles) {
    if (!seenFileNames.has(sf.original_file_name)) {
      seenFileNames.add(sf.original_file_name);
      const derivedDxf = allCaseFiles.find((df: any) => 
        (df.file_role === 'DERIVED' || df.file_type === 'DXF') &&
        (df.derived_from_file_id === sf.id || df.original_file_name === `${sf.original_file_name}.dxf`)
      );
      files.push({
        ...sf,
        has_derived_dxf: !!derivedDxf,
        derived_dxf_id: derivedDxf?.id || null
      });
    }
  }

  // If case has no source files and no drawings, return clean initial state
  const existingDrawingsCount = (await db.prepare('SELECT COUNT(*) as cnt FROM drawings WHERE quotation_case_id = ?').get(id)) as any;
  if (files.length === 0 && (!existingDrawingsCount?.cnt || existingDrawingsCount?.cnt === 0)) {
    return NextResponse.json({
      case: { ...qc, status: 'REGISTERED', quote_readiness: 'PENDING_BOM' },
      files: [],
      drawings: [],
      relationships: [],
      bomAreas: [],
      rawBomItems: [],
      flattenedBomItems: [],
      normalizedItems: [],
      candidates: [],
      approvalRecords: [],
      finalBomItems: [],
      quotes: [],
      latestQuote: null,
      quoteItems: [],
      cadObjects: [],
      latestParseRun: null
    });
  }
  // Auto-cleanup orphaned drawings whose source file was deleted from this case
  if (sourceFiles.length > 0) {
    const validFileIds = new Set(sourceFiles.map((f: any) => f.id));
    const allCaseDrawings = (await db.prepare('SELECT id, source_file_id FROM drawings WHERE quotation_case_id = ?').all(id)) as any[];
    const orphanedDrawings = allCaseDrawings.filter(d => d.source_file_id && !validFileIds.has(d.source_file_id));
    for (const od of orphanedDrawings) {
      await db.prepare('DELETE FROM drawings WHERE id = ?').run(od.id);
    }
  }

  const drawings = (await db.prepare('SELECT * FROM drawings WHERE quotation_case_id = ? ORDER BY drawing_index ASC').all(id)) as any[];
  const relationships = await db.prepare('SELECT * FROM drawing_relationships WHERE quotation_case_id = ?').all(id);
  const bomAreas = await db.prepare('SELECT * FROM bom_areas WHERE quotation_case_id = ?').all(id);
  const rawBomItems = (await db.prepare('SELECT * FROM raw_bom_items WHERE quotation_case_id = ? ORDER BY row_index ASC').all(id)) as any[];
  const flattenedBomItems = (await db.prepare('SELECT * FROM flattened_bom_items WHERE quotation_case_id = ?').all(id)) as any[];

  // Auto-correct sub-part drawings that had generic project title instead of actual part name
  const partNameMap = new Map<string, string>();
  for (const rb of rawBomItems) {
    const pno = (rb.part_no || rb.drawing_no || '').trim();
    const pname = (rb.item_name || rb.part_name || '').trim();
    if (pno && pname && !pname.endsWith('조립 LINE') && !pname.endsWith('조립LINE')) {
      if (!partNameMap.has(pno)) partNameMap.set(pno, pname);
    }
  }
  for (const fb of flattenedBomItems) {
    const pno = (fb.part_no || fb.drawing_no || '').trim();
    const pname = (fb.name || fb.item_name || '').trim();
    if (pno && pname && !pname.endsWith('조립 LINE') && !pname.endsWith('조립LINE')) {
      if (!partNameMap.has(pno)) partNameMap.set(pno, pname);
    }
  }

  for (const d of drawings) {
    if (d.drawing_type !== 'MAIN_ASSEMBLY' && (d.drawing_name_raw?.endsWith('조립 LINE') || d.drawing_name_raw?.endsWith('조립LINE') || d.drawing_name_raw === d.project_name)) {
      const pno = (d.drawing_no_raw || '').trim();
      const betterName = partNameMap.get(pno);
      if (betterName) {
        d.drawing_name_raw = betterName;
        d.drawing_name_normalized = betterName;
      }
    }
  }

  const priceMasters = (await db.prepare('SELECT * FROM price_masters').all()) as any[];

  const normalizedItems = (await db.prepare(`
    SELECT 
      ni.*,
      COALESCE(fb.part_no, '') as drawing_no,
      fb.source_drawings_json,
      COALESCE(d.drawing_name_raw, ni.normalized_name) as drawing_name,
      COALESCE(d.revision, 'R00') as drawing_revision,
      COALESCE(d.scale, fb.specification, '-') as drawing_scale,
      COALESCE(d.material, fb.material, ni.material_candidate, 'SS400') as drawing_material,
      COALESCE(d.drawing_type, 'PART') as drawing_type,
      COALESCE(d.is_quote_included, ni.is_quote_included, 1) as is_quote_included,
      COALESCE(d.exclude_reason, ni.exclude_reason) as exclude_reason,
      d.id as matched_drawing_id,
      p.project_name,
      p.project_code,
      c.company_name
    FROM normalized_bom_items ni
    LEFT JOIN flattened_bom_items fb 
      ON fb.id = REPLACE(ni.id, 'norm_', 'fb_')
    LEFT JOIN (
      SELECT 
        quotation_case_id,
        drawing_no_raw,
        drawing_no_normalized,
        drawing_name_raw,
        revision,
        scale,
        material,
        drawing_type,
        is_quote_included,
        exclude_reason,
        id
      FROM drawings
      GROUP BY quotation_case_id, drawing_no_raw
    ) d 
      ON d.quotation_case_id = ni.quotation_case_id 
      AND (d.drawing_no_raw = fb.part_no OR d.drawing_no_normalized = fb.part_no)
    LEFT JOIN quotation_cases qc ON qc.id = ni.quotation_case_id
    LEFT JOIN projects p ON qc.project_id = p.id
    LEFT JOIN companies c ON qc.company_id = c.id
    WHERE ni.quotation_case_id = ?
    ORDER BY ni.id ASC
  `).all(id)) as any[];

  const learnedPool = await getLearnedPricePool(qc.company_id);

  // 💎 Attach BOM Similarity Analysis & Standard Master Schema Suggestion to each item
  for (const item of normalizedItems) {
    item.company_id = qc.company_id;
    item.standard_schema_suggestion = analyzeBomSimilarity(item, priceMasters, learnedPool);
  }
  
  // Fetch candidates for normalized items
  const candidates = await db.prepare(`
    SELECT mc.*, ni.raw_name, ni.normalized_name
    FROM master_candidates mc
    JOIN normalized_bom_items ni ON mc.normalized_item_id = ni.id
    WHERE ni.quotation_case_id = ?
    ORDER BY mc.rank ASC
  `).all(id);

  const approvalRecords = await db.prepare('SELECT * FROM bom_approval_records WHERE quotation_case_id = ?').all(id);
  const finalBomItems = await db.prepare('SELECT * FROM final_bom_items WHERE quotation_case_id = ?').all(id);
  const quotes = (await db.prepare('SELECT * FROM quotes WHERE quotation_case_id = ? ORDER BY quote_version DESC').all(id)) as any[];

  // Latest quote items if exists
  let latestQuote = quotes[0] || null;
  let quoteItems: any[] = [];
  if (latestQuote) {
    quoteItems = (await db.prepare(`
      SELECT 
        qi.*,
        COALESCE(NULLIF(qi.drawing_no, ''), fb.part_no, '') as drawing_no,
        COALESCE(fb.name, qi.item_name) as drawing_name
      FROM quote_items qi
      LEFT JOIN final_bom_items fbi ON qi.final_bom_item_id = fbi.id
      LEFT JOIN flattened_bom_items fb ON fb.id = REPLACE(fbi.normalized_item_id, 'norm_', 'fb_')
      WHERE qi.quote_id = ?
      ORDER BY qi.item_no ASC
    `).all(latestQuote.id)) as any[];
  }

  // Latest CAD Parse Run and Objects for preview
  const latestParseRun = (await db.prepare(`
    SELECT cpr.*
    FROM cad_parse_runs cpr
    JOIN uploaded_files uf ON cpr.source_file_id = uf.id
    WHERE uf.quotation_case_id = ?
    ORDER BY cpr.rowid DESC
    LIMIT 1
  `).get(id)) as any;

  let cadObjects: any[] = [];
  if (latestParseRun) {
    cadObjects = (await db.prepare(`
      SELECT * FROM cad_objects
      WHERE parse_run_id = ?
      LIMIT 60000
    `).all(latestParseRun.id)) as any[];
  }

  const permission = await checkCasePermission(session.userId, session.role, id);

    return NextResponse.json({
      case: qc,
      permission,
      files,
      allFiles: allCaseFiles,
      drawings,
      relationships,
      bomAreas,
      rawBomItems,
      flattenedBomItems,
      normalizedItems,
      candidates,
      approvalRecords,
      finalBomItems,
      quotes,
      latestQuote,
      quoteItems,
      cadObjects,
      latestParseRun
    });
  } catch (err: any) {
    console.error(`[GET /api/quotation-cases/${id}] Error:`, err);
    return NextResponse.json(
      { error: err?.message || '견적건을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const qc = (await db.prepare('SELECT * FROM quotation_cases WHERE id = ?').get(id)) as any;
  if (!qc) {
    return NextResponse.json({ error: '견적건을 찾을 수 없습니다.' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { companyId, companyName, projectId, projectName, caseName } = body;
    const now = new Date().toISOString();

    let targetCompanyId = qc.company_id;
    let targetProjectId = qc.project_id;
    let targetCaseName = qc.case_name;

    // 1. Resolve company
    if (companyId) {
      targetCompanyId = companyId;
    } else if (companyName && companyName.trim()) {
      const trimmed = companyName.trim();
      const existing = (await db.prepare('SELECT id FROM companies WHERE company_name = ?').get(trimmed)) as any;
      if (existing) {
        targetCompanyId = existing.id;
      } else {
        const newCompId = `comp_${Date.now()}`;
        const code = `CUST-${Date.now().toString().slice(-4)}`;
        await db.prepare(`
          INSERT INTO companies (id, company_code, company_name, company_type, is_active, created_at, updated_at)
          VALUES (?, ?, ?, 'CUSTOMER', 1, ?, ?)
        `).run(newCompId, code, trimmed, now, now);

        // Grant access
        const allUsers = (await db.prepare('SELECT id FROM users').all()) as any[];
        for (const u of allUsers) {
          await db.prepare(`
            INSERT OR IGNORE INTO user_company_access (user_id, company_id, access_role, is_active)
            VALUES (?, ?, 'MANAGER', 1)
          `).run(u.id, newCompId);
        }
        targetCompanyId = newCompId;

        // Auto create project for new company
        const newProjId = `proj_${Date.now()}`;
        await db.prepare(`
          INSERT INTO projects (id, company_id, project_code, project_name, status, created_at, updated_at)
          VALUES (?, ?, 'PRJ-MAIN', ?, 'ACTIVE', ?, ?)
        `).run(newProjId, newCompId, `${trimmed} 표준 견적 프로젝트`, now, now);
        targetProjectId = newProjId;
      }
    }

    // 2. Resolve project
    if (projectId) {
      targetProjectId = projectId;
    } else if (projectName && projectName.trim()) {
      const trimmedP = projectName.trim();
      const existingP = (await db.prepare('SELECT id FROM projects WHERE company_id = ? AND project_name = ?').get(targetCompanyId, trimmedP)) as any;
      if (existingP) {
        targetProjectId = existingP.id;
      } else {
        const newPId = `proj_${Date.now()}`;
        await db.prepare(`
          INSERT INTO projects (id, company_id, project_code, project_name, status, created_at, updated_at)
          VALUES (?, ?, 'PRJ-NEW', ?, 'ACTIVE', ?, ?)
        `).run(newPId, targetCompanyId, trimmedP, now, now);
        targetProjectId = newPId;
      }
    }

    if (caseName && caseName.trim()) {
      targetCaseName = caseName.trim();
    }

    await db.prepare(`
      UPDATE quotation_cases
      SET company_id = ?, project_id = ?, case_name = ?, updated_at = ?
      WHERE id = ?
    `).run(targetCompanyId, targetProjectId, targetCaseName, now, id);

    const updated = await db.prepare(`
      SELECT qc.*, c.company_name, c.company_code, p.project_name, p.project_code
      FROM quotation_cases qc
      JOIN companies c ON qc.company_id = c.id
      JOIN projects p ON qc.project_id = p.id
      WHERE qc.id = ?
    `).get(id);

    return NextResponse.json({ success: true, case: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '견적건 정보 업데이트 실패' }, { status: 500 });
  }
}
