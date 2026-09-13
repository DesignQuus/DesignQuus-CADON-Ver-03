import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { recordActivity } from '@/lib/audit';
import { getStorageSubdir } from '@/lib/storage';
import { queryTable, insertRows } from '../../../../../../egdesk-helpers';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const getRows = (res: any): any[] => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const cases = getRows(await queryTable('quotation_cases', { filters: { id }, limit: 1 }));
  const qc = cases[0] || null;
  if (!qc) {
    return NextResponse.json({ error: '견적건을 찾을 수 없습니다.' }, { status: 404 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: '파일이 전달되지 않았습니다.' }, { status: 400 });
    }

    const originalName = file.name;
    const ext = path.extname(originalName).toLowerCase();
    
    // Allowed extensions: .dwg, .dxf, .pdf, .xls, .xlsx
    if (!['.dwg', '.dxf', '.pdf', '.xls', '.xlsx'].includes(ext)) {
      return NextResponse.json({ error: `지원하지 않는 파일 형식입니다 (${ext}). .dwg, .dxf, .pdf, .xlsx 만 지원합니다.` }, { status: 400 });
    }

    const fileType = ext === '.dwg' ? 'DWG' : ext === '.dxf' ? 'DXF' : ext === '.pdf' ? 'PDF' : 'EXCEL';
    const buffer = Buffer.from(await file.arrayBuffer());

    // Magic Header check for DWG
    if (fileType === 'DWG') {
      const magic = buffer.subarray(0, 6).toString('ascii');
      if (!magic.startsWith('AC10') && !['MC0.0', 'AC1.2', 'AC1.4'].includes(magic)) {
        return NextResponse.json({ error: '유효한 DWG 바이너리 파일이 아닙니다 (Invalid Magic Header).' }, { status: 400 });
      }
    }

    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    const storageDir = getStorageSubdir('files');

    const storedFileName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
    const storagePath = path.join(storageDir, storedFileName);
    fs.writeFileSync(storagePath, buffer);

    const fileId = `file_${Date.now()}`;
    const now = new Date().toISOString();

    await insertRows('uploaded_files', [{
      id: fileId,
      quotation_case_id: id,
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

    // Audit log: FILE_UPLOAD
    await recordActivity(req, session, {
      activityType: 'FILE_UPLOAD',
      quotationCaseId: id,
      details: `도면 파일 업로드: ${originalName} (${fileType}, ${(buffer.length / 1024).toFixed(1)} KB)`
    });

    return NextResponse.json({
      success: true,
      file: {
        id: fileId,
        original_file_name: originalName,
        file_type: fileType,
        file_size: buffer.length,
        checksum
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '파일 업로드 실패' }, { status: 500 });
  }
}
