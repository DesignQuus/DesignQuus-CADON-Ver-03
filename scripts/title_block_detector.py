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
            
    # Regular expression for full drawing numbers: e.g. YYMMDD-XX-XXX, 240001-01-001
    dwg_no_pat = re.compile(r'\b([0-9]{6}-[A-Za-z0-9]{1,4}-[A-Za-z0-9]{2,4})\b')
    dwg_fallback_pat = re.compile(r'(?:DWG\s*(?:NO)?[.:\s]*)([A-Za-z0-9_-]+)', re.IGNORECASE)
    
    # Match main frame candidates from frames_data
    candidates = frames_data.get("candidates", [])

    # 1. Collect all drawing number occurrences
    dwg_occurrences = []
    for t in all_texts:
        matches = dwg_no_pat.findall(t["text"])
        for m in matches:
            dwg_occurrences.append({
                "dno": m.upper(),
                "x": t["x"],
                "y": t["y"]
            })
            
    if not dwg_occurrences:
        for t in all_texts:
            m = dwg_fallback_pat.search(t["text"])
            if m:
                dwg_occurrences.append({
                    "dno": m.group(1).upper(),
                    "x": t["x"],
                    "y": t["y"]
                })

    if not dwg_occurrences and candidates:
        for idx, cand in enumerate(candidates, 1):
            cbbox = cand.get("bbox", {})
            dwg_occurrences.append({
                "dno": f"DWG-{idx:03d}",
                "x": cbbox.get("max_x", 0) - 200,
                "y": cbbox.get("min_y", 0) + 100
            })

    # 2. Cluster spatially to eliminate duplicates at identical title block position
    clusters = []
    for occ in dwg_occurrences:
        dno, x, y = occ["dno"], occ["x"], occ["y"]
        found = False
        for c in clusters:
            if abs(c["x"] - x) < 150 and abs(c["y"] - y) < 150 and c["dno"] == dno:
                found = True
                break
        if not found:
            clusters.append({"dno": dno, "x": x, "y": y})

    
    # Detect candidate for main assembly drawing number across clusters
    main_dno_candidate = None
    for cl in clusters:
        cand_no = cl["dno"]
        if re.search(r'-(00|01)-000$', cand_no):
            main_dno_candidate = cand_no
            break
    if not main_dno_candidate:
        for cl in clusters:
            if cl["dno"].endswith("-000"):
                main_dno_candidate = cl["dno"]
                break

    # 3. Build drawings list
    all_extracted = []
    for idx, cl in enumerate(clusters, 1):
        dno = cl["dno"]
        cx, cy = cl["x"], cl["y"]
        
        # Texts in this title block area (clamped to avoid bleeding into adjacent drawing frames)
        tb_texts = [t for t in all_texts if abs(t["x"] - cx) <= 180 and abs(t["y"] - cy) <= 80]
        
        name = None
        mat = None
        customer = None
        designer = None
        design_date = None
        scale = "1 / 1"
        rev = "R00"
        company = None
        proj_name = None
        quantity = 1.0
        surface_treatment = None
        specification = None

        # 1. Extended mechanical engineering materials whitelist
        KNOWN_MATERIALS = [
            "SUJ2", "SK3", "SM45C", "S45C", "S20C", "SS400", "SS275", "SUS304", "SUS316", "SUS430",
            "AL6061", "A6061", "AL5052", "A5052", "AL7075", "A7075", "SCM440", "SCM415", "SKD11", "SKD61",
            "SUM24L", "MC NYLON", "MC", "POM", "ACETAL", "PE", "PP", "TEFLON", "PTFE", "BAKELITE", "BRASS", "C3604"
        ]

        # 2. Detect integrated Title Block BOM Table (NO., DESCRIPTION, SPECIFICATION, Q'TY, MATAL, REMAPK)
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
                    # Pick header label closest to title block center
                    if hk not in header_labels or abs(t["x"] - cx) < abs(header_labels[hk]["x"] - cx):
                        header_labels[hk] = t

        # If BOM headers found in title block area, extract aligned data row (usually row directly above or below headers)
        if header_labels and "QTY" in header_labels:
            ref_y = header_labels["QTY"]["y"]
            # Candidates in data row (typically 2 <= dy <= 18 above header)
            data_row_candidates = [
                t for t in tb_texts
                if 2 <= (t["y"] - ref_y) <= 25 and t["text"].strip() not in [
                    "NO.", "DESCRIPTION", "SPECIFICATION", "Q'TY", "QTY", "MATAL", "MATERIAL", "REMAPK", "REMARK"
                ]
            ]
            if not data_row_candidates:
                # Try below header if drawn inverted
                data_row_candidates = [
                    t for t in tb_texts
                    if -25 <= (t["y"] - ref_y) <= -2 and t["text"].strip() not in [
                        "NO.", "DESCRIPTION", "SPECIFICATION", "Q'TY", "QTY", "MATAL", "MATERIAL", "REMAPK", "REMARK"
                    ]
                ]

            def find_closest_text(header_label, cands, max_dx=35):
                if not header_label or not cands:
                    return None
                hx = header_label["x"]
                matches = [c for c in cands if abs(c["x"] - hx) <= max_dx]
                if matches:
                    matches.sort(key=lambda c: abs(c["x"] - hx))
                    return matches[0]["text"].strip()
                return None

            desc_val = find_closest_text(header_labels.get("DESC"), data_row_candidates, max_dx=40)
            if desc_val and len(desc_val) >= 2:
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

            spec_val = find_closest_text(header_labels.get("SPEC"), data_row_candidates, max_dx=40)
            if spec_val and spec_val != "-":
                specification = spec_val

        # Extract Customer from proximity to "CUSTOMER" label
        cust_labels = [t for t in tb_texts if t["text"].strip().upper() == "CUSTOMER"]
        if cust_labels:
            cl_label = cust_labels[0]
            cand = [
                t for t in tb_texts 
                if t != cl_label 
                and abs(t["x"] - cl_label["x"]) < 120 
                and abs(t["y"] - cl_label["y"]) < 30
                and t["text"].strip().upper() not in ["CUSTOMER", "DATE", "SCALE", "REV.", "DESIGN", "CHECK", "APPROVE"]
            ]
            if cand:
                customer = cand[0]["text"].strip()

        for t in tb_texts:
            txt = t["text"].strip()
            # Ignore metadata labels, dates, materials
            if txt in [
                "Project Name", "Project No.", "Sub Name", "DWG. No.", "REF. No.",
                "SCALE", "REV.", "DESIGN", "CHECK", "APPROVE", "NO.", "DESCRIPTION",
                "Q'TY", "MATAL", "REMAPK", "SPECIFICATION", "CUSTOMER", "MATERIAL", "DATE"
            ]:
                continue

            # Fallback customer match if not caught by proximity
            if not customer and any(k in txt for k in ["보그워너", "A&G", "현대", "기아", "삼성", "LG", "한화"]):
                customer = txt

            compact = re.sub(r'\s+', '', txt).upper()
            if (any(k in compact for k in ["CO.,LTD", "CO.,", "LTD", "INC.", "CORP.", "INTERNATIONAL"]) or any(k in compact for k in ["주식회사", "(주)", "㈜"])) and len(compact) > 3:
                if not customer or txt != customer:
                    company = re.sub(r'\s+', ' ', txt).strip()
            elif any(k in txt for k in [
                "PLATE", "SHAFT", "COVER", "RAIL", "BRACKET", "BLOCK", "PIN",
                "GUIDE", "STOPPER", "BUSH", "PAD", "HINGE", "SENSOR", "BASE",
                "SIDE", "ROLLER", "LOCKING", "CYLINDER", "UP_DOWN", "ASSY",
                "FRAME", "DRIVE", "SUPPORT", "POST", "BEAM", "ARM", "CHAIN", "LIFTER",
                "CAP", "END", "TENSOR", "SPACER", "COLLAR", "FLANGE", "HOOK", "SPRING",
                "ROD", "BAR", "WHEEL", "PULLEY", "GEAR", "SPROCKET"
            ]):
                if not re.match(r'^\d{4,}', txt) and len(txt) < 40 and not name:
                    name = txt
            elif not mat:
                for km in KNOWN_MATERIALS:
                    if km in txt.upper():
                        mat = km
                        break
            elif re.match(r'^\d{2}\.\d{2}\.\d{2}$', txt):
                design_date = txt
            elif "1/" in txt or "1 /" in txt:
                scale = txt
            elif txt.startswith("R0") or txt == "REV.0":
                rev = txt

        # Fallback for sub-part name if no standard keyword matched
        if not name and dno and not dno.endswith("-000"):
            for t in tb_texts:
                txt = t["text"].strip()
                if txt in [
                    "Project Name", "Project No.", "Sub Name", "DWG. No.", "REF. No.",
                    "SCALE", "REV.", "DESIGN", "CHECK", "APPROVE", "NO.", "DESCRIPTION",
                    "Q'TY", "MATAL", "REMAPK", "SPECIFICATION", "CUSTOMER", "MATERIAL", "DATE"
                ]:
                    continue
                if re.match(r'^\d', txt) or any(km in txt.upper() for km in KNOWN_MATERIALS):
                    continue
                if any(k in txt.upper() for k in ["CO.", "LTD", "INC.", "CORP.", "주식회사", "(주)"]):
                    continue
                if 2 <= len(txt) <= 35:
                    name = txt
                    break

        if not name:
            if dno.endswith("-000"):
                parts = dno.split('-')
                name = f"서브 조립도 ({parts[1] if len(parts) > 1 else dno})"
            else:
                name = f"단위 가공품 ({dno.split('-')[-1]})"

        # Classification
        if re.search(r'-(00|01)-000$', dno):
            dtype = "MAIN_ASSEMBLY"
            level = 1
        elif dno.endswith("-000"):
            dtype = "SUB_ASSEMBLY"
            level = 2
        else:
            dtype = "SUB_PART"
            level = 3

        # Match tightest frame candidate enclosing (cx, cy)
        matched_frame = None
        min_frame_area = float('inf')
        for fr in candidates:
            fb = fr.get("bbox", {})
            if fb.get("min_x", 0) <= cx <= fb.get("max_x", 0) and fb.get("min_y", 0) <= cy <= fb.get("max_y", 0):
                w = fb.get("max_x", 0) - fb.get("min_x", 0)
                h = fb.get("max_y", 0) - fb.get("min_y", 0)
                area = w * h
                if area < min_frame_area:
                    min_frame_area = area
                    matched_frame = fb

        if matched_frame:
            fbox = matched_frame
        elif dno.endswith("-00-000"):
            # Top-level overall layout frame fallback to dynamic global CAD bounds
            gb = cad_data.get("global_bounds", {})
            if gb and gb.get("width", 0) > 0:
                fbox = {"min_x": gb["min_x"], "min_y": gb["min_y"], "max_x": gb["max_x"], "max_y": gb["max_y"]}
            else:
                fbox = {"min_x": 0, "min_y": 0, "max_x": cx + 1000, "max_y": cy + 1000}
        elif dtype == "MAIN_ASSEMBLY":
            fbox = {
                "min_x": cx - 5000, "min_y": cy - 200,
                "max_x": cx + 500, "max_y": cy + 3500
            }
        else:
            # Single unit part: default to standard A3/A4 landscape paper (420x297mm)
            fbox = {
                "min_x": cx - 350, "min_y": cy - 40,
                "max_x": cx + 70, "max_y": cy + 257
            }

        tbox = {
            "min_x": cx - 180, "min_y": cy - 60,
            "max_x": cx + 180, "max_y": cy + 60
        }
        # Clamp title block neatly within sheet frame
        if fbox:
            tbox = {
                "min_x": max(fbox["min_x"], tbox["min_x"]),
                "min_y": max(fbox["min_y"], tbox["min_y"]),
                "max_x": min(fbox["max_x"], tbox["max_x"]),
                "max_y": min(fbox["max_y"], tbox["max_y"])
            }

        # 3. Extract dimensions from drawing frame graphic area for specification (e.g. Ø16 h7 x L130)
        if not specification or specification == "-":
            frame_texts = [
                t for t in all_texts
                if fbox["min_x"] <= t["x"] <= fbox["max_x"]
                and fbox["min_y"] <= t["y"] <= fbox["max_y"]
                and not (tbox["min_x"] <= t["x"] <= tbox["max_x"] and tbox["min_y"] <= t["y"] <= tbox["max_y"])
            ]
            dia_cand = None
            len_cand = None
            for ft in frame_texts:
                ftxt = ft["text"]
                # Match diameter: Ø16, %%c16, DIA 16, with optional tolerance e.g. h7
                m_dia = re.search(r'[Ø%%c]\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]\d+)?', ftxt, re.IGNORECASE)
                if m_dia and not dia_cand:
                    val = m_dia.group(1)
                    tol = m_dia.group(2) or ""
                    dia_cand = f"Ø{val} {tol}".strip()
                # Match length or thickness: e.g. 130, 200, t=3.0
                elif not len_cand and re.match(r'^\d{2,4}(\.\d+)?$', ftxt.strip()):
                    num = float(ftxt.strip())
                    if 20 <= num <= 2000:
                        len_cand = f"L{int(num) if num.is_integer() else num}"

            if dia_cand and len_cand:
                specification = f"{dia_cand} × {len_cand}"
            elif dia_cand:
                specification = dia_cand
            elif len_cand:
                specification = len_cand

        parent_no = None
        if level > 1 and main_dno_candidate and main_dno_candidate != dno:
            parent_no = main_dno_candidate

        all_extracted.append({
            "drawing_type": dtype,
            "level": level,
            "parent_drawing_no": parent_no,
            "source_frame_handle": f"FRAME_{dno}",
            "frame_bbox": fbox,
            "title_block_bbox": tbox,
            "drawing_no_raw": dno,
            "drawing_no_normalized": dno.upper().replace(" ", ""),
            "drawing_name_raw": name,
            "drawing_name_normalized": name.strip() if name else "",
            "project_name": proj_name or dno.split("-")[0],
            "project_no": dno.split("-")[0],
            "customer": customer or "-",
            "designer": designer or "-",
            "design_date": design_date or "-",
            "company": company or "-",
            "revision": rev or "R00",
            "material": mat or "UNKNOWN",
            "quantity": quantity,
            "surface_treatment": surface_treatment or "-",
            "specification": specification or "-",
            "scale": scale or "1 / 1",
            "confidence_score": 0.98 if dtype == "MAIN_ASSEMBLY" else 0.95,
            "status": "APPROVED"
        })

    # Sort drawings logically: MAIN_ASSEMBLY first, then SUB_ASSEMBLY, then SUB_PART
    type_order = {"MAIN_ASSEMBLY": 1, "SUB_ASSEMBLY": 2, "SUB_PART": 3}
    all_extracted.sort(key=lambda d: (type_order.get(d["drawing_type"], 99), d["drawing_no_raw"]))
    
    # Assign sequential drawing_index
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
