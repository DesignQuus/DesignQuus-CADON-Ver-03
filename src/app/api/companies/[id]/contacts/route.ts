import { NextRequest, NextResponse } from 'next/server';
import { db, insertRows, queryTable, updateRows } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { formatPhoneNumber } from '@/lib/formatters';

export const dynamic = 'force-dynamic';

/**
 * GET /api/companies/[id]/contacts
 * 특정 고객사의 담당자 목록 조회
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id: companyId } = await params;
  try {
    const contacts = (await db.prepare(`
      SELECT * FROM company_contacts
      WHERE company_id = ?
      ORDER BY is_primary DESC, created_at ASC
    `).all(companyId)) as any[];

    return NextResponse.json({ success: true, contacts });
  } catch (err: any) {
    console.error(`GET /api/companies/${companyId}/contacts error:`, err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/companies/[id]/contacts
 * 신규 고객사 담당자 등록
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id: companyId } = await params;
  try {
    const body = await req.json();
    const contactName = (body.contact_name || body.contactName || '').trim();
    if (!contactName) {
      return NextResponse.json({ success: false, error: '담당자 이름을 입력해주세요.' }, { status: 400 });
    }

    const rawPhone = body.phone || body.manager_contact || '';
    const phone = formatPhoneNumber(rawPhone);
    const email = (body.email || '').trim();
    const department = (body.department || '').trim();
    const position = (body.position || '').trim();
    const isPrimary = body.is_primary ? 1 : 0;
    const memo = (body.memo || '').trim();
    const now = new Date().toISOString();
    const contactId = `cnt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // 만약 isPrimary로 지정했다면 기존 다른 담당자들의 is_primary를 0으로 리셋
    if (isPrimary === 1) {
      await db.prepare(`
        UPDATE company_contacts SET is_primary = 0 WHERE company_id = ?
      `).run(companyId);
    }

    await db.prepare(`
      INSERT INTO company_contacts (
        id, company_id, contact_name, phone, email,
        department, position, is_primary, memo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      contactId, companyId, contactName, phone, email,
      department, position, isPrimary, memo, now, now
    );

    const created = await db.prepare('SELECT * FROM company_contacts WHERE id = ?').get(contactId);

    return NextResponse.json({ success: true, contact: created });
  } catch (err: any) {
    console.error(`POST /api/companies/${companyId}/contacts error:`, err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * PUT /api/companies/[id]/contacts
 * 고객사 담당자 정보 수정
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id: companyId } = await params;
  try {
    const body = await req.json();
    const contactId = body.id;
    if (!contactId) {
      return NextResponse.json({ success: false, error: '담당자 ID가 필요합니다.' }, { status: 400 });
    }

    const contactName = (body.contact_name || body.contactName || '').trim();
    const rawPhone = body.phone || '';
    const phone = formatPhoneNumber(rawPhone);
    const email = (body.email || '').trim();
    const department = (body.department || '').trim();
    const position = (body.position || '').trim();
    const isPrimary = body.is_primary ? 1 : 0;
    const memo = (body.memo || '').trim();
    const now = new Date().toISOString();

    if (isPrimary === 1) {
      await db.prepare(`
        UPDATE company_contacts SET is_primary = 0 WHERE company_id = ? AND id != ?
      `).run(companyId, contactId);
    }

    await db.prepare(`
      UPDATE company_contacts
      SET contact_name = ?, phone = ?, email = ?, department = ?,
          position = ?, is_primary = ?, memo = ?, updated_at = ?
      WHERE id = ? AND company_id = ?
    `).run(
      contactName, phone, email, department,
      position, isPrimary, memo, now, contactId, companyId
    );

    const updated = await db.prepare('SELECT * FROM company_contacts WHERE id = ?').get(contactId);

    return NextResponse.json({ success: true, contact: updated });
  } catch (err: any) {
    console.error(`PUT /api/companies/${companyId}/contacts error:`, err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/companies/[id]/contacts
 * 고객사 담당자 삭제
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id: companyId } = await params;
  try {
    const { searchParams } = new URL(req.url);
    const contactId = searchParams.get('contactId');
    if (!contactId) {
      return NextResponse.json({ success: false, error: '삭제할 담당자 ID가 필요합니다.' }, { status: 400 });
    }

    await db.prepare(`
      DELETE FROM company_contacts WHERE id = ? AND company_id = ?
    `).run(contactId, companyId);

    return NextResponse.json({ success: true, message: '담당자가 삭제되었습니다.' });
  } catch (err: any) {
    console.error(`DELETE /api/companies/${companyId}/contacts error:`, err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
