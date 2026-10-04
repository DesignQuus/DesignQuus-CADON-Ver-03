import { NextRequest, NextResponse } from 'next/server';
import { db, insertRows } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getStorageSubdir } from '@/lib/storage';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json();
    const { itemIds, targetCaseName, existingCaseId } = body;

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json({ error: '병합할 항목을 선택해주세요.' }, { status: 400 });
    }

    const placeholders = itemIds.map(() => '?').join(',');
    const items = (await db.prepare(`
      SELECT * FROM batch_items
      WHERE id IN (${placeholders})
    `).all(...itemIds)) as any[];

    if (items.length === 0) {
      return NextResponse.json({ error: '선택된 항목을 찾을 수 없습니다.' }, { status: 404 });
    }

    const now = new Date().toISOString();
    let targetCaseId = existingCaseId;
    let targetCase: any = null;

    if (targetCaseId) {
      targetCase = await db.prepare('SELECT * FROM quotation_cases WHERE id = ?').get(targetCaseId);
      if (!targetCase) {
        return NextResponse.json({ error: '지정된 대상 견적건을 찾을 수 없습니다.' }, { status: 404 });
      }
    } else {
      // 신규 통합 견적건 생성
      targetCaseId = `case_merge_${Date.now()}`;
      const caseNo = `QT-${Date.now().toString().slice(-6)}-M`;
      const name = targetCaseName?.trim() || `[통합 견적] ${items[0].file_name} 외 ${items.length - 1}건`;

      await insertRows('quotation_cases', [{
        id: targetCaseId,
        case_no: caseNo,
        company_id: 'comp_unassigned',
        case_name: name,
        request_date: now.slice(0, 10),
        status: 'REGISTERED',
        quote_readiness: 'PENDING_BOM',
        created_by_user_id: session.userId,
        created_at: now
      }]);
    }

    const oldCaseIds = new Set<string>();
    const fileIds: string[] = [];

    for (const item of items) {
      if (item.quotation_case_id && item.quotation_case_id !== targetCaseId) {
        oldCaseIds.add(item.quotation_case_id);
      }
      if (item.uploaded_file_id) {
        fileIds.push(item.uploaded_file_id);
      }
    }

    // 1. batch_items 의 quotation_case_id 대상 케이스로 이전
    await db.prepare(`
      UPDATE batch_items
      SET quotation_case_id = ?
      WHERE id IN (${placeholders})
    `).run(targetCaseId, ...itemIds);

    // 2. uploaded_files 이전 (해당 파일 및 파생 DXF, SVG 포함)
    if (fileIds.length > 0) {
      const fPlaceholders = fileIds.map(() => '?').join(',');
      await db.prepare(`
        UPDATE uploaded_files
        SET quotation_case_id = ?
        WHERE id IN (${fPlaceholders}) OR derived_from_file_id IN (${fPlaceholders})
      `).run(targetCaseId, ...fileIds, ...fileIds);

      // 3. 도면 및 BOM 데이터 이전 (File-scoped isolation)
      await db.prepare(`
        UPDATE drawings
        SET quotation_case_id = ?
        WHERE source_file_id IN (${fPlaceholders})
      `).run(targetCaseId, ...fileIds);

      await db.prepare(`
        UPDATE bom_areas
        SET quotation_case_id = ?
        WHERE source_file_id IN (${fPlaceholders})
      `).run(targetCaseId, ...fileIds);

      await db.prepare(`
        UPDATE raw_bom_items
        SET quotation_case_id = ?
        WHERE source_file_id IN (${fPlaceholders})
      `).run(targetCaseId, ...fileIds);

      // flattened_bom_items & normalized_bom_items 이전
      for (const fid of fileIds) {
        await db.prepare(`
          UPDATE flattened_bom_items
          SET quotation_case_id = ?
          WHERE id LIKE 'fb_' || ? || '_%'
        `).run(targetCaseId, fid);

        await db.prepare(`
          UPDATE normalized_bom_items
          SET quotation_case_id = ?
          WHERE id LIKE 'norm_' || ? || '_%'
        `).run(targetCaseId, fid);
      }
    }

    // 4. 원래 1:1로 매핑되었던 이전 견적건 중 파일이 모두 빠진 고아 케이스 정리
    for (const oldId of oldCaseIds) {
      const remainingFiles = (await db.prepare(`
        SELECT COUNT(*) as cnt FROM uploaded_files
        WHERE quotation_case_id = ? AND file_role = 'SOURCE'
      `).get(oldId)) as any;

      if ((remainingFiles?.cnt || 0) === 0) {
        await db.prepare("UPDATE quotation_cases SET status = 'DELETED', deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(oldId);
      }
    }

    // 5. 첫 번째 파일의 WebGL/SVG를 새 견적건의 대표 alias로 복사 지원
    if (fileIds.length > 0) {
      const firstFileId = fileIds[0];
      const derivedDir = getStorageSubdir('derived');
      const srcBin = path.join(derivedDir, `${items[0].quotation_case_id || targetCaseId}_${firstFileId}__cad_webgl.bin`);
      const destBin = path.join(derivedDir, `${targetCaseId}__cad_webgl.bin`);
      try {
        if (fs.existsSync(srcBin)) {
          fs.copyFileSync(srcBin, destBin);
          const srcTxt = srcBin.replace('__cad_webgl.bin', '__cad_texts.json');
          const destTxt = destBin.replace('__cad_webgl.bin', '__cad_texts.json');
          if (fs.existsSync(srcTxt)) fs.copyFileSync(srcTxt, destTxt);
        }
      } catch (copyErr) {
        console.warn('[merge] Alias sync warning:', copyErr);
      }
    }

    return NextResponse.json({
      success: true,
      quotation_case_id: targetCaseId,
      message: `${items.length}개의 도면 파일이 성공적으로 하나의 견적건으로 병합되었습니다.`
    });

  } catch (err: any) {
    console.error('[inbox-merge Error]:', err);
    return NextResponse.json({ error: err?.message || '수동 병합 실패' }, { status: 500 });
  }
}
