#!/usr/bin/env python3
"""
CADON-BOM SERVER POC - PROMPT 11
BOM Normalization & Raw Name Standardization Engine
"""
import sys
import json
import re
import time

ABBREVIATION_MAP = {
    "G/R": "GUIDE RAIL",
    "GR": "GUIDE RAIL",
    "BRKT": "BRACKET",
    "BK": "BRACKET",
    "MTR": "MOTOR",
    "MOT": "MOTOR",
    "FR": "FRAME",
    "CYL": "CYLINDER",
    "SFT": "SHAFT",
    "SF": "SHAFT",
    "ASS'Y": "ASSY",
    "ASSEMBLY": "ASSY"
}

def normalize_bom_item(item: dict) -> dict:
    raw_name = item.get("name_raw") or item.get("name", "")
    raw_spec = item.get("specification_raw") or item.get("specification", "")
    raw_mat = item.get("material_raw") or item.get("material", "")
    part_no = item.get("part_no") or item.get("part_no_raw") or item.get("drawing_no", "")
    
    # 1. Clean string
    cleaned = raw_name.upper().strip()
    
    # 2. Extract direction (LH / RH)
    direction = None
    if re.search(r'\bLH\b', cleaned) or " LH" in cleaned:
        direction = "LH"
    elif re.search(r'\bRH\b', cleaned) or " RH" in cleaned:
        direction = "RH"
        
    # 3. Abbreviation Expansion
    tokens = re.split(r'[\s/_\-]+', cleaned)
    expanded_tokens = []
    for t in tokens:
        if t in ABBREVIATION_MAP:
            expanded_tokens.append(ABBREVIATION_MAP[t])
        else:
            expanded_tokens.append(t)
            
    normalized_name = " ".join(expanded_tokens)
    
    # 4. Extract spec / dimensions if in name (e.g. 1200L, 150x120)
    spec_candidate = raw_spec
    dim_match = re.search(r'(\d+L|\d+X\d+|\d+MM|DIA\s*\d+)', normalized_name)
    if dim_match and not spec_candidate:
        spec_candidate = dim_match.group(1)
        
    # 5. Extract material if in name
    mat_candidate = raw_mat
    mat_match = re.search(r'\b(SUJ2|SK3|SM45C|S45C|S20C|SS400|SS275|SUS304|SUS316|AL6061|A6061|AL5052|A5052|AL6063|POM|MC[\s_-]?NYLON|SCM440|SCM415|SKD11|SKD61|SUM24L|AL)\b', normalized_name)
    if mat_match:
        mat_candidate = mat_match.group(1)
        if mat_candidate == "AL":
            mat_candidate = "AL6063"
            
    search_name = normalized_name
    for m in ["SUJ2", "SK3", "SM45C", "S45C", "S20C", "SS400", "SS275", "SUS304", "SUS316", "AL6063", "AL6061", "AL"]:
        search_name = search_name.replace(m, "").strip()
    search_name = re.sub(r'\s+', ' ', search_name).strip()
    
    return {
        "id": item.get("id"),
        "part_no": part_no,
        "raw_name": raw_name,
        "normalized_name": normalized_name,
        "search_name": search_name,
        "direction": direction,
        "spec_candidate": spec_candidate or "-",
        "material_candidate": mat_candidate if (mat_candidate and mat_candidate != "UNKNOWN") else (raw_mat or "UNKNOWN"),
        "quantity": item.get("total_quantity", item.get("quantity_numeric", 1.0)),
        "unit": item.get("unit", "EA"),
        "surface_treatment": item.get("surface_treatment") or "-",
        "confidence_score": 0.95,
        "status": "NORMALIZED"
    }

def sanitize_unicode(obj):
    if isinstance(obj, str):
        return obj.encode('utf-8', 'surrogateescape').decode('utf-8', 'replace')
    elif isinstance(obj, dict):
        return {k: sanitize_unicode(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_unicode(v) for v in obj]
    return obj

def normalize_bom_list(items_list: list) -> dict:
    start_time = time.time()
    normalized = [normalize_bom_item(item) for item in items_list]
    return {
        "status": "SUCCESS",
        "total_items": len(normalized),
        "normalized_items": normalized,
        "duration_ms": int((time.time() - start_time) * 1000)
    }

if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: bom_normalizer.py <items_json>"}))
        sys.exit(1)
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        data = json.load(f)
    items = data if isinstance(data, list) else data.get("flattened_bom", data.get("raw_bom_items", []))
    res = normalize_bom_list(items)
    clean_res = sanitize_unicode(res)
    try:
        print(json.dumps(clean_res, ensure_ascii=False, indent=2))
    except Exception:
        print(json.dumps(clean_res, ensure_ascii=True, indent=2))
