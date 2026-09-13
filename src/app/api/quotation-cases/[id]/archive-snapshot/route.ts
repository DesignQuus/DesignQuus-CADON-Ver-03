import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

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
    const archives = await db.prepare(`
      SELECT *
      FROM case_archives
      WHERE quotation_case_id = ?
      ORDER BY rowid DESC
    `).all(id);

    return NextResponse.json({ archives });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
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
  const qc = (await db.prepare('SELECT * FROM quotation_cases WHERE id = ?').get(id)) as any;
  if (!qc) {
    return NextResponse.json({ error: '견적건을 찾을 수 없습니다.' }, { status: 404 });
  }

  try {
    // 1. Fetch current analysis data
    const drawings = (await db.prepare('SELECT * FROM drawings WHERE quotation_case_id = ?').all(id)) as any[];
    const rawBom = (await db.prepare('SELECT * FROM raw_bom_items WHERE quotation_case_id = ?').all(id)) as any[];
    const normBom = (await db.prepare('SELECT * FROM normalized_bom_items WHERE quotation_case_id = ?').all(id)) as any[];
    const files = (await db.prepare('SELECT * FROM uploaded_files WHERE quotation_case_id = ?').all(id)) as any[];

    // 2. Count existing archives to determine next version (v1.0, v2.0, ...)
    const existingCount = (await db.prepare('SELECT count(*) as cnt FROM case_archives WHERE quotation_case_id = ?').get(id)) as any;
    const nextVer = `v${(existingCount?.cnt || 0) + 1}.0`;
    const now = new Date().toISOString();
    const dateStr = now.split('T')[0];

    const archiveId = `arch_${Date.now()}`;
    const archiveName = `${qc.case_name || '견적건'} ${nextVer} (${dateStr} 보관)`;

    const snapshotPayload = {
      quotation_case: qc,
      files,
      drawings,
      rawBom,
      normBom,
      archived_at: now,
      archived_by: session.userId
    };

    await db.prepare(`
      INSERT INTO case_archives (
        id, quotation_case_id, archive_version, archive_name,
        drawings_count, bom_items_count, snapshot_data_json,
        created_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      archiveId, id, nextVer, archiveName,
      drawings.length, rawBom.length, JSON.stringify(snapshotPayload),
      session.userId, now
    );

    // Update case revision
    await db.prepare('UPDATE quotation_cases SET revision = ?, updated_at = ? WHERE id = ?').run(
      nextVer, now, id
    );

    return NextResponse.json({
      success: true,
      message: `현재 도면 (${drawings.length}개) 및 BOM (${rawBom.length}개) 분석 데이터가 '${archiveName}'으로 안전하게 보관되었습니다.`,
      archiveId,
      archiveVersion: nextVer
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '보관 처리 중 오류 발생' }, { status: 500 });
  }
}
