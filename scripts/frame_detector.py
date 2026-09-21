#!/usr/bin/env python3
"""
CADON-BOM SERVER POC - PROMPT 05
True Drawing Sheet Frame Detection Engine (Enhanced Dual-Anchor Architecture)
Intelligently preserves nested drawing sheets using title block anchor verification
and prevents false containment drops on large assembly canvases.
"""
import sys
import json
import time
import re

def detect_drawing_frames(cad_data: dict) -> dict:
    start_time = time.time()
    objects = cad_data.get("objects", [])
    gb = cad_data.get("global_bounds", {})
    
    # 1. Collect title block anchors (DWG No, legal notices, Project No, standard labels)
    anchor_texts = []
    dwg_no_pat = re.compile(r'\b([0-9]{4,6}(?:-[A-Za-z0-9]{1,4}){2,4})\b')
    for obj in objects:
        t = obj.get("raw_text")
        if t:
            clean = t.strip()
            if ('THIS DRAWING CONTAINS' in clean or 'DWG No.' in clean or 'DWG NO' in clean or 
                '도번' in clean or 'PROJECT No.' in clean or 'Project No.' in clean or 
                dwg_no_pat.search(clean)):
                geom = obj.get("geometry_data", {})
                ins = geom.get("insert") or [0, 0]
                anchor_texts.append({
                    "text": clean,
                    "x": ins[0],
                    "y": ins[1]
                })

    # 2. Extract candidate rectangular frames (Closed Polyline or bounding boxes)
    raw_boxes = []
    for obj in objects:
        t = obj.get("entity_type")
        bbox = obj.get("bounding_box", {})
        w = bbox.get("max_x", 0) - bbox.get("min_x", 0)
        h = bbox.get("max_y", 0) - bbox.get("min_y", 0)
        if t in ['LWPOLYLINE', 'POLYLINE']:
            if 180 <= w <= 8000 and 120 <= h <= 6000:
                aspect = w / h if h > 0 else 0
                if 0.5 <= aspect <= 3.0:
                    anchors_inside = [
                        a for a in anchor_texts
                        if bbox["min_x"] - 30 <= a["x"] <= bbox["max_x"] + 30 and
                           bbox["min_y"] - 30 <= a["y"] <= bbox["max_y"] + 30
                    ]
                    raw_boxes.append({
                        "source_handle": obj.get("handle"),
                        "frame_type": "CLOSED_POLYLINE",
                        "bbox": bbox,
                        "width": round(w, 1),
                        "height": round(h, 1),
                        "area": w * h,
                        "aspect_ratio": round(aspect, 3),
                        "confidence_score": 0.95,
                        "anchor_count": len(anchors_inside)
                    })

    # 3. Intelligent Containment Filtering
    # Sort boxes by area descending
    raw_boxes.sort(key=lambda b: b["area"], reverse=True)
    
    dropped_parents = set()
    for i, b in enumerate(raw_boxes):
        if i in dropped_parents:
            continue
            
        pb = b["bbox"]
        children = []
        for j, other in enumerate(raw_boxes):
            if i != j and j not in dropped_parents:
                ob = other["bbox"]
                if (ob["min_x"] >= pb["min_x"] - 50 and ob["max_x"] <= pb["max_x"] + 50 and
                    ob["min_y"] >= pb["min_y"] - 50 and ob["max_y"] <= pb["max_y"] + 50):
                    children.append((j, other))
                    
        if children:
            anchored_children = [c for c in children if c[1]["anchor_count"] > 0]
            if len(anchored_children) >= 2 or (len(anchored_children) == 1 and b["width"] > 2500 and b["height"] > 1800):
                # b is a grouping frame or large overview canvas. Keep individual drawing sheets!
                dropped_parents.add(i)
                continue
            elif not anchored_children and b["anchor_count"] > 0:
                # b is the true sheet, children are internal component details
                for c_idx, _ in children:
                    dropped_parents.add(c_idx)

    # 4. Collect verified frames
    filtered_frames = []
    for i, b in enumerate(raw_boxes):
        if i not in dropped_parents and b["anchor_count"] > 0:
            filtered_frames.append(b)

    # Eliminate duplicate near-identical frames (inner/outer border pairs)
    unique_sheets = []
    for f in filtered_frames:
        fb = f["bbox"]
        is_dup = False
        for u in unique_sheets:
            ub = u["bbox"]
            if abs(fb["min_x"] - ub["min_x"]) < 100 and abs(fb["max_x"] - ub["max_x"]) < 100 and \
               abs(fb["min_y"] - ub["min_y"]) < 100 and abs(fb["max_y"] - ub["max_y"]) < 100:
                is_dup = True
                break
        if not is_dup:
            unique_sheets.append(f)

    # Sort sheets spatially: Top-to-Bottom, Left-to-Right
    unique_sheets.sort(key=lambda c: (-c["bbox"]["max_y"], c["bbox"]["min_x"]))

    # Fallback if no sheet detected: Use global bounds
    if not unique_sheets and gb and gb.get("width", 0) > 0:
        unique_sheets.append({
            "source_handle": "GLOBAL_FRAME",
            "frame_type": "GLOBAL_BOUNDS",
            "bbox": {"min_x": gb["min_x"], "min_y": gb["min_y"], "max_x": gb["max_x"], "max_y": gb["max_y"]},
            "width": gb["width"],
            "height": gb["height"],
            "area": gb["width"] * gb["height"],
            "aspect_ratio": round(gb["width"]/gb["height"], 3) if gb["height"]>0 else 1.414,
            "confidence_score": 0.90
        })

    for i, cand in enumerate(unique_sheets):
        cand["candidate_index"] = i + 1
        cand["status"] = "HIGH"

    return {
        "status": "SUCCESS",
        "total_detected": len(unique_sheets),
        "candidates": unique_sheets,
        "duration_ms": int((time.time() - start_time) * 1000)
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: frame_detector.py <cad_data_json>"}))
        sys.exit(1)
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        data = json.load(f)
    res = detect_drawing_frames(data)
    print(json.dumps(res, ensure_ascii=False, indent=2))
