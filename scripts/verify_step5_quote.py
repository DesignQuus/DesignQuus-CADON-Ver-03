import sqlite3
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

db_path = r"C:\Users\HSLEE\AppData\Roaming\egdesk\user-data\development\projects\8dd35536-8cbb-4e1c-bb65-b35f2920cb03\user_data.db"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print("--- [5단계 견적서 발행 테스트] Final BOM 승인 및 견적서 자동 생성 ---")

row = cur.execute("SELECT * FROM quotation_cases ORDER BY created_at DESC LIMIT 1").fetchone()
case_id = row['id']
case_no = row['case_no']
now_iso = datetime.now().isoformat()

# 1. Normalized BOM 중 상위 가공품목을 Final BOM으로 승인 (단품 및 주요 부품 대상)
norm_items = cur.execute("""
    SELECT ni.id, ni.normalized_name, ni.spec_candidate, ni.material_candidate, ni.quantity, ni.unit,
           mc.master_id, mc.master_code, mc.standard_name
    FROM normalized_bom_items ni
    LEFT JOIN master_candidates mc ON mc.normalized_item_id = ni.id AND mc.candidate_status = 'TOP_CANDIDATE'
    WHERE ni.quotation_case_id = ?
    LIMIT 10
""", (case_id,)).fetchall()

# 기존 final_bom_items가 없다면 테스트용으로 승인 레코드 생성
existing_fbi = cur.execute("SELECT COUNT(*) FROM final_bom_items WHERE quotation_case_id = ?", (case_id,)).fetchone()[0]
if existing_fbi == 0:
    for idx, item in enumerate(norm_items):
        fbi_id = f"fbi_{case_id}_{idx+1}"
        cur.execute("""
            INSERT INTO final_bom_items (
                id, quotation_case_id, normalized_item_id, final_name,
                final_spec, final_material, final_quantity, final_unit,
                approval_status, approved_by_user_id, approved_at, final_master_id, final_master_code, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', 'usr_admin', ?, ?, ?, ?)
        """, (
            fbi_id, case_id, item['id'], item['normalized_name'],
            item['spec_candidate'] or '-', item['material_candidate'] or 'S45C', item['quantity'] or 1.0, item['unit'] or 'EA',
            now_iso, item['master_id'], item['master_code'], now_iso
        ))
    conn.commit()
    print(f"  • {len(norm_items)}개 품목 Final BOM 승인 완료")

# 2. 견적서(Quote) 및 견적 상세 품목(Quote Items) 생성
existing_quotes = cur.execute("SELECT COUNT(*) FROM quotes WHERE quotation_case_id = ?", (case_id,)).fetchone()[0]
if existing_quotes == 0:
    quote_id = f"quote_{int(datetime.now().timestamp())}"
    quote_no = f"Q-{case_no.replace('QT-', '')}-V1"
    
    # 단가 풀 기준 기본 단가 책정 (샤프트/플레이트류 평균 35,000 ~ 85,000원)
    total_amt = 0
    fbi_rows = cur.execute("SELECT * FROM final_bom_items WHERE quotation_case_id = ?", (case_id,)).fetchall()
    
    for idx, fbi in enumerate(fbi_rows):
        unit_price = 45000 if 'SHAFT' in fbi['final_name'].upper() else 65000 if 'BRACKET' in fbi['final_name'].upper() else 25000
        qty = float(fbi['final_quantity'] or 1.0)
        tot_price = unit_price * qty
        total_amt += tot_price
        
        qi_id = f"qi_{quote_id}_{idx+1}"
        cur.execute("""
            INSERT INTO quote_items (
                id, quote_id, final_bom_item_id, item_no, item_name, specification,
                material, quantity, unit, unit_price, amount, price_source, price_status, is_included, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MASTER_MATCH', 'CONFIRMED', 1, ?)
        """, (
            qi_id, quote_id, fbi['id'], idx+1, fbi['final_name'], fbi['final_spec'],
            fbi['final_material'], qty, fbi['final_unit'], unit_price, tot_price, now_iso
        ))
        
    cur.execute("""
        INSERT INTO quotes (
            id, quotation_case_id, quote_no, quote_version, company_id, project_id,
            status, currency, subtotal, discount_type, discount_rate, discount_amount,
            tax_rate, tax_amount, total_amount, quote_date, is_locked, created_by_user_id, created_at
        ) VALUES (?, ?, ?, 1, ?, 'proj_unassigned', 'DRAFT', 'KRW', ?, 'NONE', 0, 0, 0.1, ?, ?, ?, 0, 'usr_admin', ?)
    """, (
        quote_id, case_id, quote_no, row['company_id'] or 'comp_unassigned',
        total_amt, total_amt * 0.1, total_amt * 1.1, now_iso[:10], now_iso
    ))
    
    # quotation_cases 상태 업데이트
    cur.execute("UPDATE quotation_cases SET status = 'QUOTED', quote_readiness = 'QUOTE_READY', updated_at = ? WHERE id = ?", (now_iso, case_id))
    conn.commit()
    print(f"  • 견적서 #{quote_no} 발행 완료 (공급가액: {int(total_amt):,}원, 총액: {int(total_amt * 1.1):,}원, 품목수: {len(fbi_rows)}개)")

# 3. 최신 견적서 확인
q_latest = cur.execute("SELECT * FROM quotes WHERE quotation_case_id = ? ORDER BY quote_version DESC LIMIT 1", (case_id,)).fetchone()
print(f"\n✅ 공식 견적서 최종 생성 확인: #{q_latest['quote_no']} | 총 공급가액: {int(q_latest['total_amount']):,}원")

conn.close()
