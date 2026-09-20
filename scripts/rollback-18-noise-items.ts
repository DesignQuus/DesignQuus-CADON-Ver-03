import { db } from '../src/lib/db';

async function rollback18NoiseItems() {
  const caseId = 'case_1789766302590';
  const noiseItemIds = [
    'final_norm_case_1789766302590_102', // 10U+00B0
    'final_norm_case_1789766302590_103', // 2 SET
    'final_norm_case_1789766302590_120', // PROJECT NO.
    'final_norm_case_1789766302590_121', // A3
    'final_norm_case_1789766302590_125', // 365 X 365
    'final_norm_case_1789766302590_126', // 300 X 400
    'final_norm_case_1789766302590_132', // PAINT (RAL7035 반광)
    'final_norm_case_1789766302590_134', // 열처리 HRC 45~55
    'final_norm_case_1789766302590_135', // 1.2T
    'final_norm_case_1789766302590_136', // MAIN C V DRIVE END COVER : 1 EA
    'final_norm_case_1789766302590_137', // PROJECT NAME
    'final_norm_case_1789766302590_138', // PROJECT NO.
    'final_norm_case_1789766302590_139', // NO. / REMAPK
    'final_norm_case_1789766302590_140', // SUB C V RETURN END COVER : 1 EA
    'final_norm_case_1789766302590_141', // 1.2T
    'final_norm_case_1789766302590_142', // 세 창 인 터 내 쇼 날 (주)
    'final_norm_case_1789766302590_143', // 신형 표준 타입
    'final_norm_case_1789766302590_144'  // PROJECT NAME / NOTE 공차
  ];

  for (const fbiId of noiseItemIds) {
    const fbi = (await db.prepare('SELECT normalized_item_id FROM final_bom_items WHERE id = ?').get(fbiId)) as any;
    if (fbi && fbi.normalized_item_id) {
      await db.prepare(`
        UPDATE normalized_bom_items 
        SET is_quote_included = 1, 
            exclude_reason = NULL
        WHERE id = ? AND quotation_case_id = ?
      `).run(fbi.normalized_item_id, caseId);
    }
  }

  console.log(`[원복 완료] normalized_bom_items 18건을 원래 상태(is_quote_included = 1, exclude_reason = NULL)로 완벽히 롤백했습니다.`);
}

rollback18NoiseItems().catch(console.error);
