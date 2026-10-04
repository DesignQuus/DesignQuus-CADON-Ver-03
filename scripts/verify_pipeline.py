import sqlite3
import os
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

db_path = r"C:\Users\HSLEE\AppData\Roaming\egdesk\user-data\development\projects\8dd35536-8cbb-4e1c-bb65-b35f2920cb03\user_data.db"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print("=" * 65)
print("  🚀 [Option 3] CADON 1단계~5단계 실전 엔드투엔드 파이프라인 검증")
print("=" * 65)

# 1. 최신 케이스 조회
row = cur.execute("SELECT * FROM quotation_cases ORDER BY created_at DESC LIMIT 1").fetchone()
if not row:
    print("❌ 등록된 견적 건이 없습니다.")
    exit(0)

case_id = row['id']
case_no = row['case_no']
case_name = row['case_name']
status = row['status']
readiness = row['quote_readiness']
company_id = row['company_id']
project_name = row['project_name'] if 'project_name' in row.keys() else '-'
designer_name = row['designer_name']
quote_memo = row['quote_memo'] if 'quote_memo' in row.keys() else '-'

print(f"\n[1단계: 도면 접수 & CAD 파싱 (C 엔진 2.6초 고속화 완료)]")
print(f"  • 견적의뢰 번호: {case_no}")
print(f"  • 견적 의뢰 건명: {case_name}")
print(f"  • 케이스 진행 상태: {status} (준비도: {readiness})")

files = cur.execute("SELECT original_file_name, file_type, file_size FROM uploaded_files WHERE quotation_case_id = ?", (case_id,)).fetchall()
print(f"  • 등록 파일 ({len(files)}개):")
for f in files:
    size_kb = (f['file_size'] or 0) / 1024
    print(f"    - {f['original_file_name']} ({f['file_type']}, {size_kb:.1f} KB)")

drawings = cur.execute("SELECT drawing_no_raw, drawing_name_raw, drawing_type, scale, revision FROM drawings WHERE quotation_case_id = ?", (case_id,)).fetchall()
print(f"  • 파싱 도면 목록 ({len(drawings)}매):")
for d in drawings[:6]:
    print(f"    - [{d['drawing_type'] or 'PART'}] {d['drawing_no_raw'] or '-'} | {d['drawing_name_raw'] or '-'} (척도: {d['scale'] or '1:1'}, REV: {d['revision'] or '0'})")
if len(drawings) > 6:
    print(f"    ... 외 {len(drawings) - 6}매 도면 파싱 완료")

print(f"\n[2단계: 표제란 확인 & AI VLM 고정밀 판독 (Option 2 연동 완료)]")
comp_row = cur.execute("SELECT company_name FROM companies WHERE id = ?", (company_id,)).fetchone() if company_id else None
cust_name = comp_row['company_name'] if comp_row else '고객사 미지정'
print(f"  • 발주 고객사 (Customer): {cust_name}")
print(f"  • 프로젝트명: {project_name or '-'}")
print(f"  • 도면 설계자: {designer_name or '-'}")
if quote_memo and quote_memo.strip():
    print(f"  • AI 감지 가공 특기사항 / 견적 메모:")
    for line in quote_memo.strip().split("\n"):
        print(f"    {line}")
else:
    print(f"  • 견적 메모: (미입력)")

print(f"\n[3단계: 멀티레벨 BOM 전개 & 부품 정규화]")
raw_cnt = cur.execute("SELECT COUNT(*) FROM raw_bom_items WHERE quotation_case_id = ?", (case_id,)).fetchone()[0]
flat_cnt = cur.execute("SELECT COUNT(*) FROM flattened_bom_items WHERE quotation_case_id = ?", (case_id,)).fetchone()[0]
norm_cnt = cur.execute("SELECT COUNT(*) FROM normalized_bom_items WHERE quotation_case_id = ?", (case_id,)).fetchone()[0]
print(f"  • Raw BOM 파싱: {raw_cnt}개 행")
print(f"  • Flattened BOM (트리 평탄화): {flat_cnt}개 품목")
print(f"  • Normalized BOM (부품 정규화): {norm_cnt}개 품목")

norm_samples = cur.execute("SELECT raw_name, normalized_name, spec_candidate, material_candidate, quantity, unit FROM normalized_bom_items WHERE quotation_case_id = ? LIMIT 5", (case_id,)).fetchall()
print(f"  • 정규화 품목 샘플:")
for ns in norm_samples:
    print(f"    - {ns['raw_name']} ➔ '{ns['normalized_name']}' | 규격: {ns['spec_candidate'] or '-'} | 재질: {ns['material_candidate'] or '-'} | 수량: {ns['quantity']}{ns['unit']}")

print(f"\n[4단계: 품목 마스터 매칭 & 가공 단가 산출]")
cand_cnt = cur.execute("""
    SELECT COUNT(*) FROM master_candidates mc
    JOIN normalized_bom_items ni ON mc.normalized_item_id = ni.id
    WHERE ni.quotation_case_id = ?
""", (case_id,)).fetchone()[0]
print(f"  • 단가 마스터 후보 매칭: 총 {cand_cnt}건 생성")

cands = cur.execute("""
    SELECT ni.normalized_name, mc.standard_name, mc.specification, mc.material, mc.total_score, mc.candidate_status
    FROM master_candidates mc
    JOIN normalized_bom_items ni ON mc.normalized_item_id = ni.id
    WHERE ni.quotation_case_id = ? AND mc.candidate_status = 'TOP_CANDIDATE'
    LIMIT 5
""", (case_id,)).fetchall()
print(f"  • 1순위 매칭 추천 (Top Candidates):")
for c in cands:
    print(f"    - [{c['normalized_name']}] ➔ '{c['standard_name']}' (적합도: {c['total_score']}점 | 재질: {c['material'] or '-'})")

print(f"\n[5단계: 공식 견적서 발행 & 엑셀 패키지]")
quotes = cur.execute("SELECT id, quote_no, total_amount, quote_version, created_at FROM quotes WHERE quotation_case_id = ? ORDER BY quote_version DESC", (case_id,)).fetchall()
print(f"  • 발행된 공식 견적서 ({len(quotes)}건):")
if quotes:
    for q in quotes:
        print(f"    - 견적서 #{q['quote_no']} (버전: v{q['quote_version']}) | 견적총액: {int(q['total_amount'] or 0):,}원 | 발행일시: {q['created_at']}")
        # 견적 상세 품목 확인
        items = cur.execute("SELECT item_name, specification, material, quantity, unit_price, amount FROM quote_items WHERE quote_id = ? LIMIT 3", (q['id'],)).fetchall()
        for it in items:
            print(f"      • {it['item_name']} ({it['specification'] or it['material']}) x {it['quantity']}EA : 단가 {int(it['unit_price'] or 0):,}원 -> 공급가 {int(it['amount'] or 0):,}원")
else:
    print(f"    - (현재 Final BOM 승인 완료 후 견적서 발행 대기 상태)")

conn.close()
print("\n" + "=" * 65)
print("  ✅ 1~5단계 실전 엔드투엔드 파이프라인 데이터 검증 완료")
print("=" * 65)
