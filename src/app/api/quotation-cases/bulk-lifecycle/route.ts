import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { recordActivity } from '@/lib/audit';
import { resolveStoragePath, getStorageSubdir } from '@/lib/storage';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const { caseIds, action, reason } = await req.json();
    if (!Array.isArray(caseIds) || caseIds.length === 0) {
      return NextResponse.json({ error: '선택된 견적건이 없습니다.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const isSuperAdmin = session.role === 'SUPER_ADMIN';

    let successCount = 0;

    for (const id of caseIds) {
      const qc = (await db.prepare('SELECT * FROM quotation_cases WHERE id = ?').get(id)) as any;
      if (!qc) continue;

      const isOwner = session.userId === qc.created_by_user_id;

      if (action === 'ARCHIVE') {
        const archiveReason = reason || '일정 보류';
        await db.prepare(`
          UPDATE quotation_cases
          SET lifecycle_status = 'ARCHIVED',
              archived_at = ?,
              archive_reason = ?,
              updated_at = ?
          WHERE id = ?
        `).run(now, archiveReason, now, id);

        await recordActivity(req, session, {
          activityType: 'CASE_ARCHIVE',
          quotationCaseId: id,
          caseName: qc.case_name,
          details: `[일괄] 견적건 보관함 이동 [사유: ${archiveReason}]`
        });
        successCount++;
      } else if (action === 'TRASH') {
        await db.prepare(`
          UPDATE quotation_cases
          SET lifecycle_status = 'TRASHED',
              trashed_at = ?,
              trashed_by_user_id = ?,
              updated_at = ?
          WHERE id = ?
        `).run(now, session.userId, now, id);

        await recordActivity(req, session, {
          activityType: 'CASE_TRASH',
          quotationCaseId: id,
          caseName: qc.case_name,
          details: '[일괄] 견적건 휴지통으로 이동'
        });
        successCount++;
      } else if (action === 'RESTORE') {
        await db.prepare(`
          UPDATE quotation_cases
          SET lifecycle_status = 'ACTIVE',
              archived_at = NULL,
              archive_reason = NULL,
              trashed_at = NULL,
              trashed_by_user_id = NULL,
              updated_at = ?
          WHERE id = ?
        `).run(now, id);

        await recordActivity(req, session, {
          activityType: 'CASE_RESTORE',
          quotationCaseId: id,
          caseName: qc.case_name,
          details: '[일괄] 견적건 작업 활성 상태로 복원'
        });
        successCount++;
      } else if (action === 'PERMANENT_DELETE') {
        if (!isSuperAdmin && !isOwner) continue;

        const files = (await db.prepare('SELECT * FROM uploaded_files WHERE quotation_case_id = ?').all(id)) as any[];

        const deleteTx = db.transaction(async () => {
          const fileIds = files.map(f => f.id);
          if (fileIds.length > 0) {
            const placeholders = fileIds.map(() => '?').join(',');
            const parseRuns = (await db.prepare(`SELECT id FROM cad_parse_runs WHERE source_file_id IN (${placeholders})`).all(...fileIds)) as any[];
            for (const pr of parseRuns) {
              await db.prepare('DELETE FROM cad_objects WHERE parse_run_id = ?').run(pr.id);
              await db.prepare('DELETE FROM cad_parse_runs WHERE id = ?').run(pr.id);
            }
          }

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
          await db.prepare('DELETE FROM quotation_cases WHERE id = ?').run(id);
        });

        await deleteTx();

        for (const f of files) {
          if (f.storage_path) {
            try {
              const absPath = resolveStoragePath(f.storage_path);
              if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
            } catch {}
          }
        }

        const derivedDirs = [
          getStorageSubdir('derived'),
          path.join(process.cwd(), 'storage', 'derived'),
          path.join(process.env.APPDATA || '', 'egdesk', 'user-data', 'development', 'projects', '5883d2d5-7b0a-4947-a4fa-1f702c1dbc2f', 'storage', 'derived')
        ];

        for (const dDir of derivedDirs) {
          if (fs.existsSync(dDir)) {
            try {
              const patternFiles = fs.readdirSync(dDir).filter(fn => fn.includes(id));
              for (const fn of patternFiles) {
                try { fs.unlinkSync(path.join(dDir, fn)); } catch {}
              }
            } catch {}
          }
        }

        await recordActivity(req, session, {
          activityType: 'CASE_PERMANENT_DELETE',
          quotationCaseId: id,
          caseName: qc.case_name,
          details: `[일괄] 견적건 완전 영구 삭제: [] `
        });
        successCount++;
      }
    }

    return NextResponse.json({ success: true, processedCount: successCount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '일괄 처리 중 오류 발생' }, { status: 500 });
  }
}
