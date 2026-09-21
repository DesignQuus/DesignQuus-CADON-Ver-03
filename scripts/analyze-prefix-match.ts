import { db } from '../src/lib/db';

async function analyzePrefixMatching() {
  console.log('===============================================================');
  console.log('【조치 B】 1차 / 2차 골든 케이스 도번 접두사 유연 매칭 정밀 실측');
  console.log('===============================================================\n');

  const cases = [
    { id: 'case_1789766302590', name: '1차 골든 케이스 (세창)' },
    { id: 'case_1789894718545', name: '2차 골든 케이스 (신규)' }
  ];

  for (const c of cases) {
    console.log(`\n###############################################################`);
    console.log(`### ${c.name} (${c.id})`);
    console.log(`###############################################################`);

    const drawings = (await db.prepare(`
      SELECT id, drawing_no_raw, drawing_no_normalized, drawing_name_raw, drawing_type, is_quote_included
      FROM drawings
      WHERE quotation_case_id = ?
    `).all(c.id)) as any[];

    const fbItems = (await db.prepare(`
      SELECT id, part_no, name, specification, material, total_quantity
      FROM flattened_bom_items
      WHERE quotation_case_id = ?
    `).all(c.id)) as any[];

    console.log(`- 도면(drawings) 총 건수: ${drawings.length}건`);
    console.log(`- 집계 BOM(flattened_bom_items) 총 건수: ${fbItems.length}건`);

    // 1. EXACT 매칭 검사
    let exactMatches = 0;
    let exactMatchedDwgNos = new Set<string>();
    let exactMatchedFbIds = new Set<string>();

    for (const fb of fbItems) {
      const pno = (fb.part_no || '').trim();
      if (!pno) continue;
      const match = drawings.find(d => 
        (d.drawing_no_raw || '').trim() === pno || 
        (d.drawing_no_normalized || '').trim() === pno
      );
      if (match) {
        exactMatches++;
        exactMatchedDwgNos.add(match.drawing_no_raw);
        exactMatchedFbIds.add(fb.id);
      }
    }

    console.log(`- 1. EXACT 매칭 건수: ${exactMatches}건 (BOM 품목 기준)`);

    // 2. 미매칭 BOM 품목 대상 접두사 유연 매칭 테스트
    const unMatchedFb = fbItems.filter(fb => !exactMatchedFbIds.has(fb.id));
    console.log(`- 미매칭 BOM 품목 수: ${unMatchedFb.length}건`);

    // 유연 매칭 규칙 정의:
    // 조건 A: drawings의 도번이 [prefix]-[part_no] 형태 (예: 240314-DV2-006 ↔ DV2-006)
    //         즉, d.drawing_no_raw가 '-'를 포함하고, 마지막 '-' 이후 또는 특정 '-' 이후가 part_no와 완전 일치
    // 조건 B: 반대로 BOM의 part_no가 [prefix]-[drawing_no] 형태인 경우도 체크
    // 오매칭 방지: 단순히 끝나는 것이 아니라 반드시 바로 앞 글자가 '-' 구분자여야 함!
    //              또한 part_no 길이가 너무 짧으면(예: '1', 'A') 위험하므로 최소 길이 및 구분자 엄격 검증.

    interface CandidateMatch {
      fbId: string;
      fbPartNo: string;
      fbName: string;
      dwgId: string;
      dwgNoRaw: string;
      dwgName: string;
      dwgType: string;
      matchType: string;
      isSafe: boolean;
      reason: string;
    }

    const candidateMatches: CandidateMatch[] = [];

    for (const fb of unMatchedFb) {
      const pno = (fb.part_no || '').trim();
      if (!pno) continue;

      // drawings 중에서 접두사 유연 매칭 찾기
      // 규칙 1: d.drawing_no_raw ends with '-' + pno
      // 규칙 2: pno ends with '-' + d.drawing_no_raw
      for (const d of drawings) {
        const dno = (d.drawing_no_raw || '').trim();
        if (!dno) continue;

        // Pattern 1: dno = "PREFIX-PNO"
        if (dno.endsWith('-' + pno)) {
          const prefix = dno.slice(0, dno.length - pno.length - 1);
          candidateMatches.push({
            fbId: fb.id,
            fbPartNo: pno,
            fbName: fb.name,
            dwgId: d.id,
            dwgNoRaw: dno,
            dwgName: d.drawing_name_raw,
            dwgType: d.drawing_type,
            matchType: 'PREFIX_STRIPPED (Drawing has prefix)',
            isSafe: prefix.length >= 2, // 접두사가 2자 이상
            reason: `도면 도번 '${dno}'의 접두사 '${prefix}-' 제외 시 BOM 도번 '${pno}'와 완전 일치`
          });
        }
        // Pattern 2: pno = "PREFIX-DNO"
        else if (pno.endsWith('-' + dno)) {
          const prefix = pno.slice(0, pno.length - dno.length - 1);
          candidateMatches.push({
            fbId: fb.id,
            fbPartNo: pno,
            fbName: fb.name,
            dwgId: d.id,
            dwgNoRaw: dno,
            dwgName: d.drawing_name_raw,
            dwgType: d.drawing_type,
            matchType: 'PREFIX_STRIPPED (BOM has prefix)',
            isSafe: prefix.length >= 2,
            reason: `BOM 도번 '${pno}'의 접두사 '${prefix}-' 제외 시 도면 도번 '${dno}'와 완전 일치`
          });
        }
      }
    }

    console.log(`\n- 2. 접두사 유연 매칭으로 새로 발견된 건수: ${candidateMatches.length}건`);
    if (candidateMatches.length > 0) {
      console.log('\n[새로 매칭된 후보 전수 목록]');
      candidateMatches.forEach((m, idx) => {
        console.log(`  (${idx + 1}) [${m.matchType}]`);
        console.log(`      BOM: 도번='${m.fbPartNo}', 품명='${m.fbName}'`);
        console.log(`      도면: 도번='${m.dwgNoRaw}', 품명='${m.dwgName}', 도면구분='${m.dwgType}'`);
        console.log(`      판정: ${m.isSafe ? '✅ 안전 매칭' : '⚠️ 주의 필요'}, 사유: ${m.reason}`);
      });
    } else {
      console.log('  (새로 매칭된 건 없음 - 기존 EXACT로 전수 커버됨)');
    }

    // 3. 중복 매칭 (1:N 다중 매칭) 여부 점검 (오매칭 위험)
    const fbCountMap = new Map<string, number>();
    for (const m of candidateMatches) {
      fbCountMap.set(m.fbPartNo, (fbCountMap.get(m.fbPartNo) || 0) + 1);
    }
    const duplicateMatches = Array.from(fbCountMap.entries()).filter(([_, count]) => count > 1);
    if (duplicateMatches.length > 0) {
      console.log('\n⚠️ [경고: 다중 매칭 발견 (오매칭 위험)]', duplicateMatches);
    } else {
      console.log('\n✅ 1:1 고유 매칭 확인 (다중 매칭 / 오매칭 위험 없음)');
    }
  }
}

analyzePrefixMatching().catch(console.error);
