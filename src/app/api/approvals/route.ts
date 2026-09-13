import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { recordActivity } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status');
  const caseId = searchParams.get('caseId');

  let query = `
    SELECT ar.*,
      qc.case_no, qc.case_name,
      c.company_name,
      u_req.name as requester_name, u_req.role as requester_role,
      u_own.name as owner_name, u_own.role as owner_role,
      u_rev.name as reviewer_name
    FROM approval_requests ar
    JOIN quotation_cases qc ON ar.quotation_case_id = qc.id
    JOIN companies c ON qc.company_id = c.id
    JOIN users u_req ON ar.requester_user_id = u_req.id
    JOIN users u_own ON ar.owner_user_id = u_own.id
    LEFT JOIN users u_rev ON ar.reviewed_by_user_id = u_rev.id
    WHERE 1=1
  `;
  const params: any[] = [];

  // Super admin can see all; regular sales users see only their requests
  if (session.role !== 'SUPER_ADMIN') {
    query += ` AND ar.requester_user_id = ?`;
    params.push(session.userId);
  }

  if (statusFilter && statusFilter !== 'ALL') {
    query += ` AND ar.status = ?`;
    params.push(statusFilter);
  }

  if (caseId) {
    query += ` AND ar.quotation_case_id = ?`;
    params.push(caseId);
  }

  query += ` ORDER BY ar.rowid DESC`;

  const requests = await db.prepare(query).all(...params);
  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const { quotationCaseId, reason, requestType = 'EDIT_CASE' } = await req.json();

    if (!quotationCaseId) {
      return NextResponse.json({ error: '견적건 ID가 필요합니다.' }, { status: 400 });
    }
    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: '수정 또는 승인 요청 사유를 입력해주세요.' }, { status: 400 });
    }

    const qc = (await db.prepare('SELECT * FROM quotation_cases WHERE id = ?').get(quotationCaseId)) as any;

    if (!qc) {
      return NextResponse.json({ error: '해당 견적건을 찾을 수 없습니다.' }, { status: 404 });
    }

    const ownerUser = qc.created_by_user_id ? (await db.prepare('SELECT name FROM users WHERE id = ?').get(qc.created_by_user_id)) as any : null;
    qc.owner_name = ownerUser?.name || '담당자';

    if (qc.created_by_user_id === session.userId) {
      return NextResponse.json({ error: '본인이 담당한 견적건은 최고관리자 승인 없이 직접 수정 가능합니다.' }, { status: 400 });
    }

    // Check if there is already a PENDING request
    const existingPending = (await db.prepare(`
      SELECT * FROM approval_requests
      WHERE quotation_case_id = ? AND requester_user_id = ? AND status = 'PENDING'
    `).get(quotationCaseId, session.userId)) as any;

    if (existingPending) {
      return NextResponse.json({
        error: '이미 해당 견적건에 대해 결재 대기 중인 승인 요청이 존재합니다.',
        existingRequest: existingPending
      }, { status: 409 });
    }

    const now = new Date().toISOString();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    await db.prepare(`
      INSERT INTO approval_requests (
        id, request_type, quotation_case_id, requester_user_id,
        owner_user_id, reason, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)
    `).run(
      requestId,
      requestType,
      quotationCaseId,
      session.userId,
      qc.created_by_user_id,
      reason.trim(),
      now
    );

    // Record audit log
    await recordActivity(req, session, {
      activityType: 'APPROVAL_REQUEST',
      quotationCaseId: qc.id,
      caseName: qc.case_name,
      details: `${session.name} 담당자가 타 담당자(${qc.owner_name})의 견적건(${qc.case_no})에 대해 최고관리자 결재 승인을 요청함 (사유: ${reason.trim()})`
    });

    const newRequest = await db.prepare(`
      SELECT ar.*, qc.case_no, qc.case_name
      FROM approval_requests ar
      JOIN quotation_cases qc ON ar.quotation_case_id = qc.id
      WHERE ar.id = ?
    `).get(requestId);

    return NextResponse.json({
      success: true,
      message: '최고관리자에게 수정/승인 권한 결재 요청이 성공적으로 접수되었습니다.',
      request: newRequest
    }, { status: 201 });
  } catch (err: any) {
    console.error('Create approval request error:', err);
    return NextResponse.json({ error: err.message || '요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
