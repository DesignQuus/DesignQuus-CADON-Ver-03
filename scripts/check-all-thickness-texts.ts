import { executeSQL } from '../egdesk-helpers';

async function main() {
  const caseId = 'case_1789766302590';
  const parseRunId = 'parse_1789766345349';

  const cadRes = await executeSQL(`
    SELECT raw_text
    FROM cad_objects
    WHERE parse_run_id = '${parseRunId}'
      AND raw_text IS NOT NULL
  `);

  const thicknessPatterns = [
    /(?:^|[^0-9a-zA-Z])([0-9]+(?:\.[0-9]+)?)\s*[tT](?:[^0-9a-zA-Z]|$)/,
    /(?:t|T|thk|THK|THICKNESS)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i,
    /(?:PL|SS400|AL6061|SUS304|S45C)\s*[-_]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:T|t)/i
  ];

  const foundThks = new Map<string, number>();
  const matches: string[] = [];

  for (const row of cadRes.rows || []) {
    const txt = row.raw_text.trim();
    for (const pat of thicknessPatterns) {
      const m = txt.match(pat);
      if (m) {
        const val = parseFloat(m[1]);
        if (!isNaN(val) && val >= 0.8 && val <= 30) {
          const k = `t${val}`;
          foundThks.set(k, (foundThks.get(k) || 0) + 1);
          if (matches.length < 50) matches.push(`${txt} -> ${val}`);
          break;
        }
      }
    }
  }

  console.log('CAD 텍스트 전체에서 발견된 명시적 두께 표기 통계:');
  console.log(Object.fromEntries(foundThks.entries()));
  console.log('\n매칭된 텍스트 샘플:');
  console.log(matches.slice(0, 30));
}

main().catch(console.error);
