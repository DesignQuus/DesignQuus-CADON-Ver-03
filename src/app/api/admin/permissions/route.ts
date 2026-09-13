import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { recordActivity } from '@/lib/audit';
import { getSystemApprovalSettings, getAllUserApprovalPermissions } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const settings = await getSystemApprovalSettings();
  const userPermissions = await getAllUserApprovalPermissions();
  const pendingRow = (await db.prepare(`
    SELECT COUNT(*) as cnt FROM approval_requests WHERE status = 'PENDING'
  `).get()) as { cnt: number };

  return NextResponse.json({
    settings,
    userPermissions,
    pendingCount: pendingRow?.cnt || 0,
    isSuperAdmin: session.role === 'SUPER_ADMIN'
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  if (session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: '최고관리자 권한이 필요합니다.' }, { status: 403 });
  }

  try {
    const { settings, userPermissions } = await req.json();
    const now = new Date().toISOString();

    const runTx = db.transaction(async () => {
      // 1. Update global settings if provided
      if (settings) {
        await db.prepare(`
          INSERT INTO system_approval_settings (
            id, cross_user_edit_policy, cross_user_approve_policy,
            require_admin_final_quote_approval, approval_valid_hours, updated_by_user_id, updated_at
          ) VALUES ('GLOBAL_CONFIG', ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            cross_user_edit_policy = excluded.cross_user_edit_policy,
            cross_user_approve_policy = excluded.cross_user_approve_policy,
            require_admin_final_quote_approval = excluded.require_admin_final_quote_approval,
            approval_valid_hours = excluded.approval_valid_hours,
            updated_by_user_id = excluded.updated_by_user_id,
            updated_at = excluded.updated_at
        `).run(
          settings.cross_user_edit_policy || 'REQUIRE_APPROVAL',
          settings.cross_user_approve_policy || 'REQUIRE_APPROVAL',
          settings.require_admin_final_quote_approval ? 1 : 0,
          settings.approval_valid_hours || 48,
          session.userId,
          now
        );
      }

      // 2. Update user permissions matrix if provided
      if (Array.isArray(userPermissions)) {
        for (const u of userPermissions) {
          await db.prepare(`
            INSERT INTO user_approval_permissions (
              user_id, can_edit_own, can_approve_own, can_edit_others,
              can_approve_others, can_edit_price, can_approve_quote, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              can_edit_own = excluded.can_edit_own,
              can_approve_own = excluded.can_approve_own,
              can_edit_others = excluded.can_edit_others,
              can_approve_others = excluded.can_approve_others,
              can_edit_price = excluded.can_edit_price,
              can_approve_quote = excluded.can_approve_quote,
              updated_at = excluded.updated_at
          `).run(
            u.user_id,
            u.can_edit_own !== undefined ? (u.can_edit_own ? 1 : 0) : 1,
            u.can_approve_own !== undefined ? (u.can_approve_own ? 1 : 0) : 1,
            u.can_edit_others || 'REQUIRE_APPROVAL',
            u.can_approve_others || 'REQUIRE_APPROVAL',
            u.can_edit_price !== undefined ? (u.can_edit_price ? 1 : 0) : 1,
            u.can_approve_quote !== undefined ? (u.can_approve_quote ? 1 : 0) : 1,
            now
          );
        }
      }
    });
    await runTx();

    // Audit log
    await recordActivity(req, session, {
      activityType: 'PRICE_UPDATE', // Or custom admin config
      details: '최고관리자에 의한 시스템 승인권한 설정 및 담당자별 권한 매트릭스 갱신 완료'
    });

    return NextResponse.json({
      success: true,
      message: '승인권한 설정이 성공적으로 저장되었습니다.'
    });
  } catch (err: any) {
    console.error('Save permissions error:', err);
    return NextResponse.json({ error: err.message || '저장 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
