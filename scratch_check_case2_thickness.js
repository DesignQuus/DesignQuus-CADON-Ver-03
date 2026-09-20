const Database = require('better-sqlite3');
const path = require('path');

// CADON db 위치 찾기
const dbPaths = ['./cadon.db', './data/cadon.db', './server/cadon.db', './prisma/dev.db'];
let db;
for (const p of dbPaths) {
  try {
    db = new Database(p);
    console.log('Opened DB at:', p);
    break;
  } catch (e) {}
}

if (!db) {
  // search with glob or find
  console.log('Looking for sqlite db file...');
}

const rows = db.prepare(`
  SELECT 
    f.id as feature_id,
    f.drawing_id,
    f.material,
    f.thickness,
    f.raw_width,
    f.raw_length,
    f.weight,
    d.drawing_name,
    d.title,
    d.drawing_type,
    d.is_quote_included
  FROM part_fabrication_features f
  JOIN drawings d ON f.drawing_id = d.id
  WHERE d.case_id = 'case_1789894718545'
`).all();

console.log('Total feature rows in case 2:', rows.length);
const included = rows.filter(r => r.is_quote_included === 1);
console.log('Included rows (is_quote_included=1):', included.length);

const thicknessCounts = {};
included.forEach(r => {
  const t = r.thickness;
  thicknessCounts[t] = (thicknessCounts[t] || 0) + 1;
});

console.log('\n--- Thickness breakdown for included items ---');
const total = included.length;
const sorted = Object.entries(thicknessCounts).sort((a, b) => Number(a[0]) - Number(b[0]));
sorted.forEach(([t, count]) => {
  console.log(`t${t}: ${count}장 (${((count/total)*100).toFixed(1)}%)`);
});

console.log('\n--- Details of each row ---');
included.forEach(r => {
  console.log(`dwg: ${r.drawing_name || r.title}, type: ${r.drawing_type}, mat: ${r.material}, t: ${r.thickness}, w: ${r.raw_width}, l: ${r.raw_length}, wt: ${r.weight}kg`);
});
