#!/usr/bin/env python3
"""
CADON-BOM - High Performance WebGL Binary Exporter
Extracts all CAD entities (lines, polylines, circles, arcs, blocks) into a
compact Float32 binary buffer for ultra-fast 60 FPS GPU rendering in Three.js.
"""
import sys
import os
import math
import struct
import time
import json
import re
import io
import base64
import array
import shutil
import sqlite3
import glob
import ezdxf
import ezdxf.colors

# 공용 도곽/표제란 엔진 (scripts/ 디렉토리 기준 import 보장)
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)
from sheet_frame_engine import (
    ROLE_STYLE, rect_from_points, rects_from_line_segments, rect_segments,
    classify_block_sheet_frames, detect_msp_frames, reconstruct_proxy_sheet, is_empty_block,
    segment_on_rect, rect_tol, transform_rect, cluster_boxes
)

try:
    from ezdxf.proxygraphic import ProxyGraphic
    HAS_PROXY_GRAPHIC = True
except Exception:
    ProxyGraphic = None
    HAS_PROXY_GRAPHIC = False

# CADW 바이너리 포맷 버전 (v3: 선가중치(heavy) 세그먼트 섹션 추가)
CADW_VERSION = 3
# 이 값(mm) 이상의 선가중치는 화면 고정 굵기(heavy) 섹션으로도 출력
HEAVY_LW_THRESHOLD = 0.5

try:
    import ctypes
    from ctypes import wintypes
    from PIL import Image
    HAS_GDI = True
except Exception:
    HAS_GDI = False

try:
    import olefile
    import openpyxl
    HAS_OLE = True
except Exception:
    HAS_OLE = False

def extract_ole_frames_from_dxf(dxf_path):
    results = []
    if not os.path.exists(dxf_path) or not HAS_OLE or not HAS_GDI:
        return results

    raw_frames = []
    try:
        with open(dxf_path, 'r', encoding='utf-8', errors='ignore') as f:
            in_ole = False
            hex_data = []
            while True:
                try:
                    code = next(f).strip()
                    val = next(f).strip()
                except StopIteration:
                    break
                if code == '0':
                    if in_ole:
                        raw_frames.append(''.join(hex_data))
                        in_ole = False
                    if val in ['OLE2FRAME', 'OLEFRAME']:
                        in_ole = True
                        hex_data = []
                elif in_ole and code == '310':
                    hex_data.append(val)
            if in_ole:
                raw_frames.append(''.join(hex_data))
    except Exception as e:
        return results

    for frame_hex in raw_frames:
        idx = frame_hex.find('D0CF11E0')
        if idx == -1:
            continue
        
        prefix_hex = frame_hex[:idx]
        prefix_bytes = bytes.fromhex(prefix_hex)
        pts = []
        for i in range(len(prefix_bytes) - 23):
            try:
                d = struct.unpack('<3d', prefix_bytes[i:i+24])
                if 1000 < d[0] < 500000 and 500 < d[1] < 500000:
                    pts.append((d[0], d[1]))
            except Exception:
                pass

        if len(pts) < 4:
            continue

        min_x = min(pts[0][0], pts[1][0], pts[2][0], pts[3][0])
        max_x = max(pts[0][0], pts[1][0], pts[2][0], pts[3][0])
        min_y = min(pts[0][1], pts[1][1], pts[2][1], pts[3][1])
        max_y = max(pts[0][1], pts[1][1], pts[2][1], pts[3][1])

        width = max_x - min_x
        height = max_y - min_y
        center_x = (min_x + max_x) / 2.0
        center_y = (min_y + max_y) / 2.0

        ole_data = bytes.fromhex(frame_hex[idx:])
        table_lines = []
        cell_texts = []
        has_excel_vector = False

        # Extract Excel vectors (lines) and formatted texts from embedded workbook
        try:
            ole = olefile.OleFileIO(io.BytesIO(ole_data))
            if ole.exists(['Package']):
                pkg_data = ole.openstream(['Package']).read()
                wb = openpyxl.load_workbook(io.BytesIO(pkg_data), data_only=True)
                ws = wb.active
                max_r = ws.max_row or 1
                max_c = min(ws.max_column or 7, 7)

                col_keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G'][:max_c]
                col_widths = [ws.column_dimensions[k].width or 10.0 for k in col_keys]
                sum_w = sum(col_widths) or 1.0
                col_rel_w = [w / sum_w for w in col_widths]
                col_xs = [min_x]
                for w in col_rel_w:
                    col_xs.append(col_xs[-1] + w * width)

                row_heights = [ws.row_dimensions[r].height or 15.95 for r in range(1, max_r + 1)]
                sum_h = sum(row_heights) or 1.0
                row_rel_h = [h / sum_h for h in row_heights]
                row_ys = [max_y]
                for h in row_rel_h:
                    row_ys.append(row_ys[-1] - h * height)

                # Parse merged ranges
                merged_lookup = {}
                for rng in ws.merged_cells.ranges:
                    merged_lookup[(rng.min_row, rng.min_col)] = (rng.max_row, min(rng.max_col, max_c))

                # Identify table blocks separated by empty rows
                table_ranges = []
                t_start = 1
                for r in range(1, max_r + 1):
                    row_has_val = any(ws.cell(r, c).value is not None and str(ws.cell(r, c).value).strip() for c in range(1, max_c + 1))
                    if not row_has_val:
                        if r > t_start:
                            table_ranges.append((t_start, r - 1))
                        t_start = r + 1
                if t_start <= max_r:
                    table_ranges.append((t_start, max_r))
                row_table_start = {}
                for (tr_s, tr_e) in table_ranges:
                    for rr in range(tr_s, tr_e + 1):
                        row_table_start[rr] = tr_s

                YELLOW = (1.0, 1.0, 0.0)
                GREY = (0.55, 0.55, 0.55)

                for (tr_start, tr_end) in table_ranges:
                    top_y = row_ys[tr_start - 1]
                    bot_y = row_ys[tr_end]
                    # Table outer yellow border
                    table_lines.append(((min_x, top_y), (max_x, top_y), YELLOW))
                    table_lines.append(((max_x, top_y), (max_x, bot_y), YELLOW))
                    table_lines.append(((max_x, bot_y), (min_x, bot_y), YELLOW))
                    table_lines.append(((min_x, bot_y), (min_x, top_y), YELLOW))

                    # Header lines (under title row and under column header row)
                    if tr_start <= max_r:
                        table_lines.append(((min_x, row_ys[tr_start]), (max_x, row_ys[tr_start]), YELLOW))
                    if tr_start + 1 <= max_r and tr_start + 1 <= tr_end:
                        table_lines.append(((min_x, row_ys[tr_start + 1]), (max_x, row_ys[tr_start + 1]), YELLOW))

                    # Inner horizontal row dividers
                    for r in range(tr_start + 2, tr_end):
                        table_lines.append(((min_x, row_ys[r]), (max_x, row_ys[r]), GREY))

                    # Vertical column dividers
                    for c_idx in range(1, max_c):
                        table_lines.append(((col_xs[c_idx], row_ys[tr_start + 1]), (col_xs[c_idx], bot_y), GREY))

                # Extract cell texts with CAD precision
                for r in range(1, max_r + 1):
                    for c in range(1, max_c + 1):
                        is_sub_merged = False
                        for rng in ws.merged_cells.ranges:
                            if rng.min_row <= r <= rng.max_row and rng.min_col <= c <= rng.max_col:
                                if (r, c) != (rng.min_row, rng.min_col):
                                    is_sub_merged = True
                                    break
                        if is_sub_merged:
                            continue
                        val = ws.cell(r, c).value
                        if val is not None and str(val).strip():
                            t_str = str(val).strip()
                            max_r_idx, max_c_idx = merged_lookup.get((r, c), (r, c))
                            c_left = col_xs[c - 1]
                            c_right = col_xs[max_c_idx]
                            r_top = row_ys[r - 1]
                            r_bottom = row_ys[max_r_idx]

                            cx = (c_left + c_right) / 2.0
                            cy = (r_top + r_bottom) / 2.0
                            cell_h = r_top - r_bottom
                            single_row_h = row_ys[r - 1] - row_ys[r] if r < len(row_ys) else cell_h

                            ha = 1 # Center by default
                            t_start = row_table_start.get(r, 1)
                            if r == t_start: # 각 테이블의 제목행
                                txt_col = '#ffff00'
                                font_h = min(cell_h * 0.45, 520.0)
                            elif r == t_start + 1: # 각 테이블의 컬럼 헤더행
                                txt_col = '#00e676'
                                font_h = min(single_row_h * 0.42, 240.0)
                            elif c == 5: # Motor model description
                                ha = 0 # Left align
                                cx = c_left + 150.0
                                txt_col = '#ffffff'
                                font_h = min(single_row_h * 0.42, 230.0)
                            elif 'CONVEYOR' in t_str or 'DIVERTER' in t_str or 'ROLLER' in t_str:
                                txt_col = '#38bdf8'
                                font_h = min(single_row_h * 0.42, 240.0)
                            else:
                                txt_col = '#ffffff'
                                font_h = min(single_row_h * 0.42, 240.0)

                            cell_texts.append({
                                't': t_str,
                                'x': round(cx, 1),
                                'y': round(cy, 1),
                                'h': round(font_h, 1),
                                'r': 0.0,
                                'c': txt_col,
                                'ha': ha,
                                'va': 2
                            })
                has_excel_vector = True
        except Exception:
            pass

        # If Excel vectorization succeeded, we DO NOT generate heavy/blurry raster PNGs!
        png_b64 = None
        if not has_excel_vector:
            # Fallback to EMF render if Excel is missing
            try:
                ole = olefile.OleFileIO(io.BytesIO(ole_data))
                if ole.exists(['\x02OlePres000']):
                    stream_data = ole.openstream(['\x02OlePres000']).read()
                    emf_idx = stream_data.find(b' EMF')
                    if emf_idx != -1:
                        emf_bytes = stream_data[emf_idx - 40:]
                        gdiplus = ctypes.windll.gdiplus
                        class GdiplusStartupInput(ctypes.Structure):
                            _fields_ = [('GdiplusVersion', wintypes.UINT),
                                        ('DebugEventCallback', ctypes.c_void_p),
                                        ('SuppressBackgroundThread', wintypes.BOOL),
                                        ('SuppressExternalCodecs', wintypes.BOOL)]
                        token = ctypes.c_ulong()
                        s_input = GdiplusStartupInput(1, None, False, False)
                        gdiplus.GplusStartup(ctypes.byref(token), ctypes.byref(s_input), None)
                        
                        metafile = ctypes.c_void_p()
                        temp_emf = os.path.abspath(os.path.join('storage', 'temp', f'_tmp_emf_{os.getpid()}_{int(time.time()*1000)}.emf'))
                        os.makedirs(os.path.dirname(temp_emf), exist_ok=True)
                        with open(temp_emf, 'wb') as ef:
                            ef.write(emf_bytes)
                        gdiplus.GdipCreateMetafileFromFile(ctypes.c_wchar_p(temp_emf), ctypes.byref(metafile))
                        
                        w_px = 1600
                        h_px = int(w_px * (height / width)) if width > 0 else 2000
                        bitmap = ctypes.c_void_p()
                        gdiplus.GdipCreateBitmapFromScan0(w_px, h_px, 0, 0x26200A, None, ctypes.byref(bitmap))
                        graphics = ctypes.c_void_p()
                        gdiplus.GdipGetImageGraphicsContext(bitmap, ctypes.byref(graphics))
                        gdiplus.GdipGraphicsClear(graphics, 0xFFFFFFFF)
                        gdiplus.GdipDrawImageRectI(graphics, metafile, 0, 0, w_px, h_px)
                        
                        class BitmapData(ctypes.Structure):
                            _fields_ = [('Width', wintypes.UINT), ('Height', wintypes.UINT),
                                        ('Stride', ctypes.c_int), ('PixelFormat', ctypes.c_int),
                                        ('Scan0', ctypes.c_void_p), ('Reserved', ctypes.c_void_p)]
                        class Rect(ctypes.Structure):
                            _fields_ = [('X', ctypes.c_int), ('Y', ctypes.c_int), ('Width', ctypes.c_int), ('Height', ctypes.c_int)]
                        rect = Rect(0, 0, w_px, h_px)
                        bm_data = BitmapData()
                        gdiplus.GdipBitmapLockBits(bitmap, ctypes.byref(rect), 1, 0x26200A, ctypes.byref(bm_data))
                        raw_pixels = ctypes.string_at(bm_data.Scan0, abs(bm_data.Stride) * h_px)
                        gdiplus.GdipBitmapUnlockBits(bitmap, ctypes.byref(bm_data))
                        img = Image.frombuffer('RGBA', (w_px, h_px), raw_pixels, 'raw', 'BGRA', bm_data.Stride, 1)
                        out_buffer = io.BytesIO()
                        img.save(out_buffer, format='PNG', optimize=True)
                        png_b64 = base64.b64encode(out_buffer.getvalue()).decode('ascii')
                        gdiplus.GdipDeleteGraphics(graphics)
                        gdiplus.GdipDisposeImage(bitmap)
                        gdiplus.GdipDisposeImage(metafile)
                        gdiplus.GdiplusShutdown(token)
                        if os.path.exists(temp_emf):
                            os.remove(temp_emf)
            except Exception:
                pass

        results.append({
            'min_x': min_x, 'max_x': max_x,
            'min_y': min_y, 'max_y': max_y,
            'width': width, 'height': height,
            'center_x': center_x, 'center_y': center_y,
            'png_b64': png_b64,
            'lines': table_lines,
            'texts': cell_texts
        })

    return results

def get_rgb(col):
    try:
        # ACI standard primary colors with optimal CAD dark canvas vibrancy
        ACI_PALETTE = {
            1: (1.0, 0.2, 0.2),      # Red: Vivid CAD Red (never turn white!)
            2: (1.0, 1.0, 0.0),      # Yellow
            3: (0.0, 1.0, 0.0),      # Green
            4: (0.0, 1.0, 1.0),      # Cyan
            5: (0.25, 0.65, 1.0),    # Blue: Enhanced bright blue on dark canvas
            6: (1.0, 0.2, 1.0),      # Magenta
            7: (0.95, 0.95, 0.95),   # White on dark canvas
            8: (0.55, 0.55, 0.55),   # Dark Grey
            9: (0.78, 0.78, 0.78),   # Light Grey
        }
        if col in ACI_PALETTE:
            return ACI_PALETTE[col]

        r, g, b = ezdxf.colors.aci2rgb(col)
        # Only brighten if it's virtually pitch black on dark canvas
        if max(r, g, b) < 45:
            return (0.92, 0.95, 0.98)
        # If blue component is dominant and dark, boost brightness for dark canvas contrast
        if b > 160 and r < 80 and g < 120:
            return (0.25, 0.65, 1.0)
        return (r/255.0, g/255.0, b/255.0)
    except Exception:
        return (0.88, 0.92, 0.96)

def transform_pt(p, ins, cos_r, sin_r, sx, sy):
    x, y = p[0] * sx, p[1] * sy
    return (ins[0] + x * cos_r - y * sin_r, ins[1] + x * sin_r + y * cos_r)

def export_dxf_to_webgl_binary(dxf_path: str, output_bin_path: str) -> dict:
    start_time = time.time()
    
    if not os.path.exists(dxf_path):
        return {"status": "ERROR", "error": f"DXF not found: {dxf_path}"}
        
    try:
        try:
            with open(dxf_path, "r", encoding="utf-8", errors="surrogateescape") as _f:
                doc = ezdxf.read(_f)
        except Exception:
            try:
                doc = ezdxf.readfile(dxf_path, encoding='utf-8', errors='surrogateescape')
            except Exception:
                doc = ezdxf.readfile(dxf_path)

        # Determine which layout to extract from
        active_lay = doc.layouts.active_layout()
        model_lay = doc.modelspace()
        
        # Heuristic: If the active layout (Paper Space) contains a significant amount of geometry 
        # (e.g. exported from Inventor/SolidWorks), we should use it because it contains the balloons, 
        # BOM table, and dimensions. Otherwise, fallback to Model Space.
        def count_geom(lay):
            return sum(1 for e in lay if e.dxftype() in ['LINE', 'ARC', 'CIRCLE', 'POLYLINE', 'LWPOLYLINE', 'ELLIPSE'])
            
        if active_lay.name != 'Model' and count_geom(active_lay) > count_geom(model_lay) * 0.5:
            msp = active_lay
        else:
            msp = model_lay
        
        # Pre-cache layer colors (BYLAYER resolution)
        layer_colors = {}
        for lay in doc.layers:
            l_col = getattr(lay.dxf, 'color', 7)
            l_rgb = get_rgb(l_col)
            layer_colors[lay.dxf.name] = (l_rgb, f"#{int(l_rgb[0]*255):02x}{int(l_rgb[1]*255):02x}{int(l_rgb[2]*255):02x}")
        
        def clean_txt(t):
            if not t: return ''
            try:
                t = t.encode('utf-8', 'surrogateescape').decode('utf-8', 'replace')
            except Exception:
                pass
            # Paragraph formatting codes like \pxqc; \pxql; \pxi...;
            t = re.sub(r'\\p[^;]*;', '', t, flags=re.I)
            # Paragraph breaks \P -> preserve newline \n
            t = re.sub(r'\\+P', '\n', t)
            # Stacking fractions
            t = re.sub(r'\\S([^;^]*)\^([^;]*);', r'\1/\2', t)
            # MTEXT formatting codes like \F...;, \C...;, \H...;, \T...;, etc.
            t = re.sub(r'\\[a-zA-Z][^;]*;', '', t)
            # Inline formatting escapes
            t = re.sub(r'\\[~\\{}]', '', t)
            # Grouping braces
            t = re.sub(r'[{}]', '', t)
            # CAD special symbols
            t = re.sub(r'%%c', 'Ø', t, flags=re.I)
            t = re.sub(r'%%d', '°', t, flags=re.I)
            t = re.sub(r'%%p', '±', t, flags=re.I)
            # Normalize mathematical / fullwidth tildes to standard tilde
            t = t.replace('∼', '~').replace('〜', '~').replace('～', '~')
            # Clean per line while preserving \n
            lines = [re.sub(r'[ \t]+', ' ', l).strip() for l in t.split('\n')]
            return '\n'.join([l for l in lines if l]).strip()

        DIM_GREEN_RGB = (0.0, 0.9, 0.46)
        DIM_GREEN_HEX = '#00e676'

        def extract_dim_geom_and_text(dim_e):
            # Text
            meas = getattr(dim_e.dxf, 'actual_measurement', None)
            raw_txt = getattr(dim_e.dxf, 'text', '')
            dim_str = ''
            if raw_txt:
                if '<>' in raw_txt:
                    meas_str = f"{meas:.1f}".rstrip('0').rstrip('.') if (meas is not None and not math.isnan(meas)) else ''
                    dim_str = raw_txt.replace('<>', meas_str)
                else:
                    dim_str = raw_txt
            elif meas is not None and not math.isnan(meas):
                dim_str = f"{meas:.1f}".rstrip('0').rstrip('.')
            
            cln_dim = clean_txt(dim_str)
            mid = getattr(dim_e.dxf, 'text_midpoint', None)
            dp = getattr(dim_e.dxf, 'defpoint', None)
            t_pt = mid if (mid is not None and (abs(mid.x) > 0.001 or abs(mid.y) > 0.001)) else dp
            ang = getattr(dim_e.dxf, 'angle', 0.0) or 0.0
            
            # Get dimension text height from style if possible
            ds_name = getattr(dim_e.dxf, 'dimstyle', None)
            dimtxt = 18.0
            if ds_name and ds_name in doc.dimstyles:
                ds = doc.dimstyles.get(ds_name)
                dimtxt = getattr(ds.dxf, 'dimtxt', 18.0) * getattr(ds.dxf, 'dimscale', 1.0)

            dim_text = None
            if cln_dim and t_pt is not None:
                dim_text = {
                    't': cln_dim,
                    'x': t_pt.x,
                    'y': t_pt.y,
                    'h': dimtxt,
                    'r': ang % 360,
                    'ha': 1,
                    'va': 2,
                    'c': DIM_GREEN_HEX
                }
                
            # Geometry
            lines = []
            dimtype = getattr(dim_e.dxf, 'dimtype', 0) & 7
            dp2 = getattr(dim_e.dxf, 'defpoint2', None)
            dp3 = getattr(dim_e.dxf, 'defpoint3', None)
            dp4 = getattr(dim_e.dxf, 'defpoint4', None)
            
            if dimtype in [2, 5]: # Angular dimension
                # Approximate arc with defpoint (arc center) or defpoint4
                center = dp4 or dp
                p_start = dp2 or dp
                p_end = dp3 or mid
                if center and p_start and p_end:
                    r = math.hypot(p_start.x - center.x, p_start.y - center.y)
                    a1 = math.atan2(p_start.y - center.y, p_start.x - center.x)
                    a2 = math.atan2(p_end.y - center.y, p_end.x - center.x)
                    if a2 < a1: a2 += 2 * math.pi
                    steps = max(6, int(abs(a2 - a1) / (math.pi / 16)))
                    arc_pts = [(center.x + r * math.cos(a1 + (a2-a1)*i/steps), center.y + r * math.sin(a1 + (a2-a1)*i/steps)) for i in range(steps+1)]
                    for i in range(steps):
                        lines.append((arc_pts[i], arc_pts[i+1]))
            elif dimtype in [3, 4]: # Radial or Diametric dimension
                if dp and dp4:
                    lines.append(((dp.x, dp.y), (dp4.x, dp4.y)))
                elif dp and dp2:
                    lines.append(((dp.x, dp.y), (dp2.x, dp2.y)))
            else: # Linear or Rotated dimension
                rad = math.radians(ang)
                if dp and dp2 and dp3:
                    ux, uy = math.cos(rad), math.sin(rad)
                    d2x, d2y = dp2.x - dp.x, dp2.y - dp.y
                    proj2 = d2x * ux + d2y * uy
                    p1 = (dp.x + proj2 * ux, dp.y + proj2 * uy)
                    
                    d3x, d3y = dp3.x - dp.x, dp3.y - dp.y
                    proj3 = d3x * ux + d3y * uy
                    p2 = (dp.x + proj3 * ux, dp.y + proj3 * uy)
                    
                    lines.append(((dp2.x, dp2.y), p1))
                    lines.append(((dp3.x, dp3.y), p2))
                    lines.append((p1, p2))
            return lines, dim_text, DIM_GREEN_RGB

        def extract_mleader_geom_and_text(ml_e):
            lines = []
            tris = []
            ml_text = None
            try:
                ctx = getattr(ml_e, 'context', None)
                if ctx:
                    mtext_ctx = getattr(ctx, 'mtext', None)
                    raw_txt = getattr(mtext_ctx, 'default_content', '') if mtext_ctx else ''
                    cln = clean_txt(raw_txt)

                    arrow_size = getattr(ml_e.dxf, 'arrow_head_size', 20.0) or 20.0
                    th = max(arrow_size * 0.9, 18.0)
                    txt_col = '#00e676' if ('C3;' in raw_txt or cln == 'BRAKE' or 'HOLES' in cln) else '#ffff00'
                    align_type = getattr(ml_e.dxf, 'text_alignment_type', 2)
                    
                    leaders = getattr(ctx, 'leaders', []) or []
                    for ldr in leaders:
                        llp = getattr(ldr, 'last_leader_point', None)
                        ldr_lines = getattr(ldr, 'lines', []) or []
                        for l in ldr_lines:
                            verts = getattr(l, 'vertices', []) or []
                            for i in range(len(verts) - 1):
                                lines.append(((verts[i].x, verts[i].y), (verts[i+1].x, verts[i+1].y)))
                            
                            # Diagonal leader segment connecting to last_leader_point
                            if verts and llp:
                                last_v = verts[-1]
                                if math.hypot(last_v.x - llp.x, last_v.y - llp.y) > 0.1:
                                    lines.append(((last_v.x, last_v.y), (llp.x, llp.y)))
                                    
                                # Solid Arrowhead at verts[0] pointing along arrow->llp
                                first_v = verts[0]
                                nxt_v = verts[1] if len(verts) > 1 else llp
                                dx = nxt_v.x - first_v.x
                                dy = nxt_v.y - first_v.y
                                dist = math.hypot(dx, dy)
                                if dist > 0.1:
                                    ux, uy = dx / dist, dy / dist
                                    a_len = min(arrow_size * 0.8, 16.0)
                                    a_w = a_len * 0.25
                                    bx = first_v.x + ux * a_len
                                    by = first_v.y + uy * a_len
                                    w1 = (bx - uy * a_w, by + ux * a_w)
                                    w2 = (bx + uy * a_w, by - ux * a_w)
                                    tip = (first_v.x, first_v.y)
                                    tris.append((tip, w1, w2))

                        # Horizontal dogleg landing line and docking
                        if llp:
                            landing_len = 30.0
                            if align_type == 2: # Text on left
                                landing_end = (llp.x - landing_len, llp.y)
                                lines.append(((llp.x, llp.y), landing_end))
                                txt_pos = (landing_end[0] - 8.0, llp.y)
                                ha = 2 # Right align
                            else: # Text on right
                                landing_end = (llp.x + landing_len, llp.y)
                                lines.append(((llp.x, llp.y), landing_end))
                                txt_pos = (landing_end[0] + 8.0, llp.y)
                                ha = 0 # Left align
                                
                            if cln:
                                ml_text = {
                                    't': cln,
                                    'x': round(txt_pos[0], 1),
                                    'y': round(txt_pos[1], 1),
                                    'h': round(th, 1),
                                    'r': 0.0,
                                    'ha': ha,
                                    'va': 2,
                                    'c': txt_col
                                }
            except Exception:
                pass
            return lines, tris, ml_text

        # 1. Pre-process blocks into local line segments and texts
        # 세그먼트 튜플: (p1, p2, rgb, col, layer, lineweight_mm)
        block_cache = {}
        block_tris = {}
        block_texts = {}
        block_sheet_frames = {}    # bname -> {'BORDER': rect, 'MARGIN': rect|None, 'paper': str}
        block_proxy_failures = {}  # bname -> 디코딩 실패한 프록시/미지원 엔티티 수

        RENDERABLE_TYPES = {
            'LINE', 'LWPOLYLINE', 'POLYLINE', 'SPLINE', 'SOLID', 'TRACE', '3DFACE', 'CIRCLE', 'ARC', 'ELLIPSE',
            'DIMENSION', 'MULTILEADER', 'LEADER', 'HATCH', 'TEXT', 'MTEXT', 'ATTDEF', 'INSERT'
        }
        PASSIVE_TYPES = {'POINT', 'XLINE', 'RAY', 'IMAGE', 'OLE2FRAME', 'OLEFRAME', 'VIEWPORT', 'WIPEOUT', 'ATTRIB', 'SEQEND', 'VERTEX'}

        def proxy_virtual_entities(e):
            """ACAD_PROXY_ENTITY 또는 proxy_graphic(310) 데이터를 가진 엔티티를 기본 엔티티로 전개 (메카클릭 등 프록시 객체 지원)."""
            out = []
            try:
                if e.dxftype() == 'ACAD_PROXY_ENTITY' and hasattr(e, 'virtual_entities'):
                    out = list(e.virtual_entities())
            except Exception:
                out = []
            if not out and HAS_PROXY_GRAPHIC:
                try:
                    pg = getattr(e, 'proxy_graphic', None)
                    if pg:
                        out = list(ProxyGraphic(pg, doc).virtual_entities())
                except Exception:
                    out = []
            return out

        def expand_entities(entities, depth=0):
            """복합 엔티티(치수, 다중선, 테이블, 프록시)를 기본 기하로 재귀 전개. (전개 결과, 실패 수) 반환"""
            expanded = []
            failures = 0
            for e in entities:
                t = e.dxftype()
                if t in ('DIMENSION', 'MLINE', 'ACAD_TABLE', 'MESH', 'POLYFACE', 'POLYMESH'):
                    try:
                        ve = list(e.virtual_entities())
                    except Exception:
                        ve = []
                    if ve and depth < 4:
                        sub, sub_f = expand_entities(ve, depth + 1)
                        expanded.extend(sub)
                        failures += sub_f
                    elif t == 'DIMENSION':
                        expanded.append(e)
                    else:
                        failures += 1
                elif t == 'ACAD_PROXY_ENTITY' or (t not in RENDERABLE_TYPES and t not in PASSIVE_TYPES and getattr(e, 'proxy_graphic', None)):
                    ve = proxy_virtual_entities(e)
                    if ve and depth < 4:
                        sub, sub_f = expand_entities(ve, depth + 1)
                        expanded.extend(sub)
                        failures += sub_f
                    else:
                        failures += 1
                elif t in RENDERABLE_TYPES:
                    expanded.append(e)
                elif t in PASSIVE_TYPES:
                    continue
                else:
                    failures += 1
            return expanded, failures

        def hatch_outline_segments(e):
            """HATCH 경계 경로를 선분으로 변환 (패턴 채움은 외곽선만 표현)."""
            segs = []
            try:
                for path in e.paths:
                    verts = getattr(path, 'vertices', None)
                    if verts:
                        pts = [(v[0], v[1]) for v in verts]
                        for i in range(len(pts) - 1):
                            segs.append((pts[i], pts[i + 1]))
                        if len(pts) > 2:
                            segs.append((pts[-1], pts[0]))
                        continue
                    for edge in getattr(path, 'edges', []) or []:
                        et = getattr(edge, 'type', None)
                        et_name = getattr(et, 'name', str(et)).upper() if et is not None else edge.__class__.__name__.upper()
                        if 'LINE' in et_name:
                            segs.append(((edge.start[0], edge.start[1]), (edge.end[0], edge.end[1])))
                        elif 'ARC' in et_name and hasattr(edge, 'center'):
                            cx, cy = edge.center[0], edge.center[1]
                            r = edge.radius
                            sa, ea = math.radians(edge.start_angle), math.radians(edge.end_angle)
                            if ea < sa:
                                ea += 2 * math.pi
                            steps = max(4, int(abs(ea - sa) / (math.pi / 8)))
                            a_pts = [(cx + r * math.cos(sa + (ea - sa) * i / steps), cy + r * math.sin(sa + (ea - sa) * i / steps)) for i in range(steps + 1)]
                            for i in range(steps):
                                segs.append((a_pts[i], a_pts[i + 1]))
            except Exception:
                pass
            return segs

        def face_outline_segments(e):
            """3DFACE 네 정점의 외곽선."""
            try:
                pts = [(e.dxf.vtx0.x, e.dxf.vtx0.y), (e.dxf.vtx1.x, e.dxf.vtx1.y), (e.dxf.vtx2.x, e.dxf.vtx2.y)]
                if hasattr(e.dxf, 'vtx3'):
                    pts.append((e.dxf.vtx3.x, e.dxf.vtx3.y))
                return [(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts))]
            except Exception:
                return []

        def promote_sheet_frames(lines, poly_pts_list, line_segs):
            """
            블록 로컬 세그먼트에서 규격 용지 비율의 사각형(닫힌 폴리라인 또는 LINE 4개 조합)을 찾아
            BORDER(노랑 0.7mm) / MARGIN(빨강 0.5mm)로 승격합니다. (블록 이름·선 개수에 의존하지 않음)
            """
            if not lines:
                return lines, None
            xs = [p[0] for l in lines for p in (l[0], l[1])]
            ys = [p[1] for l in lines for p in (l[0], l[1])]
            extent = (min(xs), min(ys), max(xs), max(ys))
            ew, eh = extent[2] - extent[0], extent[3] - extent[1]
            if ew <= 0 or eh <= 0:
                return lines, None
            tol = max(ew, eh) * 0.002
            poly_rects = []
            for pts in poly_pts_list:
                r = rect_from_points(pts, tol)
                if r:
                    poly_rects.append(r)
            frames = classify_block_sheet_frames(poly_rects, line_segs, extent, tol)
            if not frames:
                return lines, None
            promoted = []
            for (p1, p2, rgb_, col_, lay_, lw_) in lines:
                role = None
                if segment_on_rect(p1, p2, frames['BORDER'], tol):
                    role = 'BORDER'
                elif frames.get('MARGIN') and segment_on_rect(p1, p2, frames['MARGIN'], tol):
                    role = 'MARGIN'
                if role:
                    r_rgb, r_lw = ROLE_STYLE[role]
                    # col=-1: 역할 색 고정 (BYBLOCK/BYLAYER 상속으로 덮어쓰이지 않도록)
                    promoted.append((p1, p2, r_rgb, -1, lay_, r_lw))
                else:
                    promoted.append((p1, p2, rgb_, col_, lay_, lw_))
            return promoted, frames

        def resolve_block(bname):
            if bname in block_cache:
                return block_cache[bname], block_tris.get(bname, []), block_texts.get(bname, [])

            block = doc.blocks.get(bname)
            if not block:
                return [], [], []

            block_cache[bname] = []
            block_tris[bname] = []
            block_texts[bname] = []

            b_lines = []
            b_tris_list = []
            b_txts = []
            poly_pts_list = []   # 닫힌 폴리라인 정점 (도곽 판정용)
            line_segs = []       # LINE 세그먼트 (4개 조합 도곽 판정용)

            expanded_block, failures = expand_entities(list(block))
            block_proxy_failures[bname] = failures

            for e in expanded_block:
                t = e.dxftype()
                col = getattr(e.dxf, 'color', 256)
                lay_name = getattr(e.dxf, 'layer', '0')
                if col == 256:
                    rgb, hex_col = layer_colors.get(lay_name, ((0.85, 0.85, 0.85), '#e2e8f0'))
                else:
                    rgb = get_rgb(col)
                    hex_col = f"#{int(rgb[0]*255):02x}{int(rgb[1]*255):02x}{int(rgb[2]*255):02x}"
                lw = 0.0

                if t in ['LINE', 'LWPOLYLINE', 'POLYLINE', 'SPLINE', 'SOLID', 'TRACE']:
                    if t == 'LINE':
                        p1 = (e.dxf.start.x, e.dxf.start.y)
                        p2 = (e.dxf.end.x, e.dxf.end.y)
                        b_lines.append((p1, p2, rgb, col, lay_name, lw))
                        line_segs.append((p1, p2))
                    elif t in ['LWPOLYLINE', 'POLYLINE']:
                        pts = list(e.points()) if t == 'POLYLINE' else list(e.get_points())
                        pts2 = [(p[0], p[1]) for p in pts]
                        is_closed = (getattr(e, 'closed', False) or getattr(e, 'is_closed', False))
                        for i in range(len(pts2)-1):
                            b_lines.append((pts2[i], pts2[i+1], rgb, col, lay_name, lw))
                        if is_closed and len(pts2) > 2:
                            b_lines.append((pts2[-1], pts2[0], rgb, col, lay_name, lw))
                        if len(pts2) in (4, 5) and (is_closed or (len(pts2) == 5)):
                            poly_pts_list.append(pts2)
                    elif t == 'SPLINE':
                        try:
                            pts = list(e.flattening(distance=0.5))
                            for i in range(len(pts)-1):
                                b_lines.append(((pts[i][0], pts[i][1]), (pts[i+1][0], pts[i+1][1]), rgb, col, lay_name, lw))
                            if e.closed and len(pts) > 2:
                                b_lines.append(((pts[-1][0], pts[-1][1]), (pts[0][0], pts[0][1]), rgb, col, lay_name, lw))
                        except Exception:
                            pass
                    else:  # SOLID / TRACE
                        v0 = (e.dxf.vtx0.x, e.dxf.vtx0.y)
                        v1 = (e.dxf.vtx1.x, e.dxf.vtx1.y)
                        v2 = (e.dxf.vtx2.x, e.dxf.vtx2.y)
                        v3 = (e.dxf.vtx3.x, e.dxf.vtx3.y) if hasattr(e.dxf, 'vtx3') else v2
                        b_tris_list.append((v0, v1, v3, rgb, col, lay_name))
                        b_tris_list.append((v3, v2, v0, rgb, col, lay_name))
                elif t == '3DFACE':
                    for p1, p2 in face_outline_segments(e):
                        b_lines.append((p1, p2, rgb, col, lay_name, lw))
                elif t == 'HATCH':
                    for p1, p2 in hatch_outline_segments(e):
                        b_lines.append((p1, p2, rgb, col, lay_name, lw))
                elif t == 'CIRCLE':
                    cx, cy, r = e.dxf.center.x, e.dxf.center.y, e.dxf.radius
                    steps = 16 if r > 50 else 12
                    c_pts = [(cx + r * math.cos(i*2*math.pi/steps), cy + r * math.sin(i*2*math.pi/steps)) for i in range(steps)]
                    for i in range(steps):
                        b_lines.append((c_pts[i], c_pts[(i+1)%steps], rgb, col, lay_name, lw))
                elif t == 'ARC':
                    cx, cy, r = e.dxf.center.x, e.dxf.center.y, e.dxf.radius
                    sa, ea = math.radians(e.dxf.start_angle), math.radians(e.dxf.end_angle)
                    if ea < sa:
                        ea += 2 * math.pi
                    steps = max(4, int(abs(ea - sa) / (math.pi / 8)))
                    a_pts = [(cx + r * math.cos(sa + (ea-sa)*i/steps), cy + r * math.sin(sa + (ea-sa)*i/steps)) for i in range(steps+1)]
                    for i in range(steps):
                        b_lines.append((a_pts[i], a_pts[i+1], rgb, col, lay_name, lw))
                elif t == 'DIMENSION':
                    d_lines, d_txt, d_rgb = extract_dim_geom_and_text(e)
                    for p1, p2 in d_lines:
                        b_lines.append((p1, p2, d_rgb, col, lay_name, lw))
                    if d_txt:
                        d_txt['raw_col'] = col
                        d_txt['lay_name'] = lay_name
                        b_txts.append(d_txt)
                elif t == 'ELLIPSE':
                    try:
                        pts = list(e.flattening(distance=0.5))
                        for i in range(len(pts)-1):
                            b_lines.append(((pts[i][0], pts[i][1]), (pts[i+1][0], pts[i+1][1]), rgb, col, lay_name, lw))
                    except Exception:
                        pass
                elif t == 'LEADER':
                    try:
                        verts = list(e.vertices)
                        for i in range(len(verts) - 1):
                            b_lines.append(((verts[i].x, verts[i].y), (verts[i+1].x, verts[i+1].y), rgb, col, lay_name, lw))
                    except Exception:
                        pass
                elif t == 'MULTILEADER':
                    ml_lines, ml_tris, ml_txt = extract_mleader_geom_and_text(e)
                    for p1, p2 in ml_lines:
                        b_lines.append((p1, p2, rgb, col, lay_name, lw))
                    for p1, p2, p3 in ml_tris:
                        b_tris_list.append((p1, p2, p3, rgb, col, lay_name))
                    if ml_txt:
                        ml_txt['c'] = hex_col
                        ml_txt['raw_col'] = col
                        ml_txt['lay_name'] = lay_name
                        b_txts.append(ml_txt)
                elif t in ['TEXT', 'MTEXT', 'ATTDEF']:
                    raw = e.dxf.text if t != 'MTEXT' else e.text
                    if raw and raw.strip():
                        cln = clean_txt(raw.strip())
                        if not cln:
                            continue
                        h = getattr(e.dxf, 'char_height', getattr(e.dxf, 'height', 10.0))
                        rot = getattr(e.dxf, 'rotation', 0.0)
                        halign = getattr(e.dxf, 'halign', 0)
                        valign = getattr(e.dxf, 'valign', 0)
                        align_pt = getattr(e.dxf, 'align_point', None)
                        ins_pt = e.dxf.insert
                        target_pt = align_pt if ((halign > 0 or valign > 0) and align_pt is not None and (abs(align_pt.x) > 0.001 or abs(align_pt.y) > 0.001)) else ins_pt

                        ha = 1 if halign in [1, 4] else (2 if halign == 2 else 0)
                        va = 1 if valign == 1 else (2 if valign == 2 else (3 if valign == 3 else 0))
                        if t == 'MTEXT':
                            attach = getattr(e.dxf, 'attachment_point', 1)
                            ha = 0 if attach in [1, 4, 7] else (1 if attach in [2, 5, 8] else 2)
                            va = 3 if attach in [1, 2, 3] else (2 if attach in [4, 5, 6] else 1)

                        width_factor = getattr(e.dxf, 'width', 1.0) if t != 'MTEXT' else 1.0
                        txt_w = getattr(e.dxf, 'width', 0.0) if t == 'MTEXT' else (len(cln) * h * 0.80 * width_factor)

                        b_txts.append({
                            't': cln,
                            'x': target_pt.x,
                            'y': target_pt.y,
                            'h': h,
                            'w': txt_w,
                            'r': rot,
                            'c': hex_col,
                            'raw_col': col,
                            'lay_name': lay_name,
                            'ha': ha,
                            'va': va
                        })
                elif t == 'INSERT':
                    # Nested block support
                    sub_bname = getattr(e.dxf, 'name', None)
                    if sub_bname:
                        sub_lines, sub_tris, sub_txts = resolve_block(sub_bname)
                        ins = (e.dxf.insert.x, e.dxf.insert.y)
                        rot_deg = getattr(e.dxf, 'rotation', 0.0)
                        rot = math.radians(rot_deg)
                        cos_r, sin_r = math.cos(rot), math.sin(rot)
                        sx = getattr(e.dxf, 'xscale', 1.0)
                        sy = getattr(e.dxf, 'yscale', 1.0)

                        # 중첩 시트 블록의 도곽 정보를 상위 블록으로 전파
                        if sub_bname in block_sheet_frames and bname not in block_sheet_frames:
                            sub_fr = block_sheet_frames[sub_bname]
                            tb = transform_rect(sub_fr['BORDER'], ins, sx, sy, rot_deg)
                            if tb:
                                tm = transform_rect(sub_fr['MARGIN'], ins, sx, sy, rot_deg) if sub_fr.get('MARGIN') else None
                                block_sheet_frames[bname] = {'BORDER': tb, 'MARGIN': tm, 'paper': sub_fr.get('paper')}

                        for (p1, p2, blk_rgb, blk_col, blk_lay, blk_lw) in sub_lines:
                            tp1 = transform_pt(p1, ins, cos_r, sin_r, sx, sy)
                            tp2 = transform_pt(p2, ins, cos_r, sin_r, sx, sy)

                            if blk_col == 0: # BYBLOCK
                                final_rgb = rgb
                                final_col = col
                            elif blk_lay == '0' and blk_col == 256: # BYLAYER on Layer 0 inherits parent's layer
                                final_rgb = rgb
                                final_col = col
                            else: # Keep its own resolved color/layer (도곽 승격 색 포함)
                                final_rgb = blk_rgb
                                final_col = blk_col

                            b_lines.append((tp1, tp2, final_rgb, final_col, blk_lay if blk_lay != '0' else lay_name, blk_lw))

                        for (p1, p2, p3, blk_rgb, blk_col, blk_lay) in sub_tris:
                            tp1 = transform_pt(p1, ins, cos_r, sin_r, sx, sy)
                            tp2 = transform_pt(p2, ins, cos_r, sin_r, sx, sy)
                            tp3 = transform_pt(p3, ins, cos_r, sin_r, sx, sy)
                            if blk_col == 0:
                                final_rgb = rgb
                                final_col = col
                            elif blk_lay == '0' and blk_col == 256:
                                final_rgb = rgb
                                final_col = col
                            else:
                                final_rgb = blk_rgb
                                final_col = blk_col
                            b_tris_list.append((tp1, tp2, tp3, final_rgb, final_col, blk_lay if blk_lay != '0' else lay_name))

                        for bt in sub_txts:
                            tp = transform_pt((bt['x'], bt['y']), ins, cos_r, sin_r, sx, sy)
                            total_rot = bt['r'] + math.degrees(rot)

                            b_col = bt.get('raw_col', 256)
                            b_lay = bt.get('lay_name', '0')

                            if b_col == 0:
                                final_hex = hex_col
                                final_raw_col = col
                            elif b_lay == '0' and b_col == 256:
                                final_hex = hex_col
                                final_raw_col = col
                            else:
                                final_hex = bt['c']
                                final_raw_col = b_col

                            b_txts.append({
                                't': bt['t'],
                                'x': tp[0],
                                'y': tp[1],
                                'h': bt['h'] * max(abs(sx), abs(sy)),
                                'w': bt.get('w', 0) * max(abs(sx), abs(sy)),
                                'r': total_rot,
                                'c': final_hex,
                                'raw_col': final_raw_col,
                                'lay_name': b_lay if b_lay != '0' else lay_name,
                                'ha': bt.get('ha', 0),
                                'va': bt.get('va', 0)
                            })

            # 도곽/여백선 승격 (규격 용지 비율 사각형 기반, 블록 이름 무관)
            b_lines, frames = promote_sheet_frames(b_lines, poly_pts_list, line_segs)
            if frames and bname not in block_sheet_frames:
                block_sheet_frames[bname] = frames

            block_cache[bname] = b_lines
            block_tris[bname] = b_tris_list
            block_texts[bname] = b_txts
            return b_lines, b_tris_list, b_txts

        for block in doc.blocks:
            # 레이아웃 블록(*Model_Space/*Paper_Space)은 INSERT되지 않으므로 사전 전개 대상에서 제외
            if block.name and block.name.upper().startswith(('*MODEL_SPACE', '*PAPER_SPACE')):
                continue
            resolve_block(block.name)

        # 2. Extract geometry into flat Float32 arrays & collect all texts
        pos_data = array.array('f') # [x1, y1, z1, x2, y2, z2, ...]
        col_data = array.array('f') # [r1, g1, b1, r2, g2, b2, ...]
        tri_pos_data = array.array('f') # [x1,y1,z1, x2,y2,z2, x3,y3,z3, ...]
        tri_col_data = array.array('f')
        # v3: 선가중치(heavy) 세그먼트 - 뷰어에서 화면 고정 픽셀 굵기로 렌더링
        heavy_pos_data = array.array('f')
        heavy_col_data = array.array('f')
        heavy_lw_data = array.array('f')
        all_texts = []
        all_rasters = []

        min_x, min_y = float('inf'), float('inf')
        max_x, max_y = float('-inf'), float('-inf')

        def add_seg(p1, p2, rgb, lw=0.0):
            nonlocal min_x, min_y, max_x, max_y
            pos_data.extend([p1[0], p1[1], 0.0, p2[0], p2[1], 0.0])
            col_data.extend([rgb[0], rgb[1], rgb[2], rgb[0], rgb[1], rgb[2]])
            min_x = min(min_x, p1[0], p2[0])
            min_y = min(min_y, p1[1], p2[1])
            max_x = max(max_x, p1[0], p2[0])
            max_y = max(max_y, p1[1], p2[1])
            if lw >= HEAVY_LW_THRESHOLD:
                heavy_pos_data.extend([p1[0], p1[1], 0.0, p2[0], p2[1], 0.0])
                heavy_col_data.extend([rgb[0], rgb[1], rgb[2], rgb[0], rgb[1], rgb[2]])
                heavy_lw_data.append(float(lw))

        def add_tri(p1, p2, p3, rgb):
            nonlocal min_x, min_y, max_x, max_y
            tri_pos_data.extend([p1[0], p1[1], 0.0, p2[0], p2[1], 0.0, p3[0], p3[1], 0.0])
            tri_col_data.extend([rgb[0], rgb[1], rgb[2], rgb[0], rgb[1], rgb[2], rgb[0], rgb[1], rgb[2]])
            min_x = min(min_x, p1[0], p2[0], p3[0])
            min_y = min(min_y, p1[1], p2[1], p3[1])
            max_x = max(max_x, p1[0], p2[0], p3[0])
            max_y = max(max_y, p1[1], p2[1], p3[1])

        def add_role_seg(p1, p2, role):
            r_rgb, r_lw = ROLE_STYLE[role]
            add_seg(p1, p2, r_rgb, r_lw)

        referenced_blocks = set()
        for e in msp:
            if e.dxftype() == 'INSERT':
                bname = getattr(e.dxf, 'name', None)
                if bname:
                    referenced_blocks.add(bname)

        expanded_msp, msp_failures = expand_entities(list(msp))

        for block in doc.blocks:
            bname = block.name
            if bname and bname.startswith('*T') and bname not in referenced_blocks:
                sub, _ = expand_entities(list(block))
                expanded_msp.extend(sub)

        def block_renders_nothing(bname):
            return (not block_cache.get(bname)) and (not block_tris.get(bname)) and (not block_texts.get(bname))

        FORM_NAME_PAT = re.compile(r'(DRAWFORM|FORM|SHEET|FRAME|BORDER|TITLE|도곽|양식|^[AB][0-4]$)', re.I)

        # ------------------------------------------------------------------
        # 2-A. 사전 스캔: 모델 공간 사각형 / 텍스트 삽입점 / 시트 블록 INSERT / 프록시(빈) 폼 INSERT
        # ------------------------------------------------------------------
        msp_poly_candidates = []   # 닫힌 4/5점 폴리라인 정점 목록
        msp_line_segs = []
        text_points = []
        sheet_insert_points = []
        known_sheet_rects = []
        proxy_sheet_inserts = []   # {'insert': (x,y), 'scale': s, 'name': bname}
        seg_lengths = []
        for e in expanded_msp:
            t = e.dxftype()
            if t in ('LWPOLYLINE', 'POLYLINE'):
                try:
                    pts = list(e.points()) if t == 'POLYLINE' else list(e.get_points())
                except Exception:
                    continue
                pts2 = [(p[0], p[1]) for p in pts]
                is_closed = (getattr(e, 'closed', False) or getattr(e, 'is_closed', False))
                if len(pts2) in (4, 5) and (is_closed or len(pts2) == 5):
                    msp_poly_candidates.append(pts2)
            elif t == 'LINE':
                p1 = (e.dxf.start.x, e.dxf.start.y)
                p2 = (e.dxf.end.x, e.dxf.end.y)
                msp_line_segs.append((p1, p2))
                seg_lengths.append(math.hypot(p2[0] - p1[0], p2[1] - p1[1]))
            elif t in ('TEXT', 'MTEXT'):
                try:
                    text_points.append((e.dxf.insert.x, e.dxf.insert.y))
                except Exception:
                    pass
            elif t == 'INSERT':
                bname = getattr(e.dxf, 'name', None)
                if not bname:
                    continue
                ins = (e.dxf.insert.x, e.dxf.insert.y)
                sx = getattr(e.dxf, 'xscale', 1.0) or 1.0
                sy = getattr(e.dxf, 'yscale', 1.0) or 1.0
                rot_deg = getattr(e.dxf, 'rotation', 0.0) or 0.0
                if bname in block_sheet_frames:
                    sheet_insert_points.append(ins)
                    tb = transform_rect(block_sheet_frames[bname]['BORDER'], ins, sx, sy, rot_deg)
                    if tb:
                        known_sheet_rects.append(tb)
                elif block_renders_nothing(bname) and not list(getattr(e, 'attribs', []) or []):
                    # 프록시 도곽 후보: 이름이 도곽/양식을 뜻하거나, 디코딩 실패한 프록시 엔티티를 가진 빈 블록
                    if FORM_NAME_PAT.search(bname) or block_proxy_failures.get(bname, 0) > 0:
                        proxy_sheet_inserts.append({'insert': ins, 'scale': abs(sx) if sx else 1.0, 'name': bname})

        msp_rects = []
        for pts2 in msp_poly_candidates:
            xs = [p[0] for p in pts2]
            ys = [p[1] for p in pts2]
            p_tol = max(max(xs) - min(xs), max(ys) - min(ys), 1e-6) * 0.005
            r = rect_from_points(pts2, p_tol)
            if r:
                msp_rects.append(r)
        if msp_line_segs:
            seg_lengths.sort()
            med_len = seg_lengths[len(seg_lengths) // 2] if seg_lengths else 1.0
            line_tol = max(med_len * 0.001, 1e-6)
            msp_rects.extend(rects_from_line_segments(msp_line_segs, line_tol))

        msp_frames = detect_msp_frames(msp_rects, text_points, sheet_insert_points, known_sheet_rects)
        role_rects = []
        for role in ('GROUP_BOX', 'BORDER', 'MARGIN'):
            for r in msp_frames[role]:
                role_rects.append((r, role, rect_tol(r)))

        def role_for_segment(p1, p2):
            for (r, role, tol) in role_rects:
                if segment_on_rect(p1, p2, r, tol):
                    return role
            return None

        def role_for_rect(rect):
            for (r, role, tol) in role_rects:
                if all(abs(rect[i] - r[i]) <= tol for i in range(4)):
                    return role
            return None

        # 프록시 시트 클러스터링을 위한 엔티티 바운딩 박스 추적
        track_boxes = bool(proxy_sheet_inserts)
        msp_entity_boxes = []   # (x0, y0, x1, y1)

        for e in expanded_msp:
            t = e.dxftype()
            col = getattr(e.dxf, 'color', 256)
            lay_name = getattr(e.dxf, 'layer', '0')
            if col == 256:
                rgb, hex_col = layer_colors.get(lay_name, ((0.85, 0.85, 0.85), '#e2e8f0'))
            else:
                rgb = get_rgb(col)
                hex_col = f"#{int(rgb[0]*255):02x}{int(rgb[1]*255):02x}{int(rgb[2]*255):02x}"

            pos_start = len(pos_data)
            tri_start = len(tri_pos_data)
            entity_is_sheet_insert = False

            if t in ['LINE', 'LWPOLYLINE', 'POLYLINE', 'SPLINE', 'SOLID', 'TRACE', 'CIRCLE', 'ARC']:
                if t == 'LINE':
                    p1 = (e.dxf.start.x, e.dxf.start.y)
                    p2 = (e.dxf.end.x, e.dxf.end.y)
                    role = role_for_segment(p1, p2) if role_rects else None
                    if role:
                        add_role_seg(p1, p2, role)
                    else:
                        add_seg(p1, p2, rgb)
                elif t in ['LWPOLYLINE', 'POLYLINE']:
                    pts = list(e.points()) if t == 'POLYLINE' else list(e.get_points())
                    pts2 = [(p[0], p[1]) for p in pts]
                    is_closed = (getattr(e, 'closed', False) or getattr(e, 'is_closed', False))
                    role = None
                    if role_rects and len(pts2) in (4, 5) and (is_closed or len(pts2) == 5):
                        xs = [p[0] for p in pts2]
                        ys = [p[1] for p in pts2]
                        p_tol = max(max(xs) - min(xs), max(ys) - min(ys), 1e-6) * 0.005
                        rr = rect_from_points(pts2, p_tol)
                        if rr:
                            role = role_for_rect(rr)
                    for i in range(len(pts2)-1):
                        if role:
                            add_role_seg(pts2[i], pts2[i+1], role)
                        else:
                            add_seg(pts2[i], pts2[i+1], rgb)
                    if is_closed and len(pts2) > 2:
                        if role:
                            add_role_seg(pts2[-1], pts2[0], role)
                        else:
                            add_seg(pts2[-1], pts2[0], rgb)
                elif t == 'SPLINE':
                    try:
                        pts = list(e.flattening(distance=0.5))
                        for i in range(len(pts)-1):
                            add_seg((pts[i][0], pts[i][1]), (pts[i+1][0], pts[i+1][1]), rgb)
                        if e.closed and len(pts) > 2:
                            add_seg((pts[-1][0], pts[-1][1]), (pts[0][0], pts[0][1]), rgb)
                    except Exception:
                        pass
                elif t in ['SOLID', 'TRACE']:
                    v0 = (e.dxf.vtx0.x, e.dxf.vtx0.y)
                    v1 = (e.dxf.vtx1.x, e.dxf.vtx1.y)
                    v2 = (e.dxf.vtx2.x, e.dxf.vtx2.y)
                    v3 = (e.dxf.vtx3.x, e.dxf.vtx3.y) if hasattr(e.dxf, 'vtx3') else v2
                    add_tri(v0, v1, v3, rgb)
                    add_tri(v3, v2, v0, rgb)
                elif t == 'CIRCLE':
                    cx, cy, r = e.dxf.center.x, e.dxf.center.y, e.dxf.radius
                    steps = 16 if r > 50 else 12
                    c_pts = [(cx + r * math.cos(i*2*math.pi/steps), cy + r * math.sin(i*2*math.pi/steps)) for i in range(steps)]
                    for i in range(steps):
                        add_seg(c_pts[i], c_pts[(i+1)%steps], rgb)
                elif t == 'ARC':
                    cx, cy, r = e.dxf.center.x, e.dxf.center.y, e.dxf.radius
                    sa, ea = math.radians(e.dxf.start_angle), math.radians(e.dxf.end_angle)
                    if ea < sa:
                        ea += 2 * math.pi
                    steps = max(4, int(abs(ea - sa) / (math.pi / 8)))
                    a_pts = [(cx + r * math.cos(sa + (ea-sa)*i/steps), cy + r * math.sin(sa + (ea-sa)*i/steps)) for i in range(steps+1)]
                    for i in range(steps):
                        add_seg(a_pts[i], a_pts[i+1], rgb)
            elif t == '3DFACE':
                for p1, p2 in face_outline_segments(e):
                    add_seg(p1, p2, rgb)
            elif t == 'HATCH':
                for p1, p2 in hatch_outline_segments(e):
                    add_seg(p1, p2, rgb)
            elif t in ['TEXT', 'MTEXT']:
                raw = e.dxf.text if t == 'TEXT' else e.text
                cln = clean_txt(raw)
                if cln:
                    h = getattr(e.dxf, 'char_height', getattr(e.dxf, 'height', 10.0))
                    rot = getattr(e.dxf, 'rotation', 0.0)
                    td = getattr(e.dxf, 'text_direction', None)
                    if td and (abs(td.x - 1.0) > 0.01 or abs(td.y) > 0.01):
                        rot = math.degrees(math.atan2(td.y, td.x))

                    halign = getattr(e.dxf, 'halign', 0)
                    valign = getattr(e.dxf, 'valign', 0)
                    align_pt = getattr(e.dxf, 'align_point', None)
                    ins_pt = e.dxf.insert
                    target_pt = align_pt if ((halign > 0 or valign > 0) and align_pt is not None and (abs(align_pt.x) > 0.001 or abs(align_pt.y) > 0.001)) else ins_pt

                    ha = 1 if halign in [1, 4] else (2 if halign == 2 else 0)
                    va = 1 if valign == 1 else (2 if valign == 2 else (3 if valign == 3 else 0))
                    width_factor = getattr(e.dxf, 'width', 1.0) if t == 'TEXT' else 1.0
                    w = getattr(e.dxf, 'width', 0.0) if t == 'MTEXT' else (len(cln) * h * 0.80 * width_factor)
                    if t == 'MTEXT':
                        attach = getattr(e.dxf, 'attachment_point', 1)
                        ha = 0 if attach in [1, 4, 7] else (1 if attach in [2, 5, 8] else 2)
                        va = 3 if attach in [1, 2, 3] else (2 if attach in [4, 5, 6] else 1)
                        if '\\pxqc;' in raw:
                            ha = 1
                        elif '\\pxqr;' in raw:
                            ha = 2
                        elif '\\pxql;' in raw:
                            ha = 0

                    gen_flags = getattr(e.dxf, 'generation_flags', 0) if t == 'TEXT' else 0
                    is_mirrored = bool(gen_flags & 2)

                    # 표제란 고정 라벨(범용 영문 라벨)은 AutoCAD 관례대로 노란색 강조, 그 외는 레이어/엔티티 색 그대로
                    final_txt_col = hex_col
                    if any(lbl in cln for lbl in ['DWG TITLE', 'MODEL NAME', 'DWG NO.', 'Page', 'DESIGNED BY', 'CHECKED BY', 'APPROVED BY', 'DWG SIZE', 'NAME', 'DATE', 'SCALE', 'UNIT']):
                        final_txt_col = '#ffff00'

                    txt_item = {
                        't': cln,
                        'x': round(target_pt.x, 1),
                        'y': round(target_pt.y, 1),
                        'h': round(h, 1),
                        'r': round(rot % 360, 1),
                        'c': final_txt_col,
                        'ha': ha,
                        'va': va
                    }
                    if w > 0:
                        txt_item['w'] = round(w, 1)
                    if is_mirrored:
                        txt_item['mx'] = True
                    all_texts.append(txt_item)
            elif t == 'DIMENSION':
                d_lines, d_txt, d_rgb = extract_dim_geom_and_text(e)
                for p1, p2 in d_lines:
                    add_seg(p1, p2, d_rgb)
                if d_txt:
                    d_txt['c'] = DIM_GREEN_HEX
                    d_txt['x'] = round(d_txt['x'], 1)
                    d_txt['y'] = round(d_txt['y'], 1)
                    d_txt['r'] = round(d_txt['r'], 1)
                    all_texts.append(d_txt)
            elif t == 'ELLIPSE':
                try:
                    pts = list(e.flattening(distance=0.5))
                    for i in range(len(pts)-1):
                        add_seg((pts[i][0], pts[i][1]), (pts[i+1][0], pts[i+1][1]), rgb)
                except Exception:
                    pass
            elif t == 'MULTILEADER':
                ml_lines, ml_tris, ml_txt = extract_mleader_geom_and_text(e)
                for p1, p2 in ml_lines:
                    add_seg(p1, p2, DIM_GREEN_RGB) # Green leader lines like AutoCAD!
                for p1, p2, p3 in ml_tris:
                    add_tri(p1, p2, p3, DIM_GREEN_RGB) # Solid arrowheads!
                if ml_txt:
                    ml_txt['x'] = round(ml_txt['x'], 1)
                    ml_txt['y'] = round(ml_txt['y'], 1)
                    ml_txt['r'] = round(ml_txt['r'], 1)
                    all_texts.append(ml_txt)
            elif t == 'LEADER':
                try:
                    verts = list(e.vertices)
                    for i in range(len(verts) - 1):
                        add_seg((verts[i].x, verts[i].y), (verts[i+1].x, verts[i+1].y), rgb)
                except Exception:
                    pass
            elif t == 'INSERT':
                bname = getattr(e.dxf, 'name', None)
                ins = (e.dxf.insert.x, e.dxf.insert.y)
                rot = math.radians(getattr(e.dxf, 'rotation', 0.0))
                cos_r, sin_r = math.cos(rot), math.sin(rot)
                sx = getattr(e.dxf, 'xscale', 1.0)
                sy = getattr(e.dxf, 'yscale', 1.0)
                entity_is_sheet_insert = bname in block_sheet_frames

                if bname in block_cache:
                    for (p1, p2, blk_rgb, blk_col, blk_lay, blk_lw) in block_cache[bname]:
                        tp1 = transform_pt(p1, ins, cos_r, sin_r, sx, sy)
                        tp2 = transform_pt(p2, ins, cos_r, sin_r, sx, sy)

                        if blk_col == 0:
                            final_rgb = rgb
                        elif blk_lay == '0' and blk_col == 256:
                            final_rgb = rgb
                        else:
                            final_rgb = blk_rgb

                        add_seg(tp1, tp2, final_rgb, blk_lw)

                    if bname in block_tris:
                        for (p1, p2, p3, blk_rgb, blk_col, blk_lay) in block_tris[bname]:
                            tp1 = transform_pt(p1, ins, cos_r, sin_r, sx, sy)
                            tp2 = transform_pt(p2, ins, cos_r, sin_r, sx, sy)
                            tp3 = transform_pt(p3, ins, cos_r, sin_r, sx, sy)
                            if blk_col == 0:
                                final_rgb = rgb
                            elif blk_lay == '0' and blk_col == 256:
                                final_rgb = rgb
                            else:
                                final_rgb = blk_rgb
                            add_tri(tp1, tp2, tp3, final_rgb)

                if bname in block_texts:
                    for bt in block_texts[bname]:
                        tp = transform_pt((bt['x'], bt['y']), ins, cos_r, sin_r, sx, sy)
                        cln = clean_txt(bt['t'])
                        if cln:
                            total_rot = bt['r'] + math.degrees(rot)
                            b_col = bt.get('raw_col', 256)
                            b_lay = bt.get('lay_name', '0')

                            if b_col == 0:
                                final_hex = hex_col
                            elif b_lay == '0' and b_col == 256:
                                final_hex = hex_col
                            else:
                                final_hex = bt['c']

                            all_texts.append({
                                't': cln,
                                'x': round(tp[0], 1),
                                'y': round(tp[1], 1),
                                'h': round(bt['h'] * max(abs(sx), abs(sy)), 1),
                                'w': round(bt.get('w', 0) * max(abs(sx), abs(sy)), 1),
                                'r': round(total_rot % 360, 1),
                                'c': final_hex,
                                'ha': bt.get('ha', 0),
                                'va': bt.get('va', 0)
                            })

                # Extract dynamic block attributes (Title block, project info, drawing numbers)
                for att in getattr(e, 'attribs', []):
                    raw_att = att.dxf.text if hasattr(att.dxf, 'text') else ''
                    cln_att = clean_txt(raw_att)
                    if cln_att:
                        att_h = getattr(att.dxf, 'height', 15.0)
                        att_rot = getattr(att.dxf, 'rotation', 0.0)
                        att_col = getattr(att.dxf, 'color', 256)
                        att_lay = getattr(att.dxf, 'layer', lay_name)
                        att_pos = att.dxf.insert
                        if att_col == 256:
                            _, att_hex = layer_colors.get(att_lay, ((0.92, 0.95, 0.98), '#f1f5f9'))
                        else:
                            att_rgb = get_rgb(att_col)
                            att_hex = f"#{int(att_rgb[0]*255):02x}{int(att_rgb[1]*255):02x}{int(att_rgb[2]*255):02x}"
                        all_texts.append({
                            't': cln_att,
                            'x': round(att_pos.x, 1),
                            'y': round(att_pos.y, 1),
                            'h': round(att_h, 1),
                            'w': len(cln_att) * att_h * 0.80,
                            'r': round(att_rot % 360, 1),
                            'c': att_hex,
                            'ha': 0,
                            'va': 0
                        })

            # 프록시 시트 클러스터링용 엔티티 바운딩 박스 (시트 블록 INSERT 자체는 제외)
            if track_boxes and not entity_is_sheet_insert:
                bx0 = by0 = float('inf')
                bx1 = by1 = float('-inf')
                for i in range(pos_start, len(pos_data), 3):
                    bx0 = min(bx0, pos_data[i]); bx1 = max(bx1, pos_data[i])
                    by0 = min(by0, pos_data[i + 1]); by1 = max(by1, pos_data[i + 1])
                for i in range(tri_start, len(tri_pos_data), 3):
                    bx0 = min(bx0, tri_pos_data[i]); bx1 = max(bx1, tri_pos_data[i])
                    by0 = min(by0, tri_pos_data[i + 1]); by1 = max(by1, tri_pos_data[i + 1])
                if bx0 != float('inf'):
                    msp_entity_boxes.append((bx0, by0, bx1, by1))

        # ------------------------------------------------------------------
        # 2-C. 프록시(빈) 블록 시트 동적 재구성: 3중 프레임 + 표제란 격자
        # ------------------------------------------------------------------
        reconstructed_sheets = []
        if proxy_sheet_inserts:
            # 동일 좌표에 과거 리비전 DRAWFORM 블록들이 중첩된 경우 단일화
            unique_proxies = []
            for ps in proxy_sheet_inserts:
                ins = ps['insert']
                if not any(abs(p['insert'][0] - ins[0]) < 1.0 and abs(p['insert'][1] - ins[1]) < 1.0 for p in unique_proxies):
                    unique_proxies.append(ps)
            proxy_sheet_inserts = unique_proxies

            exclusion_rects = []
            for r in msp_frames['GROUP_BOX'] + known_sheet_rects:
                pad = max(r[2] - r[0], r[3] - r[1]) * 0.01
                exclusion_rects.append((r[0] - pad, r[1] - pad, r[2] + pad, r[3] + pad))

            def is_excluded(px, py):
                for r in exclusion_rects:
                    if r[0] <= px <= r[2] and r[1] <= py <= r[3]:
                        return True
                return False

            def contains_sheet(bx0, by0, bx1, by1):
                # 단품 시트 하나 이상을 통째로 감싸는 엔티티(그룹핑 박스 등)는 메인 클러스터에서 제외
                for r in known_sheet_rects:
                    if bx0 <= r[0] and by0 <= r[1] and bx1 >= r[2] and by1 >= r[3]:
                        return True
                return False

            # 전체 도면 extent 계산
            tot_w = max_x - min_x
            tot_h = max_y - min_y
            tot_area = max(tot_w * tot_h, 1.0)
            gap = max(tot_w, tot_h) * 0.02

            candidate_boxes = []
            candidate_meta = []  # ('geom', None) or ('text', tx)

            for (bx0, by0, bx1, by1) in msp_entity_boxes:
                cx, cy = (bx0 + bx1) / 2.0, (by0 + by1) / 2.0
                if is_excluded(cx, cy) or (known_sheet_rects and contains_sheet(bx0, by0, bx1, by1)):
                    continue
                candidate_boxes.append((bx0, by0, bx1, by1))
                candidate_meta.append(('geom', None))

            for tx in all_texts:
                if is_excluded(tx['x'], tx['y']):
                    continue
                h = tx.get('h') or 10.0
                # 텍스트 삽입점을 "높이 h 정사각형 박스"로 변환
                candidate_boxes.append((tx['x'], tx['y'], tx['x'] + h, tx['y'] + h))
                candidate_meta.append(('text', tx))

            # cluster_boxes 실행 (2단계: 간격 기반 연결 요소)
            clusters = cluster_boxes(candidate_boxes, gap)

            # 안전장치 필터링
            valid_clusters = []
            for cl in clusters:
                cbx0, cby0, cbx1, cby1 = cl['bbox']
                c_area = (cbx1 - cbx0) * (cby1 - cby0)
                # 1) 전체 면적의 60%를 넘는 배경/기준선 요소 제외
                if c_area > tot_area * 0.6:
                    continue
                # 2) 텍스트만으로 이루어진 요소(기하 요소 미포함) 제외
                has_geom = any(candidate_meta[idx][0] == 'geom' for idx in cl['indices'])
                if not has_geom:
                    continue
                cl_texts = [candidate_meta[idx][1] for idx in cl['indices'] if candidate_meta[idx][0] == 'text']
                cl['texts'] = cl_texts
                valid_clusters.append(cl)

            for ps in proxy_sheet_inserts:
                ins = ps['insert']
                # 우선순위 1: 삽입점이 요소 bbox 내부이거나, 요소 bbox 좌하단 근방(폭/높이의 15% 이내)에 있는 요소
                p1_candidates = []
                for cl in valid_clusters:
                    cbx0, cby0, cbx1, cby1 = cl['bbox']
                    cw = cbx1 - cbx0
                    ch = cby1 - cby0
                    if (cbx0 - cw * 0.15 <= ins[0] <= cbx1 + cw * 0.15) and (cby0 - ch * 0.15 <= ins[1] <= cby1 + ch * 0.15):
                        p1_candidates.append(cl)

                best_cl = None
                if p1_candidates:
                    # 우선순위 1 후보 중 채택 (가장 넓은 영역 우선)
                    best_cl = p1_candidates[0]
                elif valid_clusters:
                    # 우선순위 2: 삽입점에서 bbox 거리가 가장 가까운 요소
                    def dist_to_bbox(cl):
                        cbx0, cby0, cbx1, cby1 = cl['bbox']
                        dx = max(0.0, cbx0 - ins[0], ins[0] - cbx1)
                        dy = max(0.0, cby0 - ins[1], ins[1] - cby1)
                        return dx * dx + dy * dy
                    best_cl = min(valid_clusters, key=dist_to_bbox)

                if not best_cl:
                    print(f"[CAD Export] No valid cluster adopted for proxy sheet {ps['name']} at {ins}")
                    continue

                sheet = reconstruct_proxy_sheet(ps['insert'], best_cl['bbox'], best_cl['texts'], ps['scale'])
                if not sheet:
                    continue
                for (p1, p2, role) in sheet['segments']:
                    add_role_seg(p1, p2, role)
                reconstructed_sheets.append({
                    'block': ps['name'],
                    'insert': [round(ps['insert'][0], 1), round(ps['insert'][1], 1)],
                    'paper': sheet['paper'],
                    'scale': sheet['scale'],
                    'outer': [round(v, 1) for v in sheet['outer']],
                    'border': [round(v, 1) for v in sheet['border']],
                    'margin': [round(v, 1) for v in sheet['margin']],
                    'title_block': [round(v, 1) for v in sheet['tb_rect']] if sheet['tb_rect'] else None,
                    'grid_lines': len(sheet['grid'])
                })
        # 3. Process OLE frames (Embedded Excel tables)
        try:
            ole_frames = extract_ole_frames_from_dxf(dxf_path)
            for ole in ole_frames:
                if ole.get('png_b64'):
                    all_rasters.append({
                        'src': f"data:image/png;base64,{ole['png_b64']}",
                        'x': round(ole['center_x'], 1),
                        'y': round(ole['center_y'], 1),
                        'width': round(ole['width'], 1),
                        'height': round(ole['height'], 1)
                    })
                # Add vector table lines
                for (p1, p2, rgb) in ole.get('lines', []):
                    add_seg(p1, p2, rgb)
                if not ole.get('lines'):
                    # Fallback outer yellow frame if no detailed vector lines
                    ox1, ox2 = ole['min_x'], ole['max_x']
                    oy1, oy2 = ole['min_y'], ole['max_y']
                    add_seg((ox1, oy1), (ox2, oy1), (1.0, 1.0, 0.0))
                    add_seg((ox2, oy1), (ox2, oy2), (1.0, 1.0, 0.0))
                    add_seg((ox2, oy2), (ox1, oy2), (1.0, 1.0, 0.0))
                    add_seg((ox1, oy2), (ox1, oy1), (1.0, 1.0, 0.0))
                if ole.get('texts'):
                    all_texts.extend(ole['texts'])
        except Exception as _oe:
            pass

        # 4. 도곽/표제란은 (a) 블록 내 규격 사각형 승격, (b) 모델 공간 그룹핑 박스/직접 도곽 판별,
        #    (c) 프록시(빈) 블록 시트 동적 재구성으로 모두 DXF 데이터에서만 유도됩니다. 좌표 하드코딩 없음.

        num_lines = len(pos_data) // 6
        num_tris = len(tri_pos_data) // 9
        num_heavy = len(heavy_pos_data) // 6
        if min_x == float('inf'):
            min_x, min_y, max_x, max_y = 0.0, 0.0, 1000.0, 700.0

        os.makedirs(os.path.dirname(os.path.abspath(output_bin_path)), exist_ok=True)

        # High-performance Float32 binary write (direct memory dump)
        # CADW v3 레이아웃:
        #   magic 'CADW' | u32 version=3 | u32 numLines | u32 numTris | u32 numHeavy | f32 minX,minY,maxX,maxY
        #   lines pos (numLines*6 f32) | lines col (numLines*6 f32)
        #   tris pos (numTris*9 f32)   | tris col (numTris*9 f32)
        #   heavy pos (numHeavy*6 f32) | heavy col (numHeavy*6 f32) | heavy lineweight mm (numHeavy f32)
        with open(output_bin_path, 'wb') as f:
            f.write(b'CADW')
            f.write(struct.pack('<IIIIffff', CADW_VERSION, num_lines, num_tris, num_heavy, min_x, min_y, max_x, max_y))
            f.write(pos_data.tobytes())
            f.write(col_data.tobytes())
            f.write(tri_pos_data.tobytes())
            f.write(tri_col_data.tobytes())
            f.write(heavy_pos_data.tobytes())
            f.write(heavy_col_data.tobytes())
            f.write(heavy_lw_data.tobytes())
        # Save Text JSON alongside binary buffer
        output_txt_path = output_bin_path.replace('__cad_webgl.bin', '__cad_texts.json')
        if output_txt_path == output_bin_path:
            output_txt_path = os.path.splitext(output_bin_path)[0] + '__cad_texts.json'
            
        with open(output_txt_path, 'w', encoding='utf-8') as f:
            try:
                json.dump({'texts': all_texts}, f, ensure_ascii=False)
            except Exception:
                json.dump({'texts': all_texts}, f, ensure_ascii=True)

        # Save Rasters JSON alongside binary buffer
        output_raster_path = output_bin_path.replace('__cad_webgl.bin', '__cad_rasters.json')
        if output_raster_path == output_bin_path:
            output_raster_path = os.path.splitext(output_bin_path)[0] + '__cad_rasters.json'
            
        with open(output_raster_path, 'w', encoding='utf-8') as f:
            try:
                json.dump({'rasters': all_rasters}, f, ensure_ascii=False)
            except Exception:
                json.dump({'rasters': all_rasters}, f, ensure_ascii=True)

        # Auto-sync to both local storage/derived and EGDesk AppData storage/derived if they differ
        try:
            appdata = os.environ.get('APPDATA') or os.path.expanduser('~\\AppData\\Roaming')
            proj_id = os.environ.get('NEXT_PUBLIC_EGDESK_PROJECT_ID', '8dd35536-8cbb-4e1c-bb65-b35f2920cb03')
            env_name = os.environ.get('NEXT_PUBLIC_EGDESK_ENV', 'development')
            egdesk_derived = os.path.join(appdata, 'egdesk', 'user-data', env_name, 'projects', proj_id, 'storage', 'derived')
            local_derived = os.path.abspath(os.path.join('storage', 'derived'))
            
            target_dirs = set()
            for cand in [egdesk_derived, local_derived]:
                if os.path.exists(cand):
                    target_dirs.add(os.path.abspath(cand))
            
            cur_dir = os.path.abspath(os.path.dirname(output_bin_path))
            for t_dir in target_dirs:
                if t_dir != cur_dir:
                    base_bin = os.path.basename(output_bin_path)
                    shutil.copyfile(output_bin_path, os.path.join(t_dir, base_bin))
                    if os.path.exists(output_txt_path):
                        shutil.copyfile(output_txt_path, os.path.join(t_dir, os.path.basename(output_txt_path)))
                    if os.path.exists(output_raster_path):
                        shutil.copyfile(output_raster_path, os.path.join(t_dir, os.path.basename(output_raster_path)))
        except Exception:
            pass

        file_size = os.path.getsize(output_bin_path)
        duration_ms = int((time.time() - start_time) * 1000)

        return {
            "status": "SUCCESS",
            "format_version": CADW_VERSION,
            "num_lines": num_lines,
            "num_tris": num_tris,
            "num_heavy": num_heavy,
            "frames": {
                "block_sheet_templates": len(block_sheet_frames),
                "sheet_inserts": len(sheet_insert_points),
                "group_boxes": len(msp_frames['GROUP_BOX']),
                "msp_borders": len(msp_frames['BORDER']),
                "msp_margins": len(msp_frames['MARGIN']),
                "proxy_sheets": reconstructed_sheets
            },
            "bounds": {
                "min_x": round(min_x, 1),
                "min_y": round(min_y, 1),
                "max_x": round(max_x, 1),
                "max_y": round(max_y, 1),
                "width": round(max_x - min_x, 1),
                "height": round(max_y - min_y, 1)
            },
            "file_size_bytes": file_size,
            "file_size_mb": round(file_size / (1024 * 1024), 2),
            "duration_ms": duration_ms
        }
    except Exception as e:
        return {"status": "ERROR", "error": str(e), "duration_ms": int((time.time() - start_time) * 1000)}

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: cad_webgl_exporter.py <input_dxf> <output_bin>"}))
        sys.exit(1)
        
    in_dxf = sys.argv[1]
    out_bin = sys.argv[2]
    res = export_dxf_to_webgl_binary(in_dxf, out_bin)
    print(json.dumps(res, ensure_ascii=False, indent=2))
