import { db } from './db';
import { getSession, UserSession } from './auth';

export type ActivityType =
  | 'LOGIN'
  | 'LOGOUT'
  | 'PRICE_UPDATE'
  | 'QUOTE_TOGGLE'
  | 'QUOTE_LOCK'
  | 'BOM_APPROVAL'
  | 'FILE_UPLOAD'
  | 'FILE_DELETE'
  | 'ANALYSIS_START'
  | 'CASE_CREATE'
  | 'EXCEL_EXPORT'
  | 'PACKAGE_EXPORT'
  | string;

export interface LogActivityParams {
  userId: string;
  userName: string;
  userLoginId: string;
  userRole: string;
  activityType: ActivityType;
  quotationCaseId?: string | null;
  caseName?: string | null;
  details: string;
  ipAddress?: string | null;
}

/**
 * Directly insert an activity record into user_activity_logs
 */
export async function logUserActivity(params: LogActivityParams): Promise<void> {
  try {
    const id = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    await db.prepare(`
      INSERT INTO user_activity_logs (
        id, user_id, user_name, user_login_id, user_role,
        activity_type, quotation_case_id, case_name, details,
        ip_address, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.userId,
      params.userName,
      params.userLoginId,
      params.userRole,
      params.activityType,
      params.quotationCaseId || null,
      params.caseName || null,
      params.details,
      params.ipAddress || '127.0.0.1',
      now
    );
  } catch (err) {
    console.error('[AUDIT_LOG_ERROR] Failed to record activity:', err);
  }
}

/**
 * Record activity using the current session and HTTP request headers
 */
export async function recordActivity(
  req: Request | null,
  explicitSession: UserSession | null | undefined,
  activity: {
    activityType: ActivityType;
    quotationCaseId?: string | null;
    caseName?: string | null;
    details: string;
  }
): Promise<void> {
  try {
    let session = explicitSession;
    if (!session) {
      session = await getSession();
    }

    if (!session) {
      // Fallback for anonymous or pre-auth actions
      session = {
        userId: 'usr_guest',
        loginId: 'guest',
        name: '비인가 사용자',
        role: 'SALES_USER',
        companyId: null
      };
    }

    let ip = '127.0.0.1';
    if (req) {
      ip =
        req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
        req.headers.get('x-real-ip') ||
        '127.0.0.1';
    }

    // Look up case_name if not provided but quotationCaseId is present
    let caseName = activity.caseName;
    if (!caseName && activity.quotationCaseId) {
      try {
        const c = (await db
          .prepare('SELECT case_name, case_no FROM quotation_cases WHERE id = ?')
          .get(activity.quotationCaseId)) as { case_name: string; case_no: string } | undefined;
        if (c) {
          caseName = `[${c.case_no}] ${c.case_name}`;
        }
      } catch {}
    }

    await logUserActivity({
      userId: session.userId,
      userName: session.name,
      userLoginId: session.loginId,
      userRole: session.role,
      activityType: activity.activityType,
      quotationCaseId: activity.quotationCaseId,
      caseName: caseName,
      details: activity.details,
      ipAddress: ip
    });
  } catch (err) {
    console.error('[AUDIT_RECORD_ERROR]', err);
  }
}
