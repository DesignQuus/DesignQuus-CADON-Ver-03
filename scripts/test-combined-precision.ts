import { executeSQL } from '../egdesk-helpers';

async function testCombined() {
  const caseId = 'case_1789766302590';
  const parseRunId = 'parse_1789766345349';

  const dwgRes = await executeSQL(`
    SELECT id, drawing_no_normalized, drawing_name_raw, drawing_type, material, frame_bbox_json
    FROM drawings
    WHERE quotation_case_id = '${caseId}'
  `);
  const drawings = dwgRes.rows || [];

  const relsRes = await executeSQL(`
    SELECT parent_drawing_no, child_drawing_no
    FROM drawing_relationships
    WHERE quotation_case_id = '${caseId}'
  `);
  const relRows = relsRes.rows || [];

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

  const matMap: Record<string, number> = {
    'AL6061': 2.70,
    'AL5052': 2.68,
    'SS400': 7.85,
    'S45C': 7.85,
    'SUS304': 7.93,
    'SCM440': 7.85
  };

  const standardThicknesses = [1.2, 1.6, 2.0, 2.3, 3.0, 3.2, 4.0, 4.5, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 12.0, 15.0];

  let totalWeight = 0;
  let sheetWeight = 0;
  let roundBarWeight = 0;
  let sheetCount = 0;
  let roundBarCount = 0;
  let assemblyCount = 0;
  let pendingCount = 0;

  const thkDist: Record<string, number> = {};
  const diaDist: Record<string, number> = {};
  const sampleParts: any[] = [];

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

    // W, L 추출 (상위 2개 치수)
    const largeDims = dimVals.filter(d => d >= 20);
    let realW = largeDims[0] || dimVals[0] || 150;
    let realL = largeDims.find(d => d < realW * 0.95) || largeDims[1] || dimVals[1] || realW;

    // 형상 정밀 분류
    const isSheetName = rawName.includes('BRACKET') || rawName.includes('PLATE') || 
                        rawName.includes('COVER') || rawName.includes('PANEL') || 
                        rawName.includes('BASE') || rawName.includes('GUIDE') || 
                        rawName.includes('STAY') || rawName.includes('GUARD') ||
                        rawName.includes('CHUTE') || rawName.includes('DOOR');

    const isRoundBarName = !isSheetName && (
      rawName.includes('SHAFT') || rawName.includes('ROLLER') || 
      rawName.includes('PIN') || rawName.includes('POST') || 
      rawName.includes('COLLAR') || rawName.includes('CAP') ||
      rawName.includes('ROD') || rawName.includes('STUD')
    );

    const isRoundBar = isRoundBarName;
    const rawMat = (dwg.material || 'SS400').trim().toUpperCase();
    const density = matMap[rawMat] || 7.85;

    let partWeightKg = 0;
    let diameter: number | null = null;
    let thickness: number | null = null;

    if (isRoundBar) {
      roundBarCount++;
      // 환봉: 주 외경(Major Diameter) 추출 - 최대 유효 직경
      const diaCandidates = diaVals.filter(d => d >= 8 && d <= 150 && d < realW * 0.95);
      if (diaCandidates.length > 0) {
        diameter = diaCandidates[0]; // 주 외경(최대 직경)
      } else {
        const dimDia = dimVals.filter(v => v >= 10 && v <= 120 && v < realW * 0.85);
        diameter = dimDia.length > 0 ? dimDia[0] : (rawName.includes('ROLLER') ? 43 : 25);
      }

      const k = `Ø${diameter}`;
      diaDist[k] = (diaDist[k] || 0) + 1;

      const lengthMm = realW;
      const radiusCm = (diameter / 10) / 2;
      const lengthCm = lengthMm / 10;
      const volCm3 = Math.PI * radiusCm * radiusCm * lengthCm;
      partWeightKg = Number(((volCm3 * density) / 1000).toFixed(3));
      roundBarWeight += partWeightKg;
    } else {
      sheetCount++;
      // 판재 두께:
      // 1순위: 표제란 및 도면 텍스트에서 명시적 정규식 파싱 ('2.3T', '1.2T', 't3.2' 등)
      let foundThk: number | null = null;
      for (const txt of allTexts) {
        const m = txt.match(/\b([0-9]+(?:\.[0-9]+)?)\s*[tT]\b/);
        if (m) {
          const val = parseFloat(m[1]);
          if (standardThicknesses.includes(val)) {
            foundThk = val;
            break;
          }
        }
      }

      // 2순위: 단면 치수 매칭 (W, L보다 확실히 얇은 두께 치수, 1.2~15mm)
      // 판재는 단면도에서 두께가 가장 얇은 주 치수이므로 유효 두께 후보군 중 최소 공칭 두께를 선택!
      if (foundThk === null) {
        const isCover = rawName.includes('COVER') || rawName.includes('GUARD') || rawName.includes('CASE');
        const maxThk = isCover ? 3.2 : Math.min(realL * 0.35, 15);
        const tCand = dimVals.filter(v => v >= 1.2 && v <= maxThk && standardThicknesses.includes(v));
        if (tCand.length > 0) {
          // 공학적으로 가장 유력한 외곽 단면 두께 선택 (최소 공칭 두께)
          foundThk = tCand[tCand.length - 1];
        }
      }

      if (foundThk !== null) {
        thickness = foundThk;
        const k = `t${thickness}`;
        thkDist[k] = (thkDist[k] || 0) + 1;

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

    if (rawName.includes('FREE ROLLER') || rawName.includes('MOTOR SHAFT') || rawName.includes('MAIN C/V DRIVE COVER') || rawName.includes('BASE PLATE')) {
      sampleParts.push({
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

  console.log('=== 보정 시뮬레이션 결과 ===');
  console.log(`- 전체 가공/판금 단품: ${roundBarCount + sheetCount}건 (환봉: ${roundBarCount}, 판재: ${sheetCount})`);
  console.log(`- 조립도 배제: ${assemblyCount}건`);
  console.log(`- 판재 두께 미상(Pending Review): ${pendingCount}건`);
  console.log(`- 판재 두께 분포:`, thkDist);
  console.log(`- 환봉 직경 분포:`, diaDist);
  console.log(`- 판재 총중량: ${sheetWeight.toFixed(2)} kg`);
  console.log(`- 환봉 총중량: ${roundBarWeight.toFixed(2)} kg`);
  console.log(`- 합계 실측 총중량: ${totalWeight.toFixed(2)} kg`);

  console.log('\n주요 부품 실측 샘플:');
  console.table(sampleParts);
}

testCombined().catch(console.error);
