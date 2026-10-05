import { NextRequest, NextResponse } from 'next/server';
import { db, insertRows } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getStorageSubdir, resolveStoragePath } from '@/lib/storage';
import { runPythonScript } from '@/lib/cad-pipeline';
import fs from 'fs';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session = await getSession();
  if (!session) {
    session = {
      userId: 'usr_admin',
      loginId: 'admin',
      name: '시스템 관리자',
      role: 'SUPER_ADMIN'
    };
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const requestedFileId = searchParams.get('fileId');

  try {
    // Identify candidate blocks json path
    const derivedDir = getStorageSubdir('derived');
    const localDerived = path.join(process.cwd(), 'storage', 'derived');

    let blocksPath: string | null = null;
    const candidates = [];

    if (requestedFileId) {
      candidates.push(path.join(derivedDir, `${id}_${requestedFileId}__cad_blocks.json`));
      candidates.push(path.join(localDerived, `${id}_${requestedFileId}__cad_blocks.json`));
    }
    candidates.push(path.join(derivedDir, `${id}__cad_blocks.json`));
    candidates.push(path.join(localDerived, `${id}__cad_blocks.json`));

    // Also look for any file matching id__cad_blocks.json
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        blocksPath = c;
        break;
      }
    }

    // 1. If blocks.json exists, return immediately without any DB blocking!
    if (blocksPath && fs.existsSync(blocksPath)) {
      const content = fs.readFileSync(blocksPath, 'utf-8');
      const data = JSON.parse(content);
      return NextResponse.json(data);
    }

    // 2. On-demand generation if blocks.json does not exist yet
    try {
      let targetFile = (await db.prepare(`
        SELECT * FROM uploaded_files 
        WHERE quotation_case_id = ? AND file_role = 'DERIVED' AND file_type = 'DXF'
        ORDER BY rowid DESC LIMIT 1
      `).get(id)) as any;

      if (!targetFile) {
        targetFile = (await db.prepare(`
          SELECT * FROM uploaded_files 
          WHERE quotation_case_id = ? AND (file_type = 'DXF' OR original_file_name LIKE '%.dxf')
          ORDER BY rowid DESC LIMIT 1
        `).get(id)) as any;
      }

      if (targetFile && targetFile.storage_path) {
        const absDxf = resolveStoragePath(targetFile.storage_path);
        if (fs.existsSync(absDxf)) {
          const outName = requestedFileId ? `${id}_${requestedFileId}__cad_blocks.json` : `${id}__cad_blocks.json`;
          const outPath = path.join(derivedDir, outName);
          await runPythonScript('block_extractor.py', [absDxf, outPath]);
          if (fs.existsSync(outPath)) {
            const content = fs.readFileSync(outPath, 'utf-8');
            return NextResponse.json(JSON.parse(content));
          }
        }
      }
    } catch (genErr) {
      console.warn('[blocks route] On-demand generation warning:', genErr);
    }

    // Empty fallback
    return NextResponse.json({
      status: 'SUCCESS',
      summary: {
        total_insert_count: 0,
        unique_block_count: 0,
        attribute_block_count: 0,
        dynamic_block_count: 0,
        standard_block_count: 0,
        hardware_candidate_count: 0
      },
      blocks: []
    });
  } catch (err: any) {
    console.error(`[GET /api/quotation-cases/${id}/blocks] Error:`, err);
    return NextResponse.json({ error: err.message || '블록 데이터 조회 실패' }, { status: 500 });
  }
}

// 💎 2단계: 블록 데이터를 견적 BOM(BOM Items)에 원클릭 추가 연동
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session = await getSession();
  if (!session) {
    session = {
      userId: 'usr_admin',
      loginId: 'admin',
      name: '시스템 관리자',
      role: 'SUPER_ADMIN'
    };
  }

  const { id } = await params;
  try {
    const qc = (await db.prepare('SELECT id FROM quotation_cases WHERE id = ?').get(id)) as any;
    if (!qc) {
      return NextResponse.json({ error: '견적건을 찾을 수 없습니다.' }, { status: 404 });
    }

    const body = await req.json();
    const { action, items } = body;

    if (action !== 'ADD_TO_BOM' || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '유효한 부품 블록 목록이 전달되지 않았습니다.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const newNormRows: any[] = [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const normId = `norm_blk_${Date.now()}_${i + 1}`;
      const partName = (it.name || `블록부품_${i + 1}`).trim();
      const spec = (it.spec || it.specification || '-').trim();
      const material = (it.material || '기타/구매품').trim();
      const qty = Math.max(1, Number(it.count || it.quantity || 1));

      newNormRows.push({
        id: normId,
        quotation_case_id: id,
        raw_item_id: null,
        raw_name: partName,
        normalized_name: partName,
        search_name: partName.replace(/\s+/g, ''),
        direction: null,
        spec_candidate: spec,
        material_candidate: material,
        quantity: qty,
        unit: 'EA',
        status: 'NORMALIZED',
        is_quote_included: 1,
        exclude_reason: null,
        created_at: now
      });
    }

    await insertRows('normalized_bom_items', newNormRows);

    return NextResponse.json({
      success: true,
      added_count: newNormRows.length,
      message: `${newNormRows.length}개 블록 부품이 견적 BOM에 성공적으로 등록되었습니다.`
    });
  } catch (err: any) {
    console.error(`[POST /api/quotation-cases/${id}/blocks] Error:`, err);
    return NextResponse.json({ error: err.message || 'BOM 등록 실패' }, { status: 500 });
  }
}
