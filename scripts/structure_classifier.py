#!/usr/bin/env python3
"""
CADON-BOM SERVER POC - PROMPT 07
Drawing Structure Map & Drawing Type Classification Engine
"""
import sys
import json
import time
import re

def classify_drawing_structure(drawings_data: dict) -> dict:
    start_time = time.time()
    drawings = drawings_data.get("drawings", [])
    
    classified = []
    relationships = []
    
    for dwg in drawings:
        name = dwg.get("drawing_name_raw", "").upper()
        no = dwg.get("drawing_no_raw", "").upper()
        
        # Classification rules
        existing_type = dwg.get("drawing_type")
        if existing_type in ["MAIN_ASSEMBLY", "SUB_ASSEMBLY", "SUB_PART"]:
            dtype = existing_type
        elif re.search(r'-(00|01)-000$', no):
            dtype = "MAIN_ASSEMBLY"
        elif no.endswith("-000"):
            dtype = "SUB_ASSEMBLY"
        elif "MAIN" in name or "TOTAL" in name:
            dtype = "MAIN_ASSEMBLY"
        elif "ASSY" in name or "ASSEMBLY" in name or "SUB" in name:
            dtype = "SUB_ASSEMBLY"
        else:
            dtype = "SUB_PART"
            
        dwg_copy = dict(dwg)
        dwg_copy["drawing_type"] = dtype
        classified.append(dwg_copy)
        
    # Build tree relationships: MAIN_ASSEMBLY -> SUB_ASSEMBLY -> SUB_PART
    main_assys = [d for d in classified if d["drawing_type"] == "MAIN_ASSEMBLY"]
    sub_assys = [d for d in classified if d["drawing_type"] == "SUB_ASSEMBLY"]
    parts = [d for d in classified if d["drawing_type"] == "SUB_PART"]
    
    root = main_assys[0] if main_assys else (classified[0] if classified else None)
    
    if root:
        for sub in sub_assys:
            if sub["drawing_no_raw"] != root["drawing_no_raw"]:
                relationships.append({
                    "parent_drawing_no": root["drawing_no_raw"],
                    "child_drawing_no": sub["drawing_no_raw"],
                    "relationship_type": "ASSEMBLY_COMPONENT",
                    "confidence_score": 0.95
                })
        for part in parts:
            parent = sub_assys[0] if sub_assys else root
            if part["drawing_no_raw"] != parent["drawing_no_raw"]:
                relationships.append({
                    "parent_drawing_no": parent["drawing_no_raw"],
                    "child_drawing_no": part["drawing_no_raw"],
                    "relationship_type": "PART_COMPONENT",
                    "confidence_score": 0.90
                })
                
    return {
        "status": "SUCCESS",
        "total_drawings": len(classified),
        "drawings": classified,
        "relationships": relationships,
        "has_cycle": False,
        "duration_ms": int((time.time() - start_time) * 1000)
    }

if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: structure_classifier.py <drawings_json>"}))
        sys.exit(1)
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        data = json.load(f)
    res = classify_drawing_structure(data)
    try:
        print(json.dumps(res, ensure_ascii=False, indent=2))
    except Exception:
        print(json.dumps(res, ensure_ascii=True, indent=2))
