import { db } from './db';
import { UserSession } from './auth';

export interface SystemApprovalSettings {
  id: string;
  cross_user_edit_policy: 'REQUIRE_APPROVAL' | 'ALLOW' | 'DENY';
  cross_user_approve_policy: 'REQUIRE_APPROVAL' | 'ALLOW' | 'DENY';
  require_admin_final_quote_approval: number;
  approval_valid_hours: number;
  is_approval_suspended?: number;
  updated_by_user_id?: string;
  updated_at: string;
}

export interface UserApprovalPermission {
  user_id: string;
  user_name?: string;
  user_login_id?: string;
  user_role?: string;
  can_edit_own: number;
  can_approve_own: number;
  can_edit_others: 'REQUIRE_APPROVAL' | 'ALLOW' | 'DENY';
  can_approve_others: 'REQUIRE_APPROVAL' | 'ALLOW' | 'DENY';
  can_edit_price: number;
  can_approve_quote: number;
  updated_at: string;
}

export interface CasePermissionResult {
  canEdit: boolean;
  canApprove: boolean;
  isOwner: boolean;
  isSuperAdmin: boolean;
  ownerUserId: string;
  ownerName: string;
  requiresApproval: boolean;
  approvalStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  isSuspended?: boolean;
  activeRequestId?: string;
  requestedAt?: string;
  reviewComment?: string;
  message?: string;
}

export async function getSystemApprovalSettings(): Promise<SystemApprovalSettings> {
  const row = (await db.prepare(`
    SELECT * FROM system_approval_settings WHERE id = 'GLOBAL_CONFIG'
  `).get()) as SystemApprovalSettings | undefined;

  if (row) return row;

  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO system_approval_settings (
      id, cross_user_edit_policy, cross_user_approve_policy,
      require_admin_final_quote_approval, approval_valid_hours, is_approval_suspended, updated_at
    ) VALUES ('GLOBAL_CONFIG', 'ALLOW', 'ALLOW', 0, 48, 1, ?)
  `).run(now);

  return {
    id: 'GLOBAL_CONFIG',
    cross_user_edit_policy: 'ALLOW',
    cross_user_approve_policy: 'ALLOW',
    require_admin_final_quote_approval: 0,
    approval_valid_hours: 48,
    is_approval_suspended: 1,
    updated_at: now
  };
}

export async function getUserApprovalPermissions(userId: string): Promise<UserApprovalPermission | null> {
  const row = (await db.prepare(`
    SELECT uap.*, u.name as user_name, u.login_id as user_login_id, u.role as user_role
    FROM user_approval_permissions uap
    JOIN users u ON uap.user_id = u.id
    WHERE uap.user_id = ?
  `).get(userId)) as UserApprovalPermission | undefined;

  return row || null;
}

export async function getAllUserApprovalPermissions(): Promise<UserApprovalPermission[]> {
  return (await db.prepare(`
    SELECT uap.*, u.name as user_name, u.login_id as user_login_id, u.role as user_role
    FROM user_approval_permissions uap
    JOIN users u ON uap.user_id = u.id
    WHERE u.is_active = 1
    ORDER BY CASE WHEN u.role = 'SUPER_ADMIN' THEN 0 ELSE 1 END, u.name ASC
  `).all()) as UserApprovalPermission[];
}

export async function checkCasePermission(
  userId: string,
  userRole: string,
  quotationCaseId: string
): Promise<CasePermissionResult> {
  const rawQc = (await db.prepare('SELECT * FROM quotation_cases WHERE id = ?').get(quotationCaseId)) as any;

  if (!rawQc) {
    return {
      canEdit: false,
      canApprove: false,
      isOwner: false,
      isSuperAdmin: userRole === 'SUPER_ADMIN',
      ownerUserId: '',
      ownerName: '알 수 없음',
      requiresApproval: false,
      approvalStatus: 'NONE',
      message: '견적건을 찾을 수 없습니다.'
    };
  }

  const ownerUser = rawQc.created_by_user_id
    ? (await db.prepare('SELECT name FROM users WHERE id = ?').get(rawQc.created_by_user_id)) as any
    : null;

  const qc = {
    ...rawQc,
    owner_name: ownerUser?.name || '담당자'
  };
  const ownerUserId = qc.created_by_user_id;
  const ownerName = qc.owner_name || '담당자';

  // 1. 최고관리자 (SUPER_ADMIN)는 모든 권한 보유
  if (userRole === 'SUPER_ADMIN') {
    return {
      canEdit: true,
      canApprove: true,
      isOwner: ownerUserId === userId,
      isSuperAdmin: true,
      ownerUserId,
      ownerName,
      requiresApproval: false,
      approvalStatus: 'APPROVED',
      message: '최고관리자 권한으로 모든 작업을 수행할 수 있습니다.'
    };
  }

  // 2. 본인이 담당한 견적건인 경우 -> 자유 수정 및 승인 가능
  if (ownerUserId === userId) {
    const userPerm = await getUserApprovalPermissions(userId);
    const canEdit = userPerm ? Boolean(userPerm.can_edit_own) : true;
    const canApprove = userPerm ? Boolean(userPerm.can_approve_own) : true;

    return {
      canEdit,
      canApprove,
      isOwner: true,
      isSuperAdmin: false,
      ownerUserId,
      ownerName,
      requiresApproval: false,
      approvalStatus: 'NONE',
      message: '본인이 등록한 견적건으로 자유롭게 수정 및 승인할 수 있습니다.'
    };
  }

  // 3. 다른 담당자의 견적건인 경우 (Cross-User Case)
  const settings = await getSystemApprovalSettings();
  const userPerm = await getUserApprovalPermissions(userId);

  // 💡 최고관리자 결재 승인 기능 보류 (현재 개발/검수 단계) 또는 ALLOW 정책인 경우 -> 결재 없이 자유 견적 진행 허용
  const isSuspended = settings.is_approval_suspended !== 0 || settings.cross_user_edit_policy === 'ALLOW';
  if (isSuspended) {
    return {
      canEdit: true,
      canApprove: true,
      isOwner: false,
      isSuperAdmin: false,
      ownerUserId,
      ownerName,
      requiresApproval: false,
      approvalStatus: 'APPROVED',
      isSuspended: true,
      message: '최고관리자 결재 승인 기능 보류 중: 결재 대기 없이 즉시 견적 진행 및 수정/승인이 가능합니다.'
    };
  }

  // 최고관리자 설정이 'ALLOW'이고 사용자 권한도 'ALLOW'인 경우 자유 수정
  if (settings.cross_user_edit_policy === 'ALLOW' && (!userPerm || userPerm.can_edit_others === 'ALLOW')) {
    return {
      canEdit: true,
      canApprove: true,
      isOwner: false,
      isSuperAdmin: false,
      ownerUserId,
      ownerName,
      requiresApproval: false,
      approvalStatus: 'APPROVED',
      message: '전역 협업 정책에 의해 타 담당자의 견적건 수정이 허용되었습니다.'
    };
  }

  // 최고관리자 설정 또는 사용자 권한이 'DENY'인 경우 완전 차단
  if (settings.cross_user_edit_policy === 'DENY' || userPerm?.can_edit_others === 'DENY') {
    return {
      canEdit: false,
      canApprove: false,
      isOwner: false,
      isSuperAdmin: false,
      ownerUserId,
      ownerName,
      requiresApproval: false,
      approvalStatus: 'NONE',
      message: '최고관리자 정책에 의해 타 담당자의 견적건 수정이 금지되어 있습니다.'
    };
  }

  // 기본값: 'REQUIRE_APPROVAL' -> 최고관리자의 승인 여부 조회
  const activeReq = (await db.prepare(`
    SELECT * FROM approval_requests
    WHERE quotation_case_id = ? AND requester_id = ?
    ORDER BY rowid DESC
    LIMIT 1
  `).get(quotationCaseId, userId)) as {
    id: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    created_at: string;
    reviewer_comment?: string;
  } | undefined;

  if (activeReq) {
    if (activeReq.status === 'APPROVED') {
      return {
        canEdit: true,
        canApprove: true,
        isOwner: false,
        isSuperAdmin: false,
        ownerUserId,
        ownerName,
        requiresApproval: true,
        approvalStatus: 'APPROVED',
        activeRequestId: activeReq.id,
        requestedAt: activeReq.created_at,
        reviewComment: activeReq.reviewer_comment,
        message: '최고관리자의 승인이 완료되어 타 담당자의 견적건을 수정 및 승인할 수 있습니다.'
      };
    } else if (activeReq.status === 'PENDING') {
      return {
        canEdit: false,
        canApprove: false,
        isOwner: false,
        isSuperAdmin: false,
        ownerUserId,
        ownerName,
        requiresApproval: true,
        approvalStatus: 'PENDING',
        activeRequestId: activeReq.id,
        requestedAt: activeReq.created_at,
        message: '최고관리자에게 수정/승인 권한 승인을 요청한 상태입니다. (결재 대기 중)'
      };
    } else if (activeReq.status === 'REJECTED') {
      return {
        canEdit: false,
        canApprove: false,
        isOwner: false,
        isSuperAdmin: false,
        ownerUserId,
        ownerName,
        requiresApproval: true,
        approvalStatus: 'REJECTED',
        activeRequestId: activeReq.id,
        requestedAt: activeReq.created_at,
        reviewComment: activeReq.reviewer_comment,
        message: '최고관리자에 의해 수정 권한 요청이 반려되었습니다.'
      };
    }
  }

  // 아직 승인 요청을 하지 않은 상태
  return {
    canEdit: false,
    canApprove: false,
    isOwner: false,
    isSuperAdmin: false,
    ownerUserId,
    ownerName,
    requiresApproval: true,
    approvalStatus: 'NONE',
    message: `타 담당자(${ownerName})의 견적건입니다. 수정 및 승인을 진행하려면 최고관리자의 승인이 필요합니다.`
  };
}
