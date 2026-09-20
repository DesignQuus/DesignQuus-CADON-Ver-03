import { db } from '../src/lib/db';

async function checkDv2Texts() {
  const dwg = (await db.prepare('SELECT id, frame_bbox_json FROM drawings WHERE drawing_no_raw = ?').get('240314-DV2-006')) as any;
  const fb = JSON.parse(dwg.frame_bbox_json);
  const objs = (await db.prepare('SELECT entity_type, layer, raw_text, bounding_box_json FROM cad_objects WHERE parse_run_id = ?').all('parse_1789895993788')) as any[];
  const inFrame = objs.filter(o => {
    if (!o.bounding_box_json) return false;
    const b = JSON.parse(o.bounding_box_json);
    const cx = (b.min_x + b.max_x) / 2;
    const cy = (b.min_y + b.max_y) / 2;
    return cx >= fb.min_x && cx <= fb.max_x && cy >= fb.min_y && cy <= fb.max_y;
  });
  
  const meaningfulTexts = inFrame.map(o => o.raw_text).filter(t => t && t.length > 1 && !/^[A-E0-5]$/.test(t.trim()));
  console.log('Meaningful texts in DV2-006:');
  meaningfulTexts.forEach(t => console.log('  ->', t));
}

checkDv2Texts().catch(console.error);
