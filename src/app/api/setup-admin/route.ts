export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { queryTable, insertRows, deleteRows } from '@/../egdesk-helpers';
import bcrypt from 'bcryptjs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    // 1. 기존 어드민 존재 여부 확인
    const result = await queryTable('users', {
      filters: { login_id: 'admin' },
      limit: 1
    });

    if (result.rows && result.rows.length > 0 && !force) {
      return NextResponse.json({
        success: true,
        message: 'Admin account (admin / Cadon1234!@) already exists. Use ?force=true to reset.'
      });
    }

    // force=true일 경우 기존 admin 계정 초기화
    if (force && result.rows && result.rows.length > 0) {
      await deleteRows('users', {
        filters: { login_id: 'admin' }
      });
      console.log('Force reset: Cleared existing admin account.');
    }

    const password_hash = bcrypt.hashSync('Cadon1234!@', 10);
    const dateStr = new Date().toISOString();

    await insertRows('users', [
      {
        id: 'usr_admin',
        login_id: 'admin',
        password_hash,
        name: '시스템 최고관리자',
        role: 'SUPER_ADMIN',
        company_id: null,
        is_active: 1,
        tenant_id: 'tenant-cadon',
        uuid: 'usr_admin',
        created_at: dateStr,
        updated_at: dateStr
      }
    ]);

    return NextResponse.json({
      success: true,
      message: force
        ? 'Admin account force-reset successfully (admin / Cadon1234!@)'
        : 'Admin account created successfully (admin / Cadon1234!@)'
    });
  } catch (error: any) {
    console.error('Setup Admin Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
