import { runMrpExplosion } from '../src/lib/mrp-engine';

async function testMissingParts() {
  const result = await runMrpExplosion('case_1789766302590');
  const t0Parts = result.flattenedParts.filter(p => p.dimensions.thickness === 0);
  console.log(`t0 부품 건수: ${t0Parts.length}건`);
  console.log('t0 부품 샘플 10건:');
  console.table(t0Parts.slice(0, 10).map(p => ({
    drawingNo: p.drawingNo,
    itemName: p.itemName,
    material: p.material,
    qty: p.totalQty,
    weight: p.totalWeightKg
  })));
}

testMissingParts().catch(console.error);
