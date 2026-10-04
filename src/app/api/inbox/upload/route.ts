import { NextRequest, NextResponse } from 'next/server';
import { db, insertRows } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getStorageSubdir } from '@/lib/storage';
import { analysisQueue } from '@/lib/analysis-queue';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const formData = await req.formData();
    // Support both 'files' multiple field and individual file items
    let files = formData.getAll('files') as File[];
    if (files.length === 0) {
      const single = formData.get('file') as File | null;
      if (single) files = [single];
    }

    if (files.length === 0) {
      return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const batchId = `batch_${Date.now()}`;
    const firstFileName = files[0].name;
    const batchName = files.length > 1
      ? `${firstFileName} 외 ${files.length - 1}건 일괄 접수`
      : `${firstFileName} 일괄 접수`;

    // 1. Create upload_batches
    await insertRows('upload_batches', [{
      id: batchId,
      batch_name: batchName,
      status: 'PROCESSING',
      total_files: files.length,
      processed_files: 0,
      failed_files: 0,
      created_by_user_id: session.userId,
      created_at: now
    }]);

    const createdItems: any[] = [];
    const itemIdsToQueue: string[] = [];
    const storageDir = getStorageSubdir('files');

    for (let idx = 0; idx < files.length; idx++) {
      const file = files[idx];
      const originalName = file.name;
      const ext = path.extname(originalName).toLowerCase();

      // Basic format validation
      if (!['.dwg', '.dxf', '.pdf', '.xls', '.xlsx'].includes(ext)) {
        continue;
      }

      const fileType = ext === '.dwg' ? 'DWG' : ext === '.dxf' ? 'DXF' : ext === '.pdf' ? 'PDF' : 'EXCEL';
      const buffer = Buffer.from(await file.arrayBuffer());

      // Magic Header check for DWG
      if (fileType === 'DWG') {
        const magic = buffer.subarray(0, 6).toString('ascii');
        if (!magic.startsWith('AC10') && !['MC0.0', 'AC1.2', 'AC1.4'].includes(magic)) {
          console.warn(`[inbox-upload] Invalid magic header for DWG file: ${originalName}`);
        }
      }

      const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
      const storedFileName = `${Date.now()}_${idx}_${crypto.randomBytes(4).toString('hex')}${ext}`;
      const storagePath = path.join(storageDir, storedFileName);
      fs.writeFileSync(storagePath, buffer);

      const caseId = `case_${Date.now()}_${idx + 1}`;
      const caseNo = `QT-${Date.now().toString().slice(-6)}-${(idx + 1).toString().padStart(2, '0')}`;
      const fileId = `file_${Date.now()}_${idx + 1}`;
      const itemId = `bitem_${Date.now()}_${idx + 1}`;

      // 2. Create initial quotation_case for this file
      await insertRows('quotation_cases', [{
        id: caseId,
        case_no: caseNo,
        company_id: 'comp_unassigned',
        case_name: `[일괄접수] ${originalName}`,
        request_date: now.slice(0, 10),
        status: 'REGISTERED',
        quote_readiness: 'PENDING_BOM',
        created_by_user_id: session.userId,
        created_at: now
      }]);

      // 3. Register uploaded_files
      await insertRows('uploaded_files', [{
        id: fileId,
        quotation_case_id: caseId,
        original_file_name: originalName,
        stored_file_name: storedFileName,
        storage_path: storagePath,
        file_type: fileType,
        file_role: 'SOURCE',
        file_size: buffer.length,
        checksum,
        upload_status: 'UPLOADED',
        uploaded_by_user_id: session.userId,
        created_at: now
      }]);

      // 4. Register batch_items
      const batchItemRecord = {
        id: itemId,
        batch_id: batchId,
        uploaded_file_id: fileId,
        quotation_case_id: caseId,
        file_name: originalName,
        file_size: buffer.length,
        status: 'PENDING',
        progress: 0,
        error_message: null,
        retry_count: 0,
        sort_order: idx + 1,
        draft_data: null,
        created_at: now
      };

      await insertRows('batch_items', [batchItemRecord]);

      createdItems.push({
        ...batchItemRecord,
        case_no: caseNo
      });
      itemIdsToQueue.push(itemId);
    }

    // 5. Enqueue all items to AnalysisQueue for background execution (Max 2 concurrent)
    analysisQueue.enqueueBatch(itemIdsToQueue);

    return NextResponse.json({
      success: true,
      batch: {
        id: batchId,
        batch_name: batchName,
        total_files: createdItems.length
      },
      items: createdItems
    });

  } catch (err: any) {
    console.error('[inbox-upload Error]:', err);
    return NextResponse.json({ error: err?.message || '일괄 업로드 처리 실패' }, { status: 500 });
  }
}
