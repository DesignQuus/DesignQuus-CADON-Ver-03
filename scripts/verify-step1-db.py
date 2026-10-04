import sqlite3

db_path = r'C:\Users\HSLEE\AppData\Roaming\egdesk\user-data\development\projects\8dd35536-8cbb-4e1c-bb65-b35f2920cb03\user_data.db'
con = sqlite3.connect(db_path, timeout=5)

tables = ['company_contacts', 'upload_batches', 'batch_items', 'companies', 'quotation_cases', 'quotes']

print('=== 1단계 테이블 및 컬럼 무결성 전수 검증 ===')
for t in tables:
    cols = [r[1] for r in con.execute(f'PRAGMA table_info("{t}")').fetchall()]
    count = con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
    print(f'[{t}] (행 수: {count})')
    print(f'  컬럼 ({len(cols)}개): {", ".join(cols)}')
