import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { resolveStoragePath, getStorageSubdir } from '@/lib/storage';
import fs from 'fs';
import path from 'path';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id, fileId } = await params;

  try {
    const file = (await db.prepare('SELECT * FROM uploaded_files WHERE id = ? AND quotation_case_id = ?').get(fileId, id)) as any;
    if (!file) {
      return NextResponse.json({ error: '삭제할 파일을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 1. Find all directly or indirectly derived files (e.g. DWG -> DXF -> SVG)
    const directDerived = (await db.prepare('SELECT * FROM uploaded_files WHERE derived_from_file_id = ?').all(fileId)) as any[];
    const directDerivedIds = directDerived.map((f: any) => f.id);
    let secondaryDerived: any[] = [];
    if (directDerivedIds.length > 0) {
      const placeholders = directDerivedIds.map(() => '?').join(',');
      secondaryDerived = (await db.prepare(`SELECT * FROM uploaded_files WHERE derived_from_file_id IN (${placeholders})`).all(...directDerivedIds)) as any[];
    }
    const allRelatedFiles = [file, ...directDerived, ...secondaryDerived];

    // Check if any OTHER source CAD files remain for this case
    const remainingSource = (await db.prepare(`
      SELECT COUNT(*) as cnt FROM uploaded_files 
      WHERE quotation_case_id = ? 
        AND id != ? 
        AND (derived_from_file_id IS NULL OR derived_from_file_id != ?)
        AND file_role != 'VECTOR_SVG'
        AND file_type IN ('DWG', 'DXF')
    `).get(id, fileId, fileId)) as any;

    const shouldWipeAllCaseData = (remainingSource?.cnt || 0) === 0;

    // 2. High-speed atomic DB transaction for instant deletion
    const deleteTx = db.transaction(async () => {
      // Delete CAD parse runs and objects for this file and related files
      const fileIdsToDelete = allRelatedFiles.map((f: any) => f.id);
      const placeholders = fileIdsToDelete.map(() => '?').join(',');
      const parseRuns = (await db.prepare(`SELECT id FROM cad_parse_runs WHERE source_file_id IN (${placeholders})`).all(...fileIdsToDelete)) as any[];
      for (const pr of parseRuns) {
        await db.prepare('DELETE FROM cad_objects WHERE parse_run_id = ?').run(pr.id);
        await db.prepare('DELETE FROM cad_parse_runs WHERE id = ?').run(pr.id);
      }

      // Delete the file and all its derived files
      await db.prepare(`DELETE FROM uploaded_files WHERE id IN (${placeholders})`).run(...fileIdsToDelete);

      // Delete drawings associated with the deleted files
      await db.prepare(`DELETE FROM drawings WHERE source_file_id IN (${placeholders})`).run(...fileIdsToDelete);

      if (shouldWipeAllCaseData) {
        // No other source drawings exist: Wipe all remaining orphaned records
        await db.prepare('DELETE FROM drawings WHERE quotation_case_id = ?').run(id);
        await db.prepare('DELETE FROM drawing_relationships WHERE quotation_case_id = ?').run(id);
        await db.prepare('DELETE FROM bom_areas WHERE quotation_case_id = ?').run(id);
        await db.prepare('DELETE FROM raw_bom_items WHERE quotation_case_id = ?').run(id);
        await db.prepare('DELETE FROM flattened_bom_items WHERE quotation_case_id = ?').run(id);
        await db.prepare('DELETE FROM normalized_bom_items WHERE quotation_case_id = ?').run(id);
        await db.prepare('DELETE FROM master_candidates WHERE normalized_item_id LIKE ?').run(`%${id}%`);
        await db.prepare('DELETE FROM bom_approval_records WHERE quotation_case_id = ?').run(id);
        await db.prepare('DELETE FROM final_bom_items WHERE quotation_case_id = ?').run(id);
        await db.prepare('DELETE FROM quotes WHERE quotation_case_id = ?').run(id);
        await db.prepare('DELETE FROM uploaded_files WHERE quotation_case_id = ?').run(id);
        await db.prepare(`
          UPDATE quotation_cases 
          SET status = 'REGISTERED', quote_readiness = 'PENDING_BOM'
          WHERE id = ?
        `).run(id);
      }
    });

    await deleteTx();

    // 3. Delete physical files from disk asynchronously without blocking
    for (const f of allRelatedFiles) {
      if (f.storage_path) {
        const absPath = resolveStoragePath(f.storage_path);
        try {
          if (fs.existsSync(absPath)) {
            fs.unlink(absPath, () => {});
          }
        } catch {}
      }
    }

    if (shouldWipeAllCaseData) {
      // Clean up physical derived files from disk
      const derivedDir = getStorageSubdir('derived');
      const localDerived = path.join(process.cwd(), 'storage', 'derived');
      const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\SteveLee', 'AppData', 'Roaming');
      const projectId = process.env.NEXT_PUBLIC_EGDESK_PROJECT_ID || '5883d2d5-7b0a-4947-a4fa-1f702c1dbc2f';
      const envName = process.env.NEXT_PUBLIC_EGDESK_ENV || 'development';
      const egdeskDerived = path.join(appData, 'egdesk', 'user-data', envName, 'projects', projectId, 'storage', 'derived');

      const derivedFilesToWipe = [
        `${id}__cad_webgl.bin`,
        `${id}__cad_texts.json`,
        `${id}__hd_vector.svg`
      ];

      for (const baseDir of [derivedDir, localDerived, egdeskDerived]) {
        for (const fname of derivedFilesToWipe) {
          const fpath = path.join(baseDir, fname);
          try {
            if (fs.existsSync(fpath)) fs.unlink(fpath, () => {});
          } catch {}
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `도면 '${file.original_file_name}' 및 연관 변환 파일이 즉시 삭제되었습니다.`
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '파일 삭제 중 오류 발생' }, { status: 500 });
  }
}
