#!/usr/bin/env python3
"""
CADON-BOM High-Performance Unified CAD Analyzer (Single-Pass In-Memory Pipeline)
Combines:
  1. DXF parsing (in-memory)
  2. Frame Detection (in-memory)
  3. Title Block extraction (in-memory)
  4. Structure Classification (in-memory)
  5. BOM Area Detection (in-memory)
  6. Raw BOM Row Extraction (in-memory)
entirely in RAM without intermediate JSON disk writes or disk thrashing.
"""
import sys
import json
import time
import os

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

from dxf_parser import parse_dxf_file as parse_dxf
from frame_detector import detect_drawing_frames
from title_block_detector import extract_title_blocks_hierarchical as detect_title_blocks
from structure_classifier import classify_drawing_structure
from bom_area_detector import detect_bom_areas
from bom_row_extractor import extract_bom_rows
from multilevel_bom_builder import build_multilevel_bom
from bom_normalizer import normalize_bom_list

def run_fast_pipeline(dxf_path: str) -> dict:
    total_start = time.time()
    
    # 1. Parse DXF in memory (High-speed selective entity mode)
    t0 = time.time()
    cad_data = parse_dxf(dxf_path, text_and_frames_only=True)
    dxf_duration = int((time.time() - t0) * 1000)
    
    if cad_data.get("status") != "SUCCESS":
        return cad_data

    # 2. Detect Frames in memory
    t1 = time.time()
    frame_data = detect_drawing_frames(cad_data)
    frame_duration = int((time.time() - t1) * 1000)

    # 3. Detect Title Blocks in memory
    t2 = time.time()
    title_data = detect_title_blocks(cad_data, frame_data)
    title_duration = int((time.time() - t2) * 1000)

    # 4. Classify Structure in memory
    t3 = time.time()
    structure_data = classify_drawing_structure(title_data)
    struct_duration = int((time.time() - t3) * 1000)

    # 5. Detect BOM Areas in memory
    t4 = time.time()
    bom_areas_data = detect_bom_areas(cad_data, structure_data)
    bom_area_duration = int((time.time() - t4) * 1000)

    # 6. Extract Raw BOM Rows in memory
    t5 = time.time()
    raw_bom_data = extract_bom_rows(cad_data, bom_areas_data)
    raw_bom_duration = int((time.time() - t5) * 1000)

    # 7. Multi-Level BOM & Quantity Roll-Up in memory
    t6 = time.time()
    multilevel_data = build_multilevel_bom(raw_bom_data, structure_data, 1.0)
    multilevel_duration = int((time.time() - t6) * 1000)

    # 8. BOM Normalization in memory
    t7 = time.time()
    flattened_bom = multilevel_data.get("flattened_bom", [])
    norm_data = normalize_bom_list(flattened_bom)
    norm_duration = int((time.time() - t7) * 1000)

    total_duration = int((time.time() - total_start) * 1000)

    # Filter objects: Only retain TEXT/MTEXT entities for database indexing to prevent DB locking
    all_objects = cad_data.get("objects", [])
    text_objects = [
        o for o in all_objects 
        if o.get("raw_text") or o.get("entity_type") in ("TEXT", "MTEXT", "ATTRIB", "ATTDEF")
    ]

    return {
        "status": "SUCCESS",
        "total_duration_ms": total_duration,
        "step_durations": {
            "dxf_parse_ms": dxf_duration,
            "frame_detect_ms": frame_duration,
            "title_block_ms": title_duration,
            "structure_ms": struct_duration,
            "bom_area_ms": bom_area_duration,
            "raw_bom_ms": raw_bom_duration,
            "multilevel_ms": multilevel_duration,
            "norm_ms": norm_duration
        },
        "dxf_version": cad_data.get("dxf_version"),
        "total_entities": cad_data.get("total_entities"),
        "entity_counts": cad_data.get("entity_counts"),
        "global_bounds": cad_data.get("global_bounds"),
        "text_objects": text_objects,
        "frames": frame_data.get("frames", []),
        "drawings": structure_data.get("drawings", []),
        "relationships": structure_data.get("relationships", []),
        "bom_areas": bom_areas_data.get("bom_areas", []),
        "raw_bom_items": raw_bom_data.get("raw_bom_items", []),
        "multilevel_bom": multilevel_data.get("multilevel_bom", {}),
        "flattened_bom": flattened_bom,
        "normalized_items": norm_data.get("normalized_items", [])
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
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

    if len(sys.argv) < 2:
        print(json.dumps({"status": "ERROR", "message": "Usage: fast_cad_analyzer.py <input.dxf> [output_json]"}))
        sys.exit(1)

    dxf_file = sys.argv[1]
    result = run_fast_pipeline(dxf_file)
    clean_result = sanitize_unicode(result)

    if len(sys.argv) > 2:
        out_file = sys.argv[2]
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(clean_result, f, ensure_ascii=False)
        print(json.dumps({
            "status": clean_result.get("status"),
            "total_duration_ms": clean_result.get("total_duration_ms"),
            "step_durations": clean_result.get("step_durations"),
            "out_file": out_file
        }))
    else:
        try:
            print(json.dumps(clean_result, ensure_ascii=False))
        except Exception:
            print(json.dumps(clean_result, ensure_ascii=True))
