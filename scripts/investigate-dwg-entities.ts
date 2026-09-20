import { executeSQL } from '../egdesk-helpers';

async function main() {
  const parseRunId = 'parse_1789766345349';
  // MOTOR BRACKET frame: min_x: 71344.935, min_y: 3988.025, max_x: 71974.935, max_y: 4433.525
  const fMinX = 71344.9;
  const fMaxX = 71975.0;
  const fMinY = 3988.0;
  const fMaxY = 4433.6;

  // title: min_x: 71667.2, min_y: 3988.0, max_x: 71975.0, max_y: 4077.0
  const tMinX = 71667.0;
  const tMaxY = 4077.0;

  // 전체 엔티티 조회 (해당 parse_run)
  const sql = `
    SELECT id, entity_type, layer, raw_text, bounding_box_json, geometry_data_json
    FROM cad_objects
    WHERE parse_run_id = '${parseRunId}'
  `;
  const res = await executeSQL(sql);
  console.log(`전체 cad_objects in run: ${res.rows?.length}건`);

  const insideObjs: any[] = [];
  const insideGeomObjs: any[] = [];
  const textObjs: any[] = [];

  for (const row of (res.rows || [])) {
    if (!row.bounding_box_json) continue;
    try {
      const b = JSON.parse(row.bounding_box_json);
      const cx = (b.min_x + b.max_x) / 2;
      const cy = (b.min_y + b.max_y) / 2;

      // 도면 프레임 내부 판정
      if (cx >= fMinX && cx <= fMaxX && cy >= fMinY && cy <= fMaxY) {
        insideObjs.push(row);

        // 표제란 영역(우측 하단) 제외
        const isTitle = (cx >= tMinX && cy <= tMaxY);
        // 외곽 프레임 테두리 선 자체(크기가 600 이상) 제외
        const bw = Math.abs(b.max_x - b.min_x);
        const bh = Math.abs(b.max_y - b.min_y);
        const isFrameBorder = (bw > 600 || bh > 420);

        if (row.entity_type === 'TEXT' || row.entity_type === 'MTEXT') {
          textObjs.push({ text: row.raw_text, isTitle, x: cx, y: cy });
        } else if (!isTitle && !isFrameBorder) {
          insideGeomObjs.push({
            id: row.id,
            type: row.entity_type,
            layer: row.layer,
            w: bw,
            h: bh,
            b
          });
        }
      }
    } catch {}
  }

  console.log(`\n프레임 내부 총 객체: ${insideObjs.length}건`);
  console.log(`텍스트 객체: ${textObjs.length}건`);
  console.log(`부품 뷰 기하 객체 (표제란/프레임선 제외): ${insideGeomObjs.length}건`);

  if (insideGeomObjs.length > 0) {
    // 부품 기하 전체를 둘러싸는 Bounding Box 계산
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    insideGeomObjs.forEach(g => {
      minX = Math.min(minX, g.b.min_x);
      minY = Math.min(minY, g.b.min_y);
      maxX = Math.max(maxX, g.b.max_x);
      maxY = Math.max(maxY, g.b.max_y);
    });

    const realPartW = Math.round((maxX - minX) * 10) / 10;
    const realPartH = Math.round((maxY - minY) * 10) / 10;
    console.log(`\n★ 추출된 부품 실제 치수 (Part Bounding Box):`);
    console.log(`  - 가로 (W): ${realPartW} mm`);
    console.log(`  - 세로 (L): ${realPartH} mm`);
    console.log(`  - 종횡비: ${(realPartW / realPartH).toFixed(3)}`);
    console.log(`  - 기하 엔티티 개수: ${insideGeomObjs.length}개`);
  }

  console.log('\n도면 내 텍스트 샘플 (주기사항/재질/두께 탐색):');
  textObjs.slice(0, 20).forEach(t => console.log(`  - [${t.isTitle ? '표제란' : '도면부'}] ${t.text}`));
}

main().catch(console.error);
