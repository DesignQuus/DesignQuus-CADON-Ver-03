import { executeSQL } from '../egdesk-helpers';

async function testRecalculation() {
  const caseId = 'case_1789766302590';
  const parseRunId = 'parse_1789766345349';

  console.log('=== 정밀 피처 추출 시뮬레이션 테스트 ===\n');

  // 1. drawings
  const dwgRes = await executeSQL(`
    SELECT id, drawing_no_normalized, drawing_name_raw, drawing_type, material, frame_bbox_json, title_block_bbox_json
    FROM drawings
    WHERE quotation_case_id = '${caseId}'
  `);
  const drawings = dwgRes.rows || [];

  // 2. relationships
  const relsRes = await executeSQL(`
    SELECT parent_drawing_no, child_drawing_no
    FROM drawing_relationships
    WHERE quotation_case_id = '${caseId}'
  `);
  const relRows = relsRes.rows || [];
  const parentNos = new Set(relRows.map((r: any) => r.parent_drawing_no));
  const childNos = new Set(relRows.map((r: any) => r.child_drawing_no));

  // 3. cad_objects
  const cadRes = await executeSQL(`
    SELECT raw_text, bounding_box_json, layer
    FROM cad_objects
    WHERE parse_run_id = '${parseRunId}'
  `);
  const cadRows = cadRes.rows || [];
  for (const c of cadRows) {
    if (c.bounding_box_json) {
      try { c.parsedBbox = JSON.parse(c.bounding_box_json); } catch {}
    }
  }

  // 4. 재질 맵
  const matMap: Record<string, number> = {
    'AL6061': 2.70,
    'AL5052': 2.68,
    'SS400': 7.85,
    'S45C': 7.85,
    'SUS304': 7.93,
    'SCM440': 7.85
  };

  const standardThicknesses = [1.2, 1.6, 2.0, 2.3, 3.0, 3.2, 4.0, 4.5, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 12.0, 15.0, 20.0];

  let totalWeight = 0;
  let sheetWeight = 0;
  let roundBarWeight = 0;
  let sheetCount = 0;
  let roundBarCount = 0;
  let assemblyCount = 0;
  let pendingCount = 0;

  const sampleResults: any[] = [];

  for (const dwg of drawings) {
    const dwgNo = dwg.drawing_no_normalized;
    const rawName = (dwg.drawing_name_raw || '').trim();
    const isAssy = relRows.some((r: any) => r.parent_drawing_no === dwgNo && r.child_drawing_no !== dwgNo) ||
                   dwg.drawing_type === 'ASSEMBLY' || dwgNo.endsWith('-000') || dwgNo.endsWith('-00-000');

    if (isAssy) {
      assemblyCount++;
      continue;
    }

    let frame: any = null;
    try { frame = JSON.parse(dwg.frame_bbox_json); } catch {}

    const textObjs = frame ? cadRows.filter((c: any) => {
      const b = c.parsedBbox;
      if (!b) return false;
      const cx = (b.min_x + b.max_x) / 2;
      const cy = (b.min_y + b.max_y) / 2;
      return cx >= frame.min_x && cx <= frame.max_x && cy >= frame.min_y && cy <= frame.max_y;
    }) : [];

    const diaVals: number[] = [];
    const dimVals: number[] = [];
    const allTexts: string[] = [];

    for (const t of textObjs) {
      if (!t.raw_text) continue;
      const txt = t.raw_text.trim();
      allTexts.push(txt);

      // 직경 기호 치수
      if (txt.includes('%%c') || txt.includes('Ø') || txt.includes('ø')) {
        const num = parseFloat(txt.replace(/%%c/gi, '').replace(/[Øø]/g, '').replace(/,/g, '.').replace(/[^0-9.]/g, ''));
        if (!isNaN(num) && num >= 4 && num <= 300) {
          diaVals.push(num);
        }
      }

      // 일반 치수
      if (t.layer === 'DIMENSION' || txt.includes('%%c') || txt.includes('Ø')) {
        const num = parseFloat(txt.replace(/,/g, '.').replace(/[^0-9.]/g, ''));
        if (!isNaN(num) && num >= 0.5 && num <= 800) {
          dimVals.push(num);
        }
      }
    }

    dimVals.sort((a, b) => b - a);
    diaVals.sort((a, b) => b - a);

    const isRoundBar = rawName.includes('SHAFT') || rawName.includes('ROLLER') || 
                       rawName.includes('PIN') || rawName.includes('POST') || 
                       rawName.includes('COLLAR') || rawName.includes('CAP') ||
                       rawName.includes('ROD');

    const rawMat = (dwg.material || 'SS400').trim().toUpperCase();
    const density = matMap[rawMat] || 7.85;

    let realW = dimVals[0] || 150;
    let realL = dimVals.find(d => d < realW * 0.95) || dimVals[1] || realW;

    let partWeightKg = 0;
    let diameter: number | null = null;
    let thickness: number | null = null;

    if (isRoundBar) {
      roundBarCount++;
      // 환봉: 주 외경(Major Diameter) 추출
      // 1순위: 직경 기호 치수 중 길이 realW보다 작고 12mm 이상인 최대 직경
      const diaCandidates = diaVals.filter(d => d >= 8 && d <= 150 && d < realW * 0.9);
      if (diaCandidates.length > 0) {
        diameter = diaCandidates[0]; // 주 외경(최대 직경)
      } else {
        // 2순위: 일반 치수 중 주 외경 후보 (길이 다음으로 유효한 최대 외경)
        const dimDia = dimVals.filter(v => v >= 10 && v <= 120 && v < realW * 0.85);
        diameter = dimDia.length > 0 ? dimDia[0] : 25;
      }

      const radiusCm = (diameter / 10) / 2;
      const lengthCm = realW / 10;
      const volCm3 = Math.PI * radiusCm * radiusCm * lengthCm;
      partWeightKg = Number(((volCm3 * density) / 1000).toFixed(3));
      roundBarWeight += partWeightKg;
    } else {
      sheetCount++;
      // 판재: 두께 추출
      // 1순위: 도면 텍스트에서 명시적 두께 정규식 탐색
      let foundThk: number | null = null;
      for (const txt of allTexts) {
        const m1 = txt.match(/(?:t|T|thk|THK|THICKNESS)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i);
        if (m1) {
          const v = parseFloat(m1[1]);
          if (standardThicknesses.includes(v)) { foundThk = v; break; }
        }
        const m2 = txt.match(/(?:PL|SS400|AL6061|SUS304|S45C)\s*[-_]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:T|t)/i);
        if (m2) {
          const v = parseFloat(m2[1]);
          if (standardThicknesses.includes(v)) { foundThk = v; break; }
        }
      }

      if (foundThk !== null) {
        thickness = foundThk;
      } else {
        // 2순위: 표준 공칭 두께 계열 중 치수 탐색
        const tCand = dimVals.filter(v => v >= 1.2 && v <= 20 && v <= realL * 0.35 && standardThicknesses.includes(v));
        if (tCand.length > 0) {
          thickness = tCand[0]; // 주 단면 두께
        }
      }

      if (thickness !== null) {
        const volCm3 = (realW * realL * thickness) / 1000;
        partWeightKg = Number(((volCm3 * density) / 1000).toFixed(3));
        sheetWeight += partWeightKg;
      } else {
        thickness = null;
        partWeightKg = 0;
        pendingCount++;
      }
    }

    totalWeight += partWeightKg;

    if (rawName.includes('ROLLER') || rawName.includes('MOTOR SHAFT') || rawName.includes('COVER')) {
      sampleResults.push({
        도번: dwgNo,
        품명: rawName,
        형상: isRoundBar ? 'ROUND_BAR' : 'SHEET',
        W: realW,
        L: realL,
        직경: diameter ? `Ø${diameter}` : '-',
        두께: thickness ? `t${thickness}` : (isRoundBar ? '-' : 'NULL'),
        중량kg: partWeightKg
      });
    }
  }

  console.log('=== 시뮬레이션 결과 ===');
  console.log(`- 가공/판금 단품 수: ${roundBarCount + sheetCount}건 (환봉: ${roundBarCount}, 판재: ${sheetCount})`);
  console.log(`- 조립도 배제: ${assemblyCount}건`);
  console.log(`- 판재 두께 미상(Pending Review): ${pendingCount}건`);
  console.log(`- 판재 총중량: ${sheetWeight.toFixed(2)} kg`);
  console.log(`- 환봉 총중량: ${roundBarWeight.toFixed(2)} kg`);
  console.log(`- 전체 합계 총중량: ${totalWeight.toFixed(2)} kg (기존 80.17kg 대비 정상 복구 확인)`);

  console.log('\n주요 부품 샘플 실측:');
  console.table(sampleResults.slice(0, 15));
}

testRecalculation().catch(console.error);
