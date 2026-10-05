#!/usr/bin/env python3
"""
CADON-BOM - Sheet-Level Spatial Chunking Engine
Splits monolithic CAD WebGL binaries (e.g. 600,000 lines, 30MB) into lightweight
per-sheet binary chunks (~5,000 lines, ~200-300KB) based on detected frame bounding boxes.
Inspired by Autodesk Forge SVF2 Selective Sheet Loading Architecture.
"""
import os
import sys
import struct
import json
import time
import shutil
import sqlite3
import numpy as np

def chunk_case_drawings(case_id: str, derived_dir: str = None) -> dict:
    start_time = time.time()
    
    if not derived_dir:
        derived_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'storage', 'derived'))
    
    bin_path = os.path.join(derived_dir, f'{case_id}__cad_webgl.bin')
    txt_path = os.path.join(derived_dir, f'{case_id}__cad_texts.json')
    
    if not os.path.exists(bin_path):
        # Check alternative naming
        matching = [f for f in os.listdir(derived_dir) if f.startswith(case_id) and f.endswith('__cad_webgl.bin') and '__sheet_' not in f]
        if matching:
            bin_path = os.path.join(derived_dir, matching[0])
        else:
            return {"status": "ERROR", "error": f"Monolithic binary not found for case {case_id}"}
            
    # Connect to SQLite to find sheet bounding boxes
    appdata = os.environ.get('APPDATA') or os.path.expanduser('~\\AppData\\Roaming')
    proj_id = os.environ.get('NEXT_PUBLIC_EGDESK_PROJECT_ID', '8dd35536-8cbb-4e1c-bb65-b35f2920cb03')
    env_name = os.environ.get('NEXT_PUBLIC_EGDESK_ENV', 'development')
    db_candidates = [
        os.path.join(appdata, 'egdesk', 'user-data', env_name, 'projects', proj_id, 'user_data.db'),
        os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'user_data.db'))
    ]
    
    db_path = None
    for cand in db_candidates:
        if os.path.exists(cand):
            db_path = cand
            break
            
    if not db_path:
        return {"status": "ERROR", "error": "Database user_data.db not found"}
        
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    rows = cur.execute(
        'SELECT drawing_index, drawing_no_raw, frame_bbox_json FROM drawings WHERE quotation_case_id = ? ORDER BY drawing_index ASC',
        (case_id,)
    ).fetchall()
    
    if not rows:
        return {"status": "SKIPPED", "message": f"No sheets found for case {case_id}"}
        
    # Read monolithic binary
    with open(bin_path, 'rb') as f:
        magic = f.read(4)
        if magic != b'CADW':
            return {"status": "ERROR", "error": f"Invalid magic header: {magic}"}
        version, num_lines, num_tris, num_heavy, min_x, min_y, max_x, max_y = struct.unpack('<IIIIffff', f.read(32))
        pos = np.frombuffer(f.read(num_lines * 6 * 4), dtype=np.float32).reshape(-1, 6)
        col = np.frombuffer(f.read(num_lines * 6 * 4), dtype=np.float32).reshape(-1, 6)
        tri_pos = np.frombuffer(f.read(num_tris * 9 * 4), dtype=np.float32).reshape(-1, 9) if num_tris > 0 else np.empty((0, 9), dtype=np.float32)
        tri_col = np.frombuffer(f.read(num_tris * 9 * 4), dtype=np.float32).reshape(-1, 9) if num_tris > 0 else np.empty((0, 9), dtype=np.float32)
        heavy_pos = np.frombuffer(f.read(num_heavy * 6 * 4), dtype=np.float32).reshape(-1, 6) if num_heavy > 0 else np.empty((0, 6), dtype=np.float32)
        heavy_col = np.frombuffer(f.read(num_heavy * 6 * 4), dtype=np.float32).reshape(-1, 6) if num_heavy > 0 else np.empty((0, 6), dtype=np.float32)
        heavy_lw = np.frombuffer(f.read(num_heavy * 4), dtype=np.float32) if num_heavy > 0 else np.empty((0,), dtype=np.float32)

    # Texts
    texts = []
    if os.path.exists(txt_path):
        try:
            with open(txt_path, 'r', encoding='utf-8') as f:
                texts = json.load(f).get('texts', [])
        except Exception:
            pass

    line_mid_x = (pos[:, 0] + pos[:, 3]) * 0.5
    line_mid_y = (pos[:, 1] + pos[:, 4]) * 0.5
    
    generated_count = 0
    total_chunk_bytes = 0
    
    # Sync targets
    sync_dirs = [derived_dir]
    egdesk_derived = os.path.join(appdata, 'egdesk', 'user-data', env_name, 'projects', proj_id, 'storage', 'derived')
    if os.path.exists(egdesk_derived) and os.path.abspath(egdesk_derived) != os.path.abspath(derived_dir):
        sync_dirs.append(egdesk_derived)
        
    for r in rows:
        idx, dno, bbox_str = r
        if not bbox_str:
            continue
        try:
            bbox = json.loads(bbox_str)
        except Exception:
            continue
            
        bx1, by1, bx2, by2 = bbox.get('min_x', 0), bbox.get('min_y', 0), bbox.get('max_x', 0), bbox.get('max_y', 0)
        pad = 20.0
        
        # Mask lines
        l_mask = (line_mid_x >= bx1 - pad) & (line_mid_x <= bx2 + pad) & (line_mid_y >= by1 - pad) & (line_mid_y <= by2 + pad)
        s_pos = pos[l_mask]
        s_col = col[l_mask]
        s_num_lines = len(s_pos)
        
        # Mask texts
        s_texts = [t for t in texts if bx1 - pad <= t.get('x', 0) <= bx2 + pad and by1 - pad <= t.get('y', 0) <= by2 + pad]
        
        # Triangles
        s_tri_pos = np.empty((0, 9), dtype=np.float32)
        s_tri_col = np.empty((0, 9), dtype=np.float32)
        if len(tri_pos) > 0:
            tri_mid_x = (tri_pos[:, 0] + tri_pos[:, 3] + tri_pos[:, 6]) / 3.0
            tri_mid_y = (tri_pos[:, 1] + tri_pos[:, 4] + tri_pos[:, 7]) / 3.0
            t_mask = (tri_mid_x >= bx1 - pad) & (tri_mid_x <= bx2 + pad) & (tri_mid_y >= by1 - pad) & (tri_mid_y <= by2 + pad)
            s_tri_pos = tri_pos[t_mask]
            s_tri_col = tri_col[t_mask]
            
        # Heavy lines
        s_heavy_pos = np.empty((0, 6), dtype=np.float32)
        s_heavy_col = np.empty((0, 6), dtype=np.float32)
        s_heavy_lw = np.empty((0,), dtype=np.float32)
        if len(heavy_pos) > 0:
            h_mid_x = (heavy_pos[:, 0] + heavy_pos[:, 3]) * 0.5
            h_mid_y = (heavy_pos[:, 1] + heavy_pos[:, 4]) * 0.5
            h_mask = (h_mid_x >= bx1 - pad) & (h_mid_x <= bx2 + pad) & (h_mid_y >= by1 - pad) & (h_mid_y <= by2 + pad)
            s_heavy_pos = heavy_pos[h_mask]
            s_heavy_col = heavy_col[h_mask]
            s_heavy_lw = heavy_lw[h_mask]
            
        bin_chunk_bytes = (
            b'CADW' +
            struct.pack('<IIIIffff', 3, s_num_lines, len(s_tri_pos), len(s_heavy_pos), float(bx1), float(by1), float(bx2), float(by2)) +
            s_pos.tobytes() +
            s_col.tobytes() +
            s_tri_pos.tobytes() +
            s_tri_col.tobytes() +
            s_heavy_pos.tobytes() +
            s_heavy_col.tobytes() +
            s_heavy_lw.tobytes()
        )
        
        txt_chunk_json = json.dumps({'texts': s_texts}, ensure_ascii=False)
        
        for d in sync_dirs:
            out_bin = os.path.join(d, f'{case_id}__sheet_{idx}__cad_webgl.bin')
            out_txt = os.path.join(d, f'{case_id}__sheet_{idx}__cad_texts.json')
            with open(out_bin, 'wb') as sf:
                sf.write(bin_chunk_bytes)
            with open(out_txt, 'w', encoding='utf-8') as stf:
                stf.write(txt_chunk_json)
                
        generated_count += 1
        total_chunk_bytes += len(bin_chunk_bytes)
        
    duration_ms = int((time.time() - start_time) * 1000)
    return {
        "status": "SUCCESS",
        "case_id": case_id,
        "sheets_generated": generated_count,
        "total_chunk_bytes": total_chunk_bytes,
        "avg_chunk_kb": round((total_chunk_bytes / generated_count / 1024), 1) if generated_count else 0,
        "duration_ms": duration_ms
    }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: generate_sheet_chunks.py <case_id> [derived_dir]"}))
        sys.exit(1)
        
    cid = sys.argv[1]
    ddir = sys.argv[2] if len(sys.argv) > 2 else None
    result = chunk_case_drawings(cid, ddir)
    print(json.dumps(result, ensure_ascii=False, indent=2))
