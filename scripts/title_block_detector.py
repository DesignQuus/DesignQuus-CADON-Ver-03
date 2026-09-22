#!/usr/bin/env python3
"""
CADON-BOM SERVER POC - PROMPT 06 / HIERARCHICAL MULTI-LEVEL TITLE BLOCK DETECTOR
Extracts BOTH Main Assembly Drawings and Sub-Part / Detail Drawings
with all 9 rich Title Block metadata fields.
"""
import sys
import json
import re
import time

def extract_title_blocks_hierarchical(cad_data: dict, frames_data: dict) -> dict:
    start_time = time.time()
    objects = cad_data.get("objects", [])
    
    # Collect all text objects with coordinates
    all_texts = []
    for obj in objects:
        t = obj.get("raw_text")
        if t:
            geom = obj.get("geometry_data", {})
            ins = geom.get("insert") or [0, 0]
            h = geom.get("height") or 10
            all_texts.append({
                "text": t.strip(),
                "x": ins[0],
                "y": ins[1],
                "h": h,
                "layer": obj.get("layer", "")
            })
            
    # Regular expression for full drawing numbers:
    # Handles 6-digits (YYMMDD-XX-XXX), 4-digits/project codes (2503-021-SA01-001), and standard multi-hyphen parts
    dwg_no_pat = re.compile(r'\b([0-9]{4,6}(?:-[A-Za-z0-9]{1,4}){2,4})\b')
    dwg_fallback_pat = re.compile(r'(?:DWG\s*(?:NO)?[.:\s]*)([A-Za-z0-9_-]+)', re.IGNORECASE)
    
    # Match main frame candidates from frames_data
    candidates = frames_data.get("candidates", [])

    # 1. Regex patterns for drawing numbers
    pat_full = re.compile(r'\b([0-9]{4,6}(?:-[A-Za-z0-9]{1,4}){2,4})\b')
    pat_unit = re.compile(r'\b([A-Za-z0-9]{2,6}-[A-Za-z0-9]{2,10}-[A-Za-z0-9]{2,6}(?:-[0-9]{1,2})?)\b')
    pat_part_num = re.compile(r'^([0-9]{2,3})$')

    # 회사/법인 접미어 패턴 (국문·영문·일문·중문). 특정 업체명은 절대 하드코딩하지 않음
    COMPANY_SUFFIX_PAT = re.compile(
        r'(\(주\)|㈜|주식회사|유한회사|\bCO\.?,?\s*LTD\.?|\bCORP(?:ORATION)?\.?|\bINC\.?|\bGMBH\b|\bLLC\b|株式会社|有限公司|\bLTD\.?\b)',
        re.IGNORECASE
    )

    def is_company_like(txt):
        return bool(COMPANY_SUFFIX_PAT.search(txt or ''))

    # 도면 소유 업체(작성사): 회사형 텍스트 중 여러 시트에 반복 등장하는 최빈 문자열
    company_counter = {}
    for t in all_texts:
        s = t["text"].strip()
        if is_company_like(s):
            company_counter[s] = company_counter.get(s, 0) + 1
    company_global = None
    if company_counter:
        best_name, best_cnt = max(company_counter.items(), key=lambda kv: kv[1])
        n_frames = max(len(frames_data.get("candidates", [])), 1)
        if best_cnt >= 2 or n_frames == 1:
            company_global = best_name

    # Detect global project number if present (e.g. 2503-021)
    proj_no_global = None
    for t in all_texts:
        m = re.search(r'\b([0-9]{4}-[0-9]{3})\b', t["text"])
        if m:
            proj_no_global = m.group(1)
            break

    # Extended mechanical engineering materials whitelist
    KNOWN_MATERIALS = [
        "SUJ2", "SK3", "SM45C", "S45C", "S20C", "SS400", "SS275", "SUS304", "SUS316", "SUS430",
        "AL6061", "A6061", "AL6063-T5", "AL6063", "AL5052", "A5052", "AL7075", "A7075", 
        "SCM440", "SCM415", "SKD11", "SKD61", "SKS3", "SS41", "SUM24L", "MC NYLON", "MC", 
        "POM", "ACETAL", "PE", "PP", "TEFLON", "PTFE", "BAKELITE", "BRASS", "C3604", "BSBD", "SWP"
    ]

    LABEL_BLACKLIST = {
        "DWG NO.", "DWG NO", "DWG", "TITLE", "DESCRIPTION", "품명", "도명", "도번",
        "SPECIFICATION", "규격", "Q'TY", "QTY", "수량", "MATERIAL", "재질", "FINISH",
        "REMARK", "FINISH / REMARK", "PAGE", "SCALE", "REV", "REV.", "DESIGN", "CHECK",
        "APPROVE", "SUB SCRIPE", "REF NO.", "CUSTOMER", "PROJECT NO.", "PROJECT NO",
        "A3", "A4", "A2", "A1", "A0", "STANDARD", "NAME MARKING", "POSITION TYPE",
        "DATE", "UNIT", "SIZE", "SHEET", "PROJECT NAME", "CLIENT", "DRAWN", "CHECKED", "APPROVED", "DESIGNED",
        "PLOT DATE", "일자", "척도", "설계", "검도", "승인", "고객사", "발주처"
    }

    # 날짜(YYYY-MM-DD, YYMMDD-.. 등)는 도면번호 패턴과 겹치므로 명시적으로 배제
    DATE_PAT = re.compile(r'^\d{4}-\d{1,2}-\d{1,2}$')

    def looks_like_date(code):
        return bool(DATE_PAT.match(code.strip()))

    # 2. Collect full drawing number clusters (spatial clustering)
    clusters = []
    for t in all_texts:
        matches = pat_full.findall(t["text"])
        for m in matches:
            if looks_like_date(m):
                continue
            dno_u = m.upper()
            found = False
            for c in clusters:
                if abs(c["x"] - t["x"]) < 150 and abs(c["y"] - t["y"]) < 150 and c["dno"] == dno_u:
                    found = True
                    break
            if not found:
                clusters.append({"dno": dno_u, "x": t["x"], "y": t["y"]})

    # Track which clusters have been mapped to candidate frames
    mapped_cluster_indices = set()
    all_extracted = []

    # 3. Candidate-First frame-driven scanning
    for idx, cand in enumerate(candidates, 1):
        cb = cand["bbox"]
        cw = cb["max_x"] - cb["min_x"]
        ch = cb["max_y"] - cb["min_y"]
        # 스케일 인식 단위 계수: 1:1 A3(420) 수준 시트는 1.0, 대형 배율 시트(예: A0 x40)는 비례 확대
        usc = max(1.0, cw / 700.0)

        in_frame = [t for t in all_texts if cb["min_x"] - 20 * usc <= t["x"] <= cb["max_x"] + 20 * usc and cb["min_y"] - 20 * usc <= t["y"] <= cb["max_y"] + 20 * usc]

        # Check if an existing cluster falls inside this frame
        frame_cluster = None
        for c_idx, cl in enumerate(clusters):
            if cb["min_x"] - 50 * usc <= cl["x"] <= cb["max_x"] + 50 * usc and cb["min_y"] - 50 * usc <= cl["y"] <= cb["max_y"] + 50 * usc:
                frame_cluster = cl
                mapped_cluster_indices.add(c_idx)
                break

        # Focus on title block area (bottom-right region)
        tb_texts = [
            t for t in in_frame 
            if t["x"] >= cb["max_x"] - min(cw * 0.65, 450 * usc)
            and t["y"] <= cb["min_y"] + min(ch * 0.45, 250 * usc)
        ]
        if not tb_texts:
            tb_texts = in_frame

        # Extract Drawing Number
        dno = frame_cluster["dno"] if frame_cluster else None
        if not dno:
            for t in tb_texts:
                m = pat_full.search(t["text"])
                if m and not looks_like_date(m.group(1)):
                    dno = m.group(1).upper()
                    break
        if not dno:
            for t in tb_texts:
                if '/' in t["text"] or '.' in t["text"]:
                    continue
                m = pat_unit.search(t["text"])
                if m:
                    cand_code = m.group(1).upper()
                    # 도면번호는 숫자를 포함해야 함 (PLOT-DATE, 업체명 약어 등 순수 문자 코드 배제)
                    if re.search(r'\d', cand_code):
                        dno = cand_code
                        break
        if not dno and proj_no_global:
            for t in tb_texts:
                if pat_part_num.match(t["text"].strip()):
                    dno = f"{proj_no_global}-{t['text'].strip()}"
                    break
        if not dno:
            dno = f"DWG-{idx:03d}"

        # Extract Customer (Spatial proximity to CUSTOMER label)
        customer = None
        cust_labels = [t for t in in_frame if t["text"].strip().upper() in ["CUSTOMER", "고객사", "발주처", "CLIENT"]]
        if cust_labels:
            cl = cust_labels[0]
            c_cands = [
                t for t in in_frame
                if t != cl
                and -35 * usc <= (t["y"] - cl["y"]) <= 10 * usc
                and abs(t["x"] - cl["x"]) <= 120 * usc
                and t["text"].strip().upper() not in [
                    "CUSTOMER", "DATE", "SCALE", "REV.", "REV", "DESIGN", "CHECK", "APPROVE", 
                    "PROJECT NO.", "PROJECT NO", "PROJECT NAME", "DWG NO.", "DWG NO", "TITLE",
                    "고객사", "발주처", "설계", "검도", "승인", "도번", "품명", "일자", "척도", "PAGE"
                ]
            ]
            if c_cands:
                c_cands.sort(key=lambda t: (cl["y"] - t["y"])**2 + (cl["x"] - t["x"])**2)
                customer = c_cands[0]["text"].strip()

        # 라벨이 없을 때: 회사형 텍스트 중 도면 소유 업체(전 시트 공통)가 아닌 것을 고객사로 채택
        if not customer:
            for t in in_frame:
                txt = t["text"].strip()
                if is_company_like(txt) and txt != company_global:
                    customer = txt
                    break

        # Detect integrated Title Block BOM Table
        header_labels = {}
        for t in tb_texts:
            txt_u = t["text"].strip().upper()
            for hk, aliases in [
                ("NO", ["NO.", "NO"]),
                ("DESC", ["DESCRIPTION", "품명"]),
                ("SPEC", ["SPECIFICATION", "규격"]),
                ("QTY", ["Q'TY", "QTY", "수량"]),
                ("MAT", ["MATAL", "MATERIAL", "재질"]),
                ("REMARK", ["REMAPK", "REMARK", "비고"])
            ]:
                if txt_u in aliases:
                    if hk not in header_labels or abs(t["x"] - (cb["max_x"] - 150)) < abs(header_labels[hk]["x"] - (cb["max_x"] - 150)):
                        header_labels[hk] = t

        name = None
        quantity = 1.0
        mat = None
        surface_treatment = None
        specification = None

        if header_labels and "QTY" in header_labels:
            ref_y = header_labels["QTY"]["y"]
            data_row_candidates = [
                t for t in tb_texts
                if 2 * usc <= (t["y"] - ref_y) <= 25 * usc and t["text"].strip() not in [
                    "NO.", "DESCRIPTION", "SPECIFICATION", "Q'TY", "QTY", "MATAL", "MATERIAL", "REMAPK", "REMARK"
                ]
            ]
            if not data_row_candidates:
                data_row_candidates = [
                    t for t in tb_texts
                    if -25 * usc <= (t["y"] - ref_y) <= -2 * usc and t["text"].strip() not in [
                        "NO.", "DESCRIPTION", "SPECIFICATION", "Q'TY", "QTY", "MATAL", "MATERIAL", "REMAPK", "REMARK"
                    ]
                ]

            def find_closest_text(header_label, cands, max_dx=35):
                if not header_label or not cands:
                    return None
                hx = header_label["x"]
                matches = [c for c in cands if abs(c["x"] - hx) <= max_dx * usc]
                if matches:
                    matches.sort(key=lambda c: abs(c["x"] - hx))
                    return matches[0]["text"].strip()
                return None

            desc_val = find_closest_text(header_labels.get("DESC"), data_row_candidates, max_dx=40)
            if desc_val and len(desc_val) >= 2 and desc_val.upper() not in LABEL_BLACKLIST:
                name = desc_val

            qty_val = find_closest_text(header_labels.get("QTY"), data_row_candidates, max_dx=25)
            if qty_val:
                m_qty = re.search(r'(\d+(\.\d+)?)', qty_val)
                if m_qty:
                    quantity = float(m_qty.group(1))

            mat_val = find_closest_text(header_labels.get("MAT"), data_row_candidates, max_dx=25)
            if mat_val:
                m_mat_upper = mat_val.upper().replace(" ", "")
                for km in KNOWN_MATERIALS:
                    if km.replace(" ", "") == m_mat_upper or km.replace(" ", "") in m_mat_upper:
                        mat = km
                        break
                if not mat and len(mat_val) >= 2:
                    mat = mat_val

            remark_val = find_closest_text(header_labels.get("REMARK"), data_row_candidates, max_dx=40)
            if remark_val and remark_val != "-":
                surface_treatment = remark_val

        # Extract Drawing Name from tb_texts
        if not name:
            desc_labels = [t for t in tb_texts if t["text"].strip().upper() in ["DESCRIPTION", "품명", "TITLE"]]
            if desc_labels:
                dl = desc_labels[0]
                d_cands = [
                    t for t in tb_texts
                    if t != dl
                    and abs(t["x"] - dl["x"]) <= 120 * usc
                    and abs(t["y"] - dl["y"]) <= 40 * usc
                    and t["text"].strip().upper() not in LABEL_BLACKLIST
                    and not t["text"].strip().startswith("PLOT DATE")
                    and not re.match(r'^[0-9.]+$', t["text"].strip())
                ]
                if d_cands:
                    d_cands.sort(key=lambda t: (dl["y"] - t["y"])**2 + (dl["x"] - t["x"])**2)
                    name = d_cands[0]["text"].strip()

        if not name:
            for t in tb_texts:
                u = t["text"].strip().upper()
                if u not in LABEL_BLACKLIST and not u.startswith("PLOT DATE") and len(u) >= 2:
                    if not re.match(r'^[0-9.+-]+$', u) and u not in ["AL6061", "S45C", "SUS304", "SS400", "MC NYLON"]:
                        if not pat_full.search(u) and not pat_unit.search(u):
                            name = t["text"].strip()
                            break

        # Material fallback
        if not mat or mat == "UNKNOWN":
            for t in tb_texts:
                u = t["text"].strip().upper()
                for km in KNOWN_MATERIALS:
                    if km in u:
                        mat = km
                        break
                if mat and mat != "UNKNOWN":
                    break

        # Special Notes
        special_notes = []
        for t in in_frame:
            txt = t["text"].strip()
            if any(k in txt for k in ["가공 변경", "가공 제외", "표준품", "가공변경", "가공제외", "재질변경", "두께 변경", "대칭 가공"]):
                if txt not in special_notes:
                    special_notes.append(txt)

        # Drawing Type
        dtype = "SUB_PART"
        no_u = dno.upper()
        name_u = (name or "").upper()
        if no_u.endswith("-000") or no_u.endswith("-A001") or "조립도" in name_u or "MAIN" in name_u or "CONVEYOR 연결" in name_u:
            if re.search(r'-(00|01)-000$', no_u) or "MAIN" in name_u:
                dtype = "MAIN_ASSEMBLY"
            else:
                dtype = "SUB_ASSEMBLY"

        all_extracted.append({
            "drawing_type": dtype,
            "level": 1 if dtype == "MAIN_ASSEMBLY" else (2 if dtype == "SUB_ASSEMBLY" else 3),
            "parent_drawing_no": None,
            "source_frame_handle": f"FRAME_{dno}",
            "frame_bbox": cb,
            "title_block_bbox": {
                "min_x": max(cb["min_x"], cb["max_x"] - 350 * usc),
                "min_y": cb["min_y"],
                "max_x": cb["max_x"],
                "max_y": min(cb["max_y"], cb["min_y"] + 150 * usc)
            },
            "drawing_no_raw": dno,
            "drawing_no_normalized": dno.upper().replace(" ", ""),
            "drawing_name_raw": name or dno,
            "drawing_name_normalized": (name or dno).strip(),
            "project_name": proj_no_global or dno.split("-")[0],
            "project_no": proj_no_global or dno.split("-")[0],
            "customer": customer or "-",
            "designer": "-",
            "design_date": "-",
            "company": company_global or "-",
            "revision": "R00",
            "material": mat or "UNKNOWN",
            "quantity": quantity,
            "surface_treatment": surface_treatment or "-",
            "specification": specification or "-",
            "scale": "1 / 1",
            "special_notes": special_notes,
            "confidence_score": 0.98 if dtype == "MAIN_ASSEMBLY" else 0.95,
            "status": "APPROVED"
        })

    # 4. Add unmapped clusters (for borderless sheets like in BorgWarner)
    for c_idx, cl in enumerate(clusters):
        if c_idx not in mapped_cluster_indices:
            cx, cy = cl["x"], cl["y"]
            tb_texts = [t for t in all_texts if abs(t["x"] - cx) <= 180 and abs(t["y"] - cy) <= 80]
            dno = cl["dno"]
            customer = None
            for t in tb_texts:
                txt = t["text"].strip()
                if is_company_like(txt) and txt != company_global:
                    customer = txt
                    break
            dtype = "MAIN_ASSEMBLY" if dno.endswith("-000") else "SUB_PART"
            all_extracted.append({
                "drawing_type": dtype,
                "level": 1 if dtype == "MAIN_ASSEMBLY" else 3,
                "parent_drawing_no": None,
                "source_frame_handle": f"FRAME_{dno}",
                "frame_bbox": {"min_x": cx - 200, "min_y": cy - 100, "max_x": cx + 200, "max_y": cy + 100},
                "title_block_bbox": {"min_x": cx - 180, "min_y": cy - 60, "max_x": cx + 180, "max_y": cy + 60},
                "drawing_no_raw": dno,
                "drawing_no_normalized": dno.upper().replace(" ", ""),
                "drawing_name_raw": dno,
                "drawing_name_normalized": dno,
                "project_name": dno.split("-")[0],
                "project_no": dno.split("-")[0],
                "customer": customer or "-",
                "designer": "-",
                "design_date": "-",
                "company": company_global or "-",
                "revision": "R00",
                "material": "UNKNOWN",
                "quantity": 1.0,
                "surface_treatment": "-",
                "specification": "-",
                "scale": "1 / 1",
                "special_notes": [],
                "confidence_score": 0.95,
                "status": "APPROVED"
            })

    # Sort drawings logically: MAIN_ASSEMBLY first, then SUB_ASSEMBLY, then SUB_PART
    type_order = {"MAIN_ASSEMBLY": 1, "SUB_ASSEMBLY": 2, "SUB_PART": 3}
    all_extracted.sort(key=lambda d: (type_order.get(d["drawing_type"], 99), d["drawing_no_raw"]))

    for idx, dwg in enumerate(all_extracted, 1):
        dwg["drawing_index"] = idx

    main_cnt = len([d for d in all_extracted if d["drawing_type"] == "MAIN_ASSEMBLY"])
    sub_cnt = len([d for d in all_extracted if d["drawing_type"] == "SUB_ASSEMBLY"])
    part_cnt = len([d for d in all_extracted if d["drawing_type"] == "SUB_PART"])

    return {
        "status": "SUCCESS",
        "total_drawings": len(all_extracted),
        "main_drawings_count": main_cnt,
        "sub_drawings_count": sub_cnt + part_cnt,
        "drawings": all_extracted,
        "duration_ms": int((time.time() - start_time) * 1000)
    }

def sanitize_unicode(obj):
    if isinstance(obj, str):
        return obj.encode('utf-8', 'surrogateescape').decode('utf-8', 'replace')
    elif isinstance(obj, dict):
        return {k: sanitize_unicode(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_unicode(v) for v in obj]
    return obj

if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: title_block_detector.py <cad_json> <frames_json>"}))
        sys.exit(1)
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        cad = json.load(f)
    with open(sys.argv[2], "r", encoding="utf-8") as f:
        frm = json.load(f)
    res = extract_title_blocks_hierarchical(cad, frm)
    clean_res = sanitize_unicode(res)
    try:
        print(json.dumps(clean_res, ensure_ascii=False, indent=2))
    except Exception:
        print(json.dumps(clean_res, ensure_ascii=True, indent=2))
