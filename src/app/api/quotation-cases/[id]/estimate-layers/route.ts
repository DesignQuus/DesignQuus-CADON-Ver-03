import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStorageSubdir } from '@/lib/storage';
import fs from 'fs';
import path from 'path';

// Local and reliable storage for estimate layers and review states
function getLayerFilePath(caseId: string): string {
  const derivedDir = getStorageSubdir('derived');
  return path.join(derivedDir, `${caseId}__estimate_layers.json`);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const filePath = getLayerFilePath(id);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return NextResponse.json({ status: 'SUCCESS', ...data });
    }

    // Default empty layer state
    return NextResponse.json({
      status: 'SUCCESS',
      reviewedItems: [],
      inProgressItems: [],
      excludedItems: [],
      userGroups: [],
      ghostOpacity: 0.15,
      hideMode: 'GHOST', // 'GHOST' | 'HIDE'
      updatedAt: null
    });
  } catch (err: any) {
    console.error(`[GET /api/quotation-cases/${id}/estimate-layers] Error:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const filePath = getLayerFilePath(id);

    const saveData = {
      reviewedItems: body.reviewedItems || [],
      inProgressItems: body.inProgressItems || [],
      excludedItems: body.excludedItems || [],
      userGroups: body.userGroups || [],
      ghostOpacity: body.ghostOpacity ?? 0.15,
      hideMode: body.hideMode || 'GHOST',
      updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2), 'utf-8');

    return NextResponse.json({
      success: true,
      message: '견적 레이어 상태가 성공적으로 저장되었습니다.',
      data: saveData
    });
  } catch (err: any) {
    console.error(`[POST /api/quotation-cases/${id}/estimate-layers] Error:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
