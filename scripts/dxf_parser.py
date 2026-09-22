#!/usr/bin/env python3
"""
CADON-BOM SERVER POC - PROMPT 04 (PRECISION REAL CAD ENGINE)
Standalone DXF Parser / Common CAD Object Model Generator
Extracts exact CAD Geometry, Dimensions, Rotations, Alignments, and True Font Heights
"""
import os
import sys
import json
import time
import re
import math
from ezdxf import recover
import ezdxf

# 공용 도곽/표제란 엔진 (프록시 블록 시트 재구성)
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)
from sheet_frame_engine import rect_from_points, paper_ratio_match, reconstruct_proxy_sheet, is_empty_block

FORM_NAME_PAT = re.compile(r'(DRAWFORM|FORM|SHEET|FRAME|BORDER|TITLE|도곽|양식|^[AB][0-4]$)', re.I)

def clean_cad_text(text: str) -> str:
    if not text:
        return ""
    t = str(text)
    # AutoCAD text formatting codes
    t = re.sub(r'%%[uU]', '', t)         # Underline
    t = re.sub(r'%%[dD]', '°', t)        # Degree
    t = re.sub(r'%%[pP]', '±', t)        # Plus/Minus
    t = re.sub(r'%%[cC]', 'Ø', t)        # Diameter
    # MText formatting codes: \A, \C, \H, \W, \F, \P, \T, \Q, \S, \K, \L, \O etc.
    t = re.sub(r'\\[AaCcHhWwFfPpTtQqSsKkLlOo][^;]*;', '', t)
    t = re.sub(r'\\[Pp]', ' ', t)        # Newline
    t = re.sub(r'[{}\\]', '', t)
    # Strip any orphaned format tokens before semicolon like "T1.45;" or "H2.5;"
    t = re.sub(r'^[A-Za-z][0-9.]*;', '', t)
    return t.strip()

def transform_point(p, ins, rotation_deg, scale_x, scale_y):
    x, y = p[0] * scale_x, p[1] * scale_y
    if rotation_deg:
        rad = math.radians(rotation_deg)
        cos_r = math.cos(rad)
        sin_r = math.sin(rad)
        rx = x * cos_r - y * sin_r
        ry = x * sin_r + y * cos_r
        x, y = rx, ry
    return [ins[0] + x, ins[1] + y]

def get_bounding_box(entity):
    dxftype = entity.dxftype()
    try:
        if dxftype == 'LINE':
            start = entity.dxf.start
            end = entity.dxf.end
            return {
                "min_x": min(start[0], end[0]), "min_y": min(start[1], end[1]),
                "max_x": max(start[0], end[0]), "max_y": max(start[1], end[1])
            }
        elif dxftype in ['LWPOLYLINE', 'POLYLINE']:
            pts = list(entity.points()) if dxftype == 'POLYLINE' else [(p[0], p[1]) for p in entity.get_points()]
            if pts:
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                return {"min_x": min(xs), "min_y": min(ys), "max_x": max(xs), "max_y": max(ys)}
        elif dxftype in ['TEXT', 'MTEXT', 'ATTRIB']:
            ins = entity.dxf.insert
            h = getattr(entity.dxf, 'height', 10.0)
            raw = getattr(entity.dxf, 'text', '') if dxftype == 'TEXT' else getattr(entity, 'text', '')
            cleaned = clean_cad_text(raw)
            w = len(cleaned) * h * 0.8 if cleaned else h
            return {
                "min_x": ins[0], "min_y": ins[1],
                "max_x": ins[0] + w, "max_y": ins[1] + h
            }
        elif dxftype in ['CIRCLE', 'ARC']:
            c = entity.dxf.center
            r = entity.dxf.radius
            return {"min_x": c[0]-r, "min_y": c[1]-r, "max_x": c[0]+r, "max_y": c[1]+r}
        elif dxftype == 'INSERT':
            ins = entity.dxf.insert
            return {"min_x": ins[0]-50, "min_y": ins[1]-50, "max_x": ins[0]+50, "max_y": ins[1]+50}
    except Exception:
        pass
    return {"min_x": 0.0, "min_y": 0.0, "max_x": 0.0, "max_y": 0.0}

def parse_dxf_file(dxf_path: str) -> dict:
    start_time = time.time()
    if not os.path.exists(dxf_path):
        return {"status": "ERROR", "error": "FILE_NOT_FOUND"}
    
    try:
        import io
        import contextlib
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            try:
                doc = ezdxf.readfile(dxf_path, encoding='utf-8')
            except Exception:
                try:
                    doc, _ = recover.readfile(dxf_path)
                except Exception:
                    doc = ezdxf.readfile(dxf_path, encoding='latin1')
            
        msp = doc.modelspace()
        layers = [layer.dxf.name for layer in doc.layers]
        blocks = [block.name for block in doc.blocks if not block.name.startswith('*')]
        
        objects = []
        counts = {
            "LINE": 0, "LWPOLYLINE": 0, "POLYLINE": 0, "TEXT": 0,
            "MTEXT": 0, "DIMENSION": 0, "INSERT": 0, "CIRCLE": 0,
            "ARC": 0, "OTHER": 0
        }
        
        global_min_x = float('inf')
        global_min_y = float('inf')
        global_max_x = float('-inf')
        global_max_y = float('-inf')

        # 프록시(빈) 블록 시트 재구성용 수집 버퍼
        msp_boxes = []          # 모델 공간 엔티티 bbox (INSERT 제외)
        msp_rects = []          # 모델 공간 닫힌 사각형 (그룹핑 박스 후보)
        known_sheet_rects = []  # 블록에서 전개된 규격 용지 비율 사각형 (단품 시트 도곽)
        proxy_inserts = []      # {'insert': (x,y), 'scale': s, 'name': bname}

        def update_bounds(bbox):
            nonlocal global_min_x, global_min_y, global_max_x, global_max_y
            if bbox and (bbox["min_x"] != bbox["max_x"] or bbox["min_y"] != bbox["max_y"]):
                global_min_x = min(global_min_x, bbox["min_x"])
                global_min_y = min(global_min_y, bbox["min_y"])
                global_max_x = max(global_max_x, bbox["max_x"])
                global_max_y = max(global_max_y, bbox["max_y"])

        # 1. Process Modelspace Entities
        for e in msp:
            t = e.dxftype()
            counts[t] = counts.get(t, 0) + 1
            bbox = get_bounding_box(e)
            update_bounds(bbox)
            
            raw_text = getattr(e.dxf, 'text', None)
            if raw_text is None and t == 'MTEXT':
                raw_text = getattr(e, 'text', None)
            if raw_text:
                raw_text = clean_cad_text(raw_text)
            
            geom_data = {}
            if t == 'LINE':
                s = e.dxf.start
                end = e.dxf.end
                geom_data = {"start": [s[0], s[1]], "end": [end[0], end[1]]}
            elif t in ['LWPOLYLINE', 'POLYLINE']:
                pts = list(e.points()) if t == 'POLYLINE' else [(p[0], p[1]) for p in e.get_points()]
                geom_data = {"points": [[p[0], p[1]] for p in pts], "is_closed": (getattr(e, 'closed', False) or getattr(e, 'is_closed', False))}
            elif t in ['TEXT', 'MTEXT']:
                ins = e.dxf.insert
                rot = getattr(e.dxf, 'rotation', 0.0)
                h = getattr(e.dxf, 'height', 10.0)
                align = getattr(e.dxf, 'halign', 0) or getattr(e.dxf, 'attachment_point', 0)
                geom_data = {
                    "insert": [ins[0], ins[1]],
                    "height": h,
                    "rotation": rot,
                    "align": align
                }
            elif t in ['CIRCLE', 'ARC']:
                c = e.dxf.center
                geom_data = {"center": [c[0], c[1]], "radius": e.dxf.radius}
            elif t == 'DIMENSION':
                # Extract Dimension Geometry from anonymous block *D...
                geom_block_name = getattr(e.dxf, 'geometry', None)
                if geom_block_name and geom_block_name in doc.blocks:
                    dim_block = doc.blocks[geom_block_name]
                    for sub_e in dim_block:
                        st = sub_e.dxftype()
                        if st == 'LINE':
                            s = sub_e.dxf.start
                            end = sub_e.dxf.end
                            dim_bbox = {"min_x": min(s[0], end[0]), "min_y": min(s[1], end[1]), "max_x": max(s[0], end[0]), "max_y": max(s[1], end[1])}
                            update_bounds(dim_bbox)
                            objects.append({
                                "handle": getattr(sub_e.dxf, 'handle', f"dim_{len(objects)+1}"),
                                "entity_type": "LINE",
                                "layer": "DIMENSION",
                                "color": 2, # Yellow dimension line
                                "raw_text": None,
                                "bounding_box": dim_bbox,
                                "geometry_data": {"start": [s[0], s[1]], "end": [end[0], end[1]], "is_dim": True}
                            })
                        elif st in ['TEXT', 'MTEXT']:
                            sub_raw = getattr(sub_e.dxf, 'text', '') if st == 'TEXT' else getattr(sub_e, 'text', '')
                            cleaned_dim = clean_cad_text(sub_raw)
                            if cleaned_dim:
                                sub_ins = sub_e.dxf.insert
                                sub_h = getattr(sub_e.dxf, 'height', 10.0)
                                sub_rot = getattr(sub_e.dxf, 'rotation', 0.0)
                                sub_align = getattr(sub_e.dxf, 'halign', 0) or getattr(sub_e.dxf, 'attachment_point', 0)
                                dim_txt_bbox = {"min_x": sub_ins[0], "min_y": sub_ins[1], "max_x": sub_ins[0]+len(cleaned_dim)*sub_h, "max_y": sub_ins[1]+sub_h}
                                update_bounds(dim_txt_bbox)
                                objects.append({
                                    "handle": getattr(sub_e.dxf, 'handle', f"dim_{len(objects)+1}"),
                                    "entity_type": "TEXT",
                                    "layer": "DIMENSION",
                                    "color": 2,
                                    "raw_text": cleaned_dim,
                                    "bounding_box": dim_txt_bbox,
                                    "geometry_data": {
                                        "insert": [sub_ins[0], sub_ins[1]],
                                        "height": sub_h,
                                        "rotation": sub_rot,
                                        "align": sub_align,
                                        "is_dim": True
                                    }
                                })
            elif t == 'INSERT':
                ins = e.dxf.insert
                block_name = getattr(e.dxf, 'name', '')
                rot = getattr(e.dxf, 'rotation', 0.0)
                sx = getattr(e.dxf, 'xscale', 1.0)
                sy = getattr(e.dxf, 'yscale', 1.0)
                geom_data = {"block_name": block_name, "insert": [ins[0], ins[1]], "rotation": rot, "scale": [sx, sy]}

            if t != 'INSERT' and bbox and (bbox["min_x"] != bbox["max_x"] or bbox["min_y"] != bbox["max_y"]):
                msp_boxes.append((bbox["min_x"], bbox["min_y"], bbox["max_x"], bbox["max_y"]))
            if t in ['LWPOLYLINE', 'POLYLINE'] and geom_data.get('points') and len(geom_data['points']) in (4, 5):
                _pts = [(pp[0], pp[1]) for pp in geom_data['points']]
                _xs = [pp[0] for pp in _pts]; _ys = [pp[1] for pp in _pts]
                _r = rect_from_points(_pts, max(max(_xs) - min(_xs), max(_ys) - min(_ys), 1e-6) * 0.005)
                if _r:
                    msp_rects.append(_r)
            if t == 'INSERT':
                _bname = getattr(e.dxf, 'name', None)
                _blk = doc.blocks.get(_bname) if _bname else None
                if _bname and is_empty_block(_blk) and not list(getattr(e, 'attribs', []) or []) and FORM_NAME_PAT.search(_bname):
                    _sx = abs(getattr(e.dxf, 'xscale', 1.0) or 1.0)
                    proxy_inserts.append({'insert': (e.dxf.insert[0], e.dxf.insert[1]), 'scale': _sx, 'name': _bname})

            # 1-1. Modelspace Entity Append (Selective smart filter for Title Block & BOM)
            should_append = False
            if raw_text:
                should_append = True
            elif t in ['LWPOLYLINE', 'POLYLINE', 'INSERT']:
                should_append = True
            elif t == 'LINE' and geom_data.get('start') and geom_data.get('end'):
                s = geom_data['start']
                end = geom_data['end']
                if abs(end[0] - s[0]) > 300 or abs(end[1] - s[1]) > 300:
                    should_append = True

            if should_append and t not in ['DIMENSION', 'INSERT']:
                objects.append({
                    "handle": getattr(e.dxf, 'handle', f"obj_{len(objects)+1}"),
                    "entity_type": t,
                    "layer": getattr(e.dxf, 'layer', '0'),
                    "color": getattr(e.dxf, 'color', 256),
                    "raw_text": raw_text or None,
                    "bounding_box": bbox,
                    "geometry_data": geom_data
                })

            # 1-2. Explode INSERT / Block References (Only extract text, frames, and boundary lines)
            if t == 'INSERT':
                block_name = getattr(e.dxf, 'name', None)
                if block_name and block_name in doc.blocks:
                    ins = e.dxf.insert
                    rot = getattr(e.dxf, 'rotation', 0.0)
                    sx = getattr(e.dxf, 'xscale', 1.0)
                    sy = getattr(e.dxf, 'yscale', 1.0)
                    
                    block_def = doc.blocks[block_name]
                    for sub_e in block_def:
                        sub_t = sub_e.dxftype()
                        if sub_t in ['TEXT', 'MTEXT']:
                            sub_raw = getattr(sub_e.dxf, 'text', '') if sub_t == 'TEXT' else getattr(sub_e, 'text', '')
                            sub_cleaned = clean_cad_text(sub_raw)
                            if sub_cleaned:
                                sub_ins = transform_point(sub_e.dxf.insert, ins, rot, sx, sy)
                                sub_h = getattr(sub_e.dxf, 'height', 10.0) * abs(sy)
                                b_bbox = {"min_x": sub_ins[0], "min_y": sub_ins[1], "max_x": sub_ins[0] + len(sub_cleaned) * sub_h, "max_y": sub_ins[1] + sub_h}
                                update_bounds(b_bbox)
                                objects.append({
                                    "handle": getattr(sub_e.dxf, 'handle', f"blk_{len(objects)+1}"),
                                    "entity_type": "TEXT",
                                    "layer": getattr(e.dxf, 'layer', '0'),
                                    "color": getattr(e.dxf, 'color', 256),
                                    "raw_text": sub_cleaned,
                                    "bounding_box": b_bbox,
                                    "geometry_data": {
                                        "insert": sub_ins,
                                        "height": sub_h,
                                        "rotation": getattr(sub_e.dxf, 'rotation', 0.0) + rot
                                    }
                                })
                        elif sub_t in ['LWPOLYLINE', 'POLYLINE']:
                            sub_pts = list(sub_e.points()) if sub_t == 'POLYLINE' else [(p[0], p[1]) for p in sub_e.get_points()]
                            shifted_pts = [transform_point(p, ins, rot, sx, sy) for p in sub_pts]
                            if shifted_pts:
                                xs = [p[0] for p in shifted_pts]
                                ys = [p[1] for p in shifted_pts]
                                b_bbox = {"min_x": min(xs), "min_y": min(ys), "max_x": max(xs), "max_y": max(ys)}
                                update_bounds(b_bbox)
                                if len(shifted_pts) in (4, 5):
                                    _r = rect_from_points([(pp[0], pp[1]) for pp in shifted_pts], max(max(xs) - min(xs), max(ys) - min(ys), 1e-6) * 0.005)
                                    if _r and paper_ratio_match(_r[2] - _r[0], _r[3] - _r[1]):
                                        known_sheet_rects.append(_r)
                                objects.append({
                                    "handle": getattr(sub_e.dxf, 'handle', f"blk_{len(objects)+1}"),
                                    "entity_type": "LWPOLYLINE",
                                    "layer": getattr(e.dxf, 'layer', '0'),
                                    "color": getattr(e.dxf, 'color', 256),
                                    "raw_text": None,
                                    "bounding_box": b_bbox,
                                    "geometry_data": {"points": shifted_pts, "is_closed": getattr(sub_e, 'is_closed', False)}
                                })
            
        # 1-3. 프록시(빈) 폼 블록 시트 재구성: 메인 조립도 도곽을 합성 폴리라인 객체로 주입 (frame_detector 연동)
        reconstructed_sheets = []
        if proxy_inserts:
            exclusion = []
            for r in known_sheet_rects:
                pad = max(r[2] - r[0], r[3] - r[1]) * 0.01
                exclusion.append((r[0] - pad, r[1] - pad, r[2] + pad, r[3] + pad))
            for r in msp_rects:
                # 단품 시트 1개 이상을 통째로 감싸는 사각형(그룹핑 박스)
                if any(r[0] <= s[0] and r[1] <= s[1] and r[2] >= s[2] and r[3] >= s[3] and (r[2]-r[0])*(r[3]-r[1]) >= 1.5*(s[2]-s[0])*(s[3]-s[1]) for s in known_sheet_rects):
                    pad = max(r[2] - r[0], r[3] - r[1]) * 0.01
                    exclusion.append((r[0] - pad, r[1] - pad, r[2] + pad, r[3] + pad))

            def _excluded(px, py):
                return any(r[0] <= px <= r[2] and r[1] <= py <= r[3] for r in exclusion)

            def _contains_sheet(b):
                return any(b[0] <= s[0] and b[1] <= s[1] and b[2] >= s[2] and b[3] >= s[3] for s in known_sheet_rects)

            def _nearest(px, py):
                return min(range(len(proxy_inserts)), key=lambda i: (proxy_inserts[i]['insert'][0]-px)**2 + (proxy_inserts[i]['insert'][1]-py)**2)

            clusters = [None] * len(proxy_inserts)
            cluster_texts = [[] for _ in proxy_inserts]
            for b in msp_boxes:
                cx, cy = (b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0
                if _excluded(cx, cy) or _contains_sheet(b):
                    continue
                i = _nearest(cx, cy)
                c = clusters[i]
                clusters[i] = b if c is None else (min(c[0], b[0]), min(c[1], b[1]), max(c[2], b[2]), max(c[3], b[3]))
            for o in objects:
                if o.get("raw_text") and o.get("geometry_data", {}).get("insert"):
                    ix, iy = o["geometry_data"]["insert"]
                    if _excluded(ix, iy):
                        continue
                    i = _nearest(ix, iy)
                    cluster_texts[i].append({'t': o["raw_text"], 'x': ix, 'y': iy, 'h': o["geometry_data"].get("height") or 10.0})

            for i, ps in enumerate(proxy_inserts):
                cl = clusters[i]
                if cl is None and cluster_texts[i]:
                    xs = [tx['x'] for tx in cluster_texts[i]]; ys = [tx['y'] for tx in cluster_texts[i]]
                    cl = (min(xs), min(ys), max(xs), max(ys))
                if cl is None:
                    continue
                sheet = reconstruct_proxy_sheet(ps['insert'], cl, cluster_texts[i], ps['scale'])
                if not sheet:
                    continue
                bx0, by0, bx1, by1 = sheet['border']
                syn_bbox = {"min_x": bx0, "min_y": by0, "max_x": bx1, "max_y": by1}
                update_bounds({"min_x": sheet['outer'][0], "min_y": sheet['outer'][1], "max_x": sheet['outer'][2], "max_y": sheet['outer'][3]})
                objects.append({
                    "handle": f"SYN_FRAME_{i+1}",
                    "entity_type": "LWPOLYLINE",
                    "layer": "SYNTHETIC_FRAME",
                    "color": 2,
                    "raw_text": None,
                    "bounding_box": syn_bbox,
                    "geometry_data": {
                        "points": [[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]],
                        "is_closed": True,
                        "synthetic": True,
                        "source_block": ps['name'],
                        "paper": sheet['paper'],
                        "scale": sheet['scale']
                    }
                })
                counts["LWPOLYLINE"] = counts.get("LWPOLYLINE", 0) + 1
                reconstructed_sheets.append({"block": ps['name'], "paper": sheet['paper'], "scale": sheet['scale'], "border": [bx0, by0, bx1, by1]})

        if global_min_x == float('inf'):
            global_min_x, global_min_y, global_max_x, global_max_y = 0.0, 0.0, 1000.0, 700.0
            
        return {
            "proxy_sheets": reconstructed_sheets,
            "status": "SUCCESS",
            "dxf_version": doc.dxfversion,
            "total_entities": len(objects),
            "entity_counts": counts,
            "layers": layers,
            "blocks": blocks,
            "global_bounds": {
                "min_x": global_min_x, "min_y": global_min_y,
                "max_x": global_max_x, "max_y": global_max_y,
                "width": global_max_x - global_min_x,
                "height": global_max_y - global_min_y
            },
            "objects": objects,
            "duration_ms": int((time.time() - start_time) * 1000)
        }
    except Exception as ex:
        return {
            "status": "ERROR",
            "error_code": "DXF_PARSE_FAILED",
            "message": str(ex),
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
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: dxf_parser.py <dxf_file>"}))
        sys.exit(1)
    res = parse_dxf_file(sys.argv[1])
    clean_res = sanitize_unicode(res)
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    print(json.dumps(clean_res, ensure_ascii=False))
