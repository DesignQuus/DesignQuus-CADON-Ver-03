import { insertRows, queryTable } from '../egdesk-helpers';
import crypto from 'crypto';

interface MaterialRateSeed {
  material_code: string;
  material_name: string;
  category: string;
  unit_price_per_kg: number;
  density: number;
}

const MATERIAL_SEEDS: MaterialRateSeed[] = [
  { material_code: 'SS400', material_name: '일반 구조용 탄소강', category: 'STEEL', unit_price_per_kg: 1800, density: 7.85 },
  { material_code: 'S45C', material_name: '기계구조용 탄소강', category: 'STEEL', unit_price_per_kg: 2200, density: 7.85 },
  { material_code: 'SCM440', material_name: '크롬몰리브덴 합금강', category: 'STEEL', unit_price_per_kg: 3200, density: 7.85 },
  { material_code: 'SUS304', material_name: '오스테나이트계 스테인리스강', category: 'STAINLESS', unit_price_per_kg: 5500, density: 7.93 },
  { material_code: 'SUS316', material_name: '고내식성 스테인리스강', category: 'STAINLESS', unit_price_per_kg: 7800, density: 7.98 },
  { material_code: 'AL6061', material_name: '압출/가공용 알루미늄', category: 'ALUMINUM', unit_price_per_kg: 6500, density: 2.70 },
  { material_code: 'AL5052', material_name: '판금/절곡용 알루미늄', category: 'ALUMINUM', unit_price_per_kg: 6200, density: 2.68 },
  { material_code: 'FC250', material_name: '회주철 주물재', category: 'CAST_IRON', unit_price_per_kg: 2200, density: 7.20 },
  { material_code: 'FCD450', material_name: '구상흑연주철 주물재', category: 'CAST_IRON', unit_price_per_kg: 2600, density: 7.10 },
  { material_code: 'SKD11', material_name: '냉간 금형 공구강', category: 'STEEL', unit_price_per_kg: 9500, density: 7.80 },
  { material_code: 'BsBM', material_name: '쾌삭 황동 / 동합금', category: 'COPPER', unit_price_per_kg: 12000, density: 8.50 },
  { material_code: 'MC-NYLON', material_name: '엔지니어링 플라스틱 (MC나일론)', category: 'PLASTIC', unit_price_per_kg: 8500, density: 1.15 },
  { material_code: 'POM', material_name: '폴리아세탈 (아세탈)', category: 'PLASTIC', unit_price_per_kg: 7500, density: 1.41 }
];

interface ProcessRateSeed {
  process_code: string;
  process_name: string;
  unit_type: string;
  rate_amount: number;
}

const PROCESS_SEEDS: ProcessRateSeed[] = [
  { process_code: 'HOURLY_MACHINE_RATE', process_name: 'CNC 머시닝센터 시간당 임률', unit_type: 'HOUR', rate_amount: 45000 },
  { process_code: 'HOURLY_LATHE_RATE', process_name: '범용 선반/밀링 시간당 임률', unit_type: 'HOUR', rate_amount: 40000 },
  { process_code: 'HOURLY_5AXIS_EDM_RATE', process_name: '5축/방전가공 시간당 임률', unit_type: 'HOUR', rate_amount: 65000 },
  { process_code: 'SETUP_BASE_COST', process_name: '기계가공 준비 셋업 기본료 (건당)', unit_type: 'COUNT', rate_amount: 30000 },
  { process_code: 'SHEET_LASER_PER_METER', process_name: '판금 레이저 절단 m당 단가', unit_type: 'METER', rate_amount: 1800 },
  { process_code: 'SHEET_BEND_PER_STROKE', process_name: '판금 절곡(V-Bending) 1회당 단가', unit_type: 'STROKE', rate_amount: 800 },
  { process_code: 'SHEET_PIERCING_RATE', process_name: '레이저 피어싱(관통) 홀당 단가', unit_type: 'COUNT', rate_amount: 80 },
  { process_code: 'HOURLY_WELDING_RATE', process_name: '제관 TIG/CO2 용접 시간당 임률', unit_type: 'HOUR', rate_amount: 38000 },
  { process_code: 'CASTING_PER_KG_RATE', process_name: '주조 형상 성형 kg당 공정비', unit_type: 'KG', rate_amount: 2500 },
  { process_code: 'PAINTING_PER_SQM', process_name: '분체도장/우레탄도장 ㎡당 단가', unit_type: 'SQM', rate_amount: 9000 },
  { process_code: 'ANODIZING_PER_UNIT', process_name: '알루미늄 아노다이징 개당 기본료', unit_type: 'COUNT', rate_amount: 1500 },
  { process_code: 'HEAT_TREATMENT_PER_KG', process_name: '열처리(Q/T, 고주파) kg당 단가', unit_type: 'KG', rate_amount: 1200 },
  { process_code: 'TREATMENT_MIN_LOT_COST', process_name: '표면처리/열처리 외주 최소 로트 기본료 (건당)', unit_type: 'COUNT', rate_amount: 30000 },
  { process_code: 'ELECTRICAL_OVERHEAD_RATE', process_name: '전장/구매품 조달 및 검수 관리율', unit_type: 'RATE', rate_amount: 0.08 },
  { process_code: 'HOURLY_ASSEMBLY_RATE', process_name: '유닛 조립/배선/검수 시간당 임률', unit_type: 'HOUR', rate_amount: 35000 },
  { process_code: 'PACKAGING_SHIPPING_RATE', process_name: '포장 및 물류 운반비율', unit_type: 'RATE', rate_amount: 0.03 }
];

async function seedRates() {
  console.log('--- material_rates & process_rates 시딩 시작 ---');
  const now = new Date().toISOString();
  const effectiveDate = '2026-09-01';

  // 1. material_rates 확인 및 삽입
  const curMats = await queryTable('material_rates', { limit: 100 });
  console.log(`현재 material_rates 등록 건수: ${curMats.rows?.length || 0}`);
  if (!curMats.rows || curMats.rows.length === 0) {
    const matRows = MATERIAL_SEEDS.map(m => ({
      id: `mat_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
      material_code: m.material_code,
      material_name: m.material_name,
      category: m.category,
      unit_price_per_kg: m.unit_price_per_kg,
      density: m.density,
      effective_date: effectiveDate,
      created_at: now
    }));
    const resMat = await insertRows('material_rates', matRows);
    console.log(`material_rates ${matRows.length}건 시딩 완료:`, resMat.success);
  } else {
    console.log('material_rates 이미 존재하여 건너뜁니다.');
  }

  // 2. process_rates 확인 및 삽입
  const curProc = await queryTable('process_rates', { limit: 100 });
  console.log(`현재 process_rates 등록 건수: ${curProc.rows?.length || 0}`);
  if (!curProc.rows || curProc.rows.length === 0) {
    const procRows = PROCESS_SEEDS.map(p => ({
      id: `proc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
      process_code: p.process_code,
      process_name: p.process_name,
      unit_type: p.unit_type,
      rate_amount: p.rate_amount,
      effective_date: effectiveDate,
      created_at: now
    }));
    const resProc = await insertRows('process_rates', procRows);
    console.log(`process_rates ${procRows.length}건 시딩 완료:`, resProc.success);
  } else {
    console.log('process_rates 이미 존재하여 건너뜁니다.');
  }

  console.log('--- 시딩 종료 ---');
}

seedRates().catch(err => {
  console.error('시딩 실패:', err);
  process.exit(1);
});
