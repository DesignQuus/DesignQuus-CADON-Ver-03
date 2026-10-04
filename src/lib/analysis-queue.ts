import { db } from './db';
import { processCadFilePipeline } from './cad-pipeline';

export interface QueueItemInfo {
  id: string;
  batch_id: string;
  uploaded_file_id: string;
  quotation_case_id: string;
  file_name: string;
  file_size: number;
  status: 'PENDING' | 'ANALYZING' | 'READY' | 'ON_HOLD' | 'COMPLETED' | 'ERROR';
  progress: number;
  error_message: string | null;
  retry_count: number;
  sort_order: number;
  draft_data: string | null;
  created_at: string;
}

class AnalysisQueue {
  private static instance: AnalysisQueue;
  private queue: string[] = []; // batch_item IDs
  private activeCount: number = 0;
  private readonly MAX_CONCURRENT: number = 2;
  private isProcessing: boolean = false;
  private initialized: boolean = false;

  private constructor() {}

  public static getInstance(): AnalysisQueue {
    if (!AnalysisQueue.instance) {
      AnalysisQueue.instance = new AnalysisQueue();
    }
    return AnalysisQueue.instance;
  }

  /**
   * 서버 기동 시 미처리/분석중단 건 복구
   */
  public async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      // 서버 재시작으로 비정상 종료된 ANALYZING 건을 PENDING으로 복원
      await db.prepare(`
        UPDATE batch_items
        SET status = 'PENDING', progress = 0
        WHERE status = 'ANALYZING'
      `).run();

      // PENDING 상태인 항목들을 큐에 순서대로 적재
      const pendingItems = (await db.prepare(`
        SELECT id FROM batch_items
        WHERE status = 'PENDING'
        ORDER BY sort_order ASC, rowid ASC
      `).all()) as { id: string }[];

      for (const item of pendingItems) {
        if (!this.queue.includes(item.id)) {
          this.queue.push(item.id);
        }
      }

      if (this.queue.length > 0) {
        this.processNext();
      }
    } catch (err) {
      console.warn('[AnalysisQueue] Initialization warning:', err);
    }
  }

  /**
   * 큐에 새 항목 추가
   */
  public enqueue(batchItemId: string): void {
    if (!this.queue.includes(batchItemId)) {
      this.queue.push(batchItemId);
    }
    this.processNext();
  }

  /**
   * 여러 항목 일괄 추가
   */
  public enqueueBatch(batchItemIds: string[]): void {
    for (const id of batchItemIds) {
      if (!this.queue.includes(id)) {
        this.queue.push(id);
      }
    }
    this.processNext();
  }

  /**
   * 보류 토글 (ON_HOLD <-> PENDING)
   */
  public async toggleHold(batchItemId: string): Promise<{ success: boolean; status: string }> {
    const item = (await db.prepare('SELECT status FROM batch_items WHERE id = ?').get(batchItemId)) as any;
    if (!item) return { success: false, status: 'NOT_FOUND' };

    if (item.status === 'ON_HOLD') {
      await db.prepare(`
        UPDATE batch_items
        SET status = 'PENDING', progress = 0, error_message = null
        WHERE id = ?
      `).run(batchItemId);
      this.enqueue(batchItemId);
      return { success: true, status: 'PENDING' };
    } else {
      // 큐 대기열에서 제거
      this.queue = this.queue.filter(id => id !== batchItemId);
      await db.prepare(`
        UPDATE batch_items
        SET status = 'ON_HOLD'
        WHERE id = ?
      `).run(batchItemId);
      return { success: true, status: 'ON_HOLD' };
    }
  }

  /**
   * 오류 건 재시도
   */
  public async retry(batchItemId: string): Promise<boolean> {
    const item = (await db.prepare('SELECT status, retry_count FROM batch_items WHERE id = ?').get(batchItemId)) as any;
    if (!item) return false;

    const newRetryCount = (item.retry_count || 0) + 1;
    await db.prepare(`
      UPDATE batch_items
      SET status = 'PENDING', progress = 0, error_message = null, retry_count = ?
      WHERE id = ?
    `).run(newRetryCount, batchItemId);

    this.enqueue(batchItemId);
    return true;
  }

  /**
   * 워커 루프: MAX_CONCURRENT 한도 내에서 병렬 분석 실행
   */
  private async processNext(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.activeCount < this.MAX_CONCURRENT && this.queue.length > 0) {
        const nextId = this.queue.shift();
        if (!nextId) break;

        this.activeCount++;
        // 백그라운드 비동기 실행 (activeCount 관리)
        this.runWorker(nextId).finally(() => {
          this.activeCount--;
          this.processNext();
        });
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 단일 항목 분석 워커
   */
  private async runWorker(batchItemId: string): Promise<void> {
    const item = (await db.prepare('SELECT * FROM batch_items WHERE id = ?').get(batchItemId)) as any;
    if (!item) return;

    // 이미 보류나 다른 상태로 변경된 경우 건너뜀
    if (item.status === 'ON_HOLD' || item.status === 'COMPLETED') {
      return;
    }

    const now = new Date().toISOString();

    try {
      // 1. 상태를 ANALYZING 및 진행률 20%로 갱신
      await db.prepare(`
        UPDATE batch_items
        SET status = 'ANALYZING', progress = 20, error_message = null
        WHERE id = ?
      `).run(batchItemId);

      // 2. CAD 파이프라인 구동 전 유효성 검사
      const fileId = item.uploaded_file_id;
      const caseId = item.quotation_case_id;

      if (!fileId || !caseId) {
        throw new Error('FILE_OR_CASE_ID_MISSING');
      }

      // 진행률 40% (CAD 파이프라인 진입)
      await db.prepare('UPDATE batch_items SET progress = 40 WHERE id = ?').run(batchItemId);

      // 3. 파일 단위 CAD 분석 파이프라인 실행 (File-scoped isolation)
      const result = await processCadFilePipeline(caseId, fileId, 'system-worker');

      if (!result.success) {
        throw new Error(result.error || 'CAD_PIPELINE_EXECUTION_FAILED');
      }

      // 진행률 80% (BOM 정규화 및 마스터 매칭 완료)
      await db.prepare('UPDATE batch_items SET progress = 80 WHERE id = ?').run(batchItemId);

      // 4. 분석 완료 처리 (상태: READY - 검토 준비 완료, 진행률: 100%)
      await db.prepare(`
        UPDATE batch_items
        SET status = 'READY', progress = 100, error_message = null
        WHERE id = ?
      `).run(batchItemId);

      // 5. 배치 전체 상태 집계
      await this.updateBatchAggregate(item.batch_id);

    } catch (err: any) {
      console.error(`[AnalysisQueue] Error processing batch item ${batchItemId}:`, err);
      const errMsg = err?.message || String(err);

      await db.prepare(`
        UPDATE batch_items
        SET status = 'ERROR', progress = 0, error_message = ?
        WHERE id = ?
      `).run(errMsg, batchItemId);

      await this.updateBatchAggregate(item.batch_id);
    }
  }

  /**
   * upload_batches 레코드 진행 통계 갱신
   */
  private async updateBatchAggregate(batchId: string): Promise<void> {
    try {
      const stats = (await db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status IN ('READY', 'COMPLETED') THEN 1 ELSE 0 END) as processed,
          SUM(CASE WHEN status = 'ERROR' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status IN ('PENDING', 'ANALYZING') THEN 1 ELSE 0 END) as remaining
        FROM batch_items
        WHERE batch_id = ?
      `).get(batchId)) as any;

      if (stats) {
        const total = stats.total || 0;
        const processed = stats.processed || 0;
        const failed = stats.failed || 0;
        const remaining = stats.remaining || 0;

        let batchStatus = 'PROCESSING';
        if (remaining === 0) {
          batchStatus = failed === total && total > 0 ? 'FAILED' : 'COMPLETED';
        }

        await db.prepare(`
          UPDATE upload_batches
          SET status = ?, processed_files = ?, failed_files = ?
          WHERE id = ?
        `).run(batchStatus, processed, failed, batchId);
      }
    } catch (aggErr) {
      console.warn('[AnalysisQueue] updateBatchAggregate warning:', aggErr);
    }
  }
}

export const analysisQueue = AnalysisQueue.getInstance();
