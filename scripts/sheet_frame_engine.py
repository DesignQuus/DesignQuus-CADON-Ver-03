#!/usr/bin/env python3
"""
CADON-BOM - 범용 도곽(Sheet Frame) / 표제란(Title Block) 기하 엔진

이 모듈은 특정 도면 좌표나 업체명을 전혀 알지 못한 채, 오직 DXF 안에 실제로 존재하는
기하·텍스트의 분포만으로 다음을 수행합니다.

  1. 축 정렬 사각형 추출 (닫힌 폴리라인 / 4개의 LINE 조합 모두 지원)
  2. ISO A·B / ANSI 규격 용지 비율 매칭으로 "시트 도곽" 사각형 판별
     - 최외곽 = BORDER(노랑, 0.7mm) / 안쪽 중첩 사각형 = MARGIN(빨강, 0.5mm)
  3. 여러 시트를 묶는 그룹핑 박스(GROUP_BOX, 노랑, 0.7mm) 판별
  4. 내부 엔티티가 0개인 프록시(메카클릭 MCL_DRAWFORM 등) 블록 시트의 동적 재구성
     - 삽입점·스케일 힌트 + 도면 기하/텍스트 클러스터 바운딩 박스로 용지 규격·배율 역산
     - 3중 프레임(용지 가장자리 시안 → 도곽 노랑 → 여백선 빨강) + 표제란 격자선 생성

cad_webgl_exporter.py(WebGL 렌더링)와 dxf_parser.py(프레임 감지 파이프라인)가 공용으로 사용합니다.
"""
import math
from statistics import median

# ---------------------------------------------------------------------------
# 색상 / 선가중치 상수 (AutoCAD 표준 팔레트, 다크 캔버스 기준)
# ---------------------------------------------------------------------------
RGB_PAPER_EDGE = (0.0, 1.0, 1.0)     # 시안: 용지 가장자리
RGB_BORDER = (1.0, 1.0, 0.0)         # 비비드 옐로우: 도곽 외곽선
RGB_MARGIN = (1.0, 0.2, 0.2)         # 레드: 여백선(내측 프레임)
RGB_GRID = (1.0, 1.0, 0.0)           # 표제란 격자선
RGB_GROUP_BOX = (1.0, 1.0, 0.0)      # 단품 시트 그룹핑 박스

LW_PAPER_EDGE = 0.5
LW_BORDER = 0.7
LW_MARGIN = 0.5
LW_GRID = 0.35
LW_GROUP_BOX = 0.7

ROLE_STYLE = {
    'PAPER_EDGE': (RGB_PAPER_EDGE, LW_PAPER_EDGE),
    'BORDER': (RGB_BORDER, LW_BORDER),
    'MARGIN': (RGB_MARGIN, LW_MARGIN),
    'GRID': (RGB_GRID, LW_GRID),
    'GROUP_BOX': (RGB_GROUP_BOX, LW_GROUP_BOX),
}

# 규격 용지 (mm, 가로 x 세로 - 가로형 기준)
PAPER_SIZES_MM = {
    'A0': (1189.0, 841.0), 'A1': (841.0, 594.0), 'A2': (594.0, 420.0), 'A3': (420.0, 297.0), 'A4': (297.0, 210.0),
    'B0': (1456.0, 1030.0), 'B1': (1030.0, 728.0), 'B2': (728.0, 515.0), 'B3': (515.0, 364.0), 'B4': (364.0, 257.0),
    'ANSI_A': (279.4, 215.9), 'ANSI_B': (431.8, 279.4), 'ANSI_C': (558.8, 431.8),
    'ANSI_D': (863.6, 558.8), 'ANSI_E': (1117.6, 863.6),
}
# 표준 도면 배율 후보 (1:N 및 N:1 모두 포함)
NICE_SCALES = [0.05, 0.1, 0.2, 0.25, 0.4, 0.5, 1.0, 2.0, 2.5, 4.0, 5.0, 8.0, 10.0, 16.0, 20.0, 25.0,
               32.0, 40.0, 50.0, 80.0, 100.0, 125.0, 200.0, 250.0, 400.0, 500.0, 1000.0]
ISO_A_RATIO = math.sqrt(2.0)
PAPER_RATIO_TOL = 0.05


def _paper_ratio_match(w, h, tol=PAPER_RATIO_TOL):
    """가로/세로 비율이 규격 용지에 해당하면 (용지명, 가로형 여부) 반환."""
    if w <= 0 or h <= 0:
        return None
    ratio = max(w, h) / min(w, h)
    best = None
    for name, (pw, ph) in PAPER_SIZES_MM.items():
        pr = pw / ph
        err = abs(ratio - pr) / pr
        if err <= tol and (best is None or err < best[0]):
            best = (err, name)
    if best is None:
        return None
    return best[1], (w >= h)


def paper_ratio_match(w, h, tol=PAPER_RATIO_TOL):
    """공개 API: 규격 용지 비율 매칭."""
    return _paper_ratio_match(w, h, tol)


def rect_from_points(pts, tol):
    """4/5개 정점의 축 정렬 사각형이면 (x0, y0, x1, y1) 반환, 아니면 None."""
    if len(pts) == 5:
        if abs(pts[0][0] - pts[4][0]) <= tol and abs(pts[0][1] - pts[4][1]) <= tol:
            pts = pts[:4]
        else:
            return None
    if len(pts) != 4:
        return None
    for i in range(4):
        a, b = pts[i], pts[(i + 1) % 4]
        dx, dy = abs(a[0] - b[0]), abs(a[1] - b[1])
        if dx > tol and dy > tol:
            return None
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    if (x1 - x0) <= tol or (y1 - y0) <= tol:
        return None
    return (x0, y0, x1, y1)


def rects_from_line_segments(segments, tol):
    """
    개별 LINE 4개(수평 2 + 수직 2)가 이루는 축 정렬 사각형을 찾습니다.
    segments: [((x1, y1), (x2, y2)), ...]
    """
    q = max(tol, 1e-6)

    def key(v):
        return int(round(v / q))

    horizontals = {}
    verticals = {}
    for (p1, p2) in segments:
        if abs(p1[1] - p2[1]) <= tol and abs(p1[0] - p2[0]) > tol:
            xa, xb = sorted((p1[0], p2[0]))
            horizontals.setdefault((key(xa), key(xb)), []).append((p1[1], xa, xb))
        elif abs(p1[0] - p2[0]) <= tol and abs(p1[1] - p2[1]) > tol:
            ya, yb = sorted((p1[1], p2[1]))
            verticals.setdefault((key(p1[0]), key(ya), key(yb)), []).append((p1[0], ya, yb))

    rects = []
    seen = set()
    for (kxa, kxb), hs in horizontals.items():
        if len(hs) < 2:
            continue
        hs_sorted = sorted(hs, key=lambda h: h[0])
        for i in range(len(hs_sorted)):
            for j in range(i + 1, len(hs_sorted)):
                y0, xa, xb = hs_sorted[i]
                y1 = hs_sorted[j][0]
                if (y1 - y0) <= tol:
                    continue
                kv_l = (key(xa), key(y0), key(y1))
                kv_r = (key(xb), key(y0), key(y1))
                if kv_l in verticals and kv_r in verticals:
                    rk = (key(xa), key(y0), key(xb), key(y1))
                    if rk not in seen:
                        seen.add(rk)
                        rects.append((xa, y0, xb, y1))
    return rects


def _rect_w(r):
    return r[2] - r[0]


def _rect_h(r):
    return r[3] - r[1]


def _rect_area(r):
    return _rect_w(r) * _rect_h(r)


def _contains(outer, inner, tol=0.0):
    return (inner[0] >= outer[0] - tol and inner[1] >= outer[1] - tol and
            inner[2] <= outer[2] + tol and inner[3] <= outer[3] + tol)


def _point_in(rect, p, tol=0.0):
    return rect[0] - tol <= p[0] <= rect[2] + tol and rect[1] - tol <= p[1] <= rect[3] + tol


def rect_segments(r):
    x0, y0, x1, y1 = r
    return [((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))]


def _same_rect(a, b, tol):
    return all(abs(a[i] - b[i]) <= tol for i in range(4))


def _find_nested_margin(border, candidates, tol):
    """BORDER 안쪽에 여백선으로 볼 수 있는 사각형(각 변 인셋 0.3%~12%)을 찾습니다."""
    bw, bh = _rect_w(border), _rect_h(border)
    best = None
    for r in candidates:
        if _same_rect(r, border, tol) or not _contains(border, r, tol):
            continue
        insets = [r[0] - border[0], r[1] - border[1], border[2] - r[2], border[3] - r[3]]
        if any(v < -tol for v in insets):
            continue
        if max(insets) <= tol:
            continue
        if max(insets[0], insets[2]) > bw * 0.12 or max(insets[1], insets[3]) > bh * 0.12:
            continue
        if _rect_area(r) < _rect_area(border) * 0.6:
            continue
        if best is None or _rect_area(r) > _rect_area(best):
            best = r
    return best


def classify_block_sheet_frames(polyline_rects, line_segments, extent, tol=None):
    """
    블록(시트 템플릿) 내부의 사각형들 중 도곽/여백선을 판별합니다.
    - polyline_rects: 닫힌 폴리라인에서 얻은 (x0,y0,x1,y1) 목록
    - line_segments: LINE 세그먼트 [((x1,y1),(x2,y2)), ...] (4개 조합으로 사각형 복원)
    - extent: 블록 전체 바운딩 박스 (x0,y0,x1,y1)
    반환: {'BORDER': rect, 'MARGIN': rect|None, 'paper': name|None} 또는 None
    """
    if extent is None:
        return None
    ew, eh = _rect_w(extent), _rect_h(extent)
    if ew <= 0 or eh <= 0:
        return None
    if tol is None:
        tol = max(ew, eh) * 0.002
    rects = list(polyline_rects) + rects_from_line_segments(line_segments, tol)
    if not rects:
        return None

    candidates = []
    for r in rects:
        if _rect_w(r) < ew * 0.6 or _rect_h(r) < eh * 0.6:
            continue
        # 규격 도면 용지 최소 물리 치수 (단변 최소 100mm 이상: 초소형 기계 부품/심볼 블록 오탐 방지)
        if min(_rect_w(r), _rect_h(r)) < 100.0:
            continue
        m = _paper_ratio_match(_rect_w(r), _rect_h(r))
        if m:
            candidates.append((r, m[0]))
    if not candidates:
        return None
    candidates.sort(key=lambda c: _rect_area(c[0]), reverse=True)
    border, paper = candidates[0]
    margin = _find_nested_margin(border, rects, tol)
    return {'BORDER': border, 'MARGIN': margin, 'paper': paper}


def detect_msp_frames(rects, text_points, sheet_insert_points, sheet_rects_hint=None, tol=None):
    """
    모델 공간 사각형들을 역할별로 분류합니다.
    - rects: [(x0,y0,x1,y1), ...] 모델 공간 닫힌 폴리라인 / LINE 조합 사각형
    - text_points: 텍스트 삽입점 목록
    - sheet_insert_points: 시트 블록 INSERT 삽입점 목록 (블록 단위 도곽으로 판별된 것)
    - sheet_rects_hint: 이미 알려진 시트 도곽 사각형 (블록 INSERT 전개 결과)
    반환: {'GROUP_BOX': [rect...], 'BORDER': [rect...], 'MARGIN': [rect...]}
    """
    result = {'GROUP_BOX': [], 'BORDER': [], 'MARGIN': []}
    if not rects:
        return result
    all_w = [_rect_w(r) for r in rects]
    if tol is None:
        tol = max(max(all_w), 1.0) * 0.002
    known_sheets = list(sheet_rects_hint or [])

    def count_inside(rect, pts, pad):
        return sum(1 for p in pts if _point_in(rect, p, pad))

    borders = []
    for r in rects:
        pad = max(_rect_w(r), _rect_h(r)) * 0.01
        # 1) 시트 삽입점 2개 이상 또는 알려진 시트 도곽 2개 이상 포함 → 그룹핑 박스
        n_ins = count_inside(r, sheet_insert_points, pad)
        contained_sheets = [s for s in known_sheets if _contains(r, s, pad) and not _same_rect(r, s, tol)]
        n_sheet = len(contained_sheets)
        # 시트 2개 이상을 묶거나, 시트 1개를 감싸되 그 시트보다 충분히 큰(1.5배 이상) 사각형 → 그룹핑 박스
        wraps_single = n_sheet >= 1 and _rect_area(r) >= 1.5 * max(_rect_area(s) for s in contained_sheets)
        if n_ins >= 2 or n_sheet >= 2 or wraps_single:
            result['GROUP_BOX'].append(r)
            continue
        # 2) 규격 비율 + 텍스트 포함 → 모델 공간에 직접 그려진 시트 도곽
        m = _paper_ratio_match(_rect_w(r), _rect_h(r))
        if m and count_inside(r, text_points, 0.0) >= 2 and n_ins == 0:
            borders.append(r)

    # 중첩된 도곽 쌍: 바깥 = BORDER, 안쪽 = MARGIN
    borders.sort(key=_rect_area, reverse=True)
    consumed = set()
    for i, b in enumerate(borders):
        if i in consumed:
            continue
        inner = _find_nested_margin(b, [x for j, x in enumerate(borders) if j != i and j not in consumed] + rects, tol)
        result['BORDER'].append(b)
        if inner is not None:
            result['MARGIN'].append(inner)
            for j, x in enumerate(borders):
                if _same_rect(x, inner, tol):
                    consumed.add(j)
    return result


# ---------------------------------------------------------------------------
# 프록시(빈) 블록 시트 동적 재구성
# ---------------------------------------------------------------------------
def _choose_paper_and_scale(anchor, cluster, landscape, scale_hint):
    """
    앵커(좌하단)에서 시작해 클러스터를 완전히 담는 규격 용지·배율을 결정합니다.
    우선순위: (1) INSERT 스케일 힌트로 정확히 맞는 규격 → (2) 표준 배율 스냅 → (3) 연속 배율 역산
    """
    ax, ay = anchor
    need_w = max(cluster[2] - ax, 1.0)
    need_h = max(cluster[3] - ay, 1.0)
    pw0, ph0 = (1189.0, 841.0) if landscape else (841.0, 1189.0)
    # A계열 기준 연속 배율(모든 A 규격은 동일 비율이므로 A0 기준으로 역산 후 규격명만 재산정)
    s_cont = max(need_w / pw0, need_h / ph0)

    def fits(s):
        return pw0 * s >= need_w * 0.999 and ph0 * s >= need_h * 0.999

    chosen = None
    if scale_hint and scale_hint > 0 and abs(scale_hint - 1.0) > 1e-9:
        # 힌트 배율 × A계열 규격 중 가장 작은 것
        for name in ['A4', 'A3', 'A2', 'A1', 'A0']:
            pw, ph = PAPER_SIZES_MM[name]
            if not landscape:
                pw, ph = ph, pw
            if pw * scale_hint >= need_w * 0.999 and ph * scale_hint >= need_h * 0.999:
                # 힌트 규격이 클러스터 대비 과도하게 크면(면적 2.2배 초과) 기각
                if (pw * scale_hint * ph * scale_hint) <= (need_w * need_h) * 2.2:
                    chosen = (pw * scale_hint, ph * scale_hint, name, scale_hint)
                break
    if chosen is None:
        nice = [s for s in NICE_SCALES if s >= s_cont and s <= s_cont * 1.12]
        if nice:
            s = nice[0]
            chosen = (pw0 * s, ph0 * s, None, s)
        else:
            s = s_cont * 1.004
            chosen = (pw0 * s, ph0 * s, None, s)

    W, H, name, s = chosen
    if name is None:
        # 규격명은 표시용: 배율이 표준 배율에 가장 가까워지는 A 규격 선택
        best = None
        for cand in ['A0', 'A1', 'A2', 'A3', 'A4']:
            pw, ph = PAPER_SIZES_MM[cand]
            sp = W / (pw if landscape else ph)
            err = min(abs(math.log(sp / n)) for n in NICE_SCALES)
            if best is None or err < best[0]:
                best = (err, cand, sp)
        name, s = best[1], best[2]
    return W, H, name, s


def _text_extent(t):
    """텍스트의 (x0, y0, x1, y1) 근사 범위 (폭은 문자수 × 높이 × 0.8 추정)."""
    h = float(t.get('h') or 1.0)
    n = max(len(str(t.get('t') or '')), 1)
    w = float(t.get('w') or 0.0) or n * h * 0.8
    ha = t.get('ha', 0)
    x = float(t['x'])
    y = float(t['y'])
    if ha == 1:
        x0 = x - w / 2.0
    elif ha == 2:
        x0 = x - w
    else:
        x0 = x
    va = t.get('va', 0)
    if va == 3:
        y0 = y - h
    elif va == 2:
        y0 = y - h / 2.0
    else:
        y0 = y
    return (x0, y0, x0 + w, y0 + h)


def _cluster_1d(values, gap):
    """1차원 값들을 gap 이하로 인접한 것끼리 묶어 [[v...], ...] 반환 (오름차순)."""
    if not values:
        return []
    vs = sorted(values)
    groups = [[vs[0]]]
    for v in vs[1:]:
        if v - groups[-1][-1] <= gap:
            groups[-1].append(v)
        else:
            groups.append([v])
    return groups


def build_title_block_grid(texts, margin, sheet_w, sheet_h):
    """
    여백선(margin) 내부 하단 밴드의 텍스트 배치로 표제란 격자선을 재구성합니다.
    반환: (grid_segments[((x1,y1),(x2,y2)), ...], tb_rect | None)
    """
    if not texts:
        return [], None
    mx0, my0, mx1, my1 = margin
    band_top = my0 + sheet_h * 0.25
    band = [t for t in texts if my0 - sheet_h * 0.01 <= float(t['y']) <= band_top and mx0 <= float(t['x']) <= mx1]
    if len(band) < 2:
        return [], None

    h_med = median([float(t.get('h') or 1.0) for t in band]) or 1.0
    # 우측에서부터 연속된 텍스트 군집(표제란)만 취함: 큰 X 간격(용지 폭 8%)으로 분리
    xs_sorted = sorted(band, key=lambda t: float(t['x']))
    groups = [[xs_sorted[0]]]
    for t in xs_sorted[1:]:
        prev = groups[-1][-1]
        prev_right = _text_extent(prev)[2]
        if float(t['x']) - prev_right > sheet_w * 0.08:
            groups.append([t])
        else:
            groups[-1].append(t)
    tb = groups[-1]
    if len(tb) < 2:
        return [], None

    # 행 군집 (기준선 Y)
    row_groups = _cluster_1d([float(t['y']) for t in tb], h_med * 0.6)
    rows = sorted([sum(g) / len(g) for g in row_groups], reverse=True)  # 위→아래
    # 열 군집 (좌측 X)
    col_groups = _cluster_1d([_text_extent(t)[0] for t in tb], h_med * 1.5)
    cols = [min(g) for g in col_groups]

    if len(rows) >= 2:
        pitch = median([rows[i] - rows[i + 1] for i in range(len(rows) - 1)])
    else:
        pitch = h_med * 2.0
    pitch = max(pitch, h_med * 1.2)

    top = rows[0] + (pitch + h_med) / 2.0
    bottom = my0  # 표제란은 여백선(내측 프레임)에 접함
    right = mx1
    left = max(mx0, cols[0] - h_med * 0.5)
    top = min(top, my1)

    segs = []
    # 외곽 (좌측 세로 + 상단 가로; 우/하는 여백선과 공유)
    segs.append(((left, bottom), (left, top)))
    segs.append(((left, top), (right, top)))
    # 행 구분선
    for i in range(len(rows) - 1):
        yb = (rows[i] + rows[i + 1] + h_med) / 2.0
        if bottom < yb < top:
            segs.append(((left, yb), (right, yb)))
    # 열 구분선 (각 열의 좌측 - 반 문자)
    for cx in cols[1:]:
        xb = cx - h_med * 0.5
        if left < xb < right:
            segs.append(((xb, bottom), (xb, top)))
    return segs, (left, bottom, right, top)


def reconstruct_proxy_sheet(insert, cluster_bbox, texts, scale_hint=1.0):
    """
    내부 엔티티가 없는 프록시 블록 시트를 동적으로 재구성합니다.
    - insert: 블록 삽입점 (x, y)
    - cluster_bbox: 이 시트에 속하는 모든 기하·텍스트의 바운딩 박스 (x0,y0,x1,y1)
    - texts: 이 시트에 속하는 텍스트 [{'t','x','y','h','ha','va'}...]
    - scale_hint: INSERT xscale (메카클릭은 도면 배율로 삽입하는 경우가 많음)
    반환: {'paper','scale','outer','border','margin','grid','tb_rect','segments':[(p1,p2,role),...]}
    """
    if cluster_bbox is None:
        return None
    cx0, cy0, cx1, cy1 = cluster_bbox
    # 텍스트 범위까지 포함해 클러스터 확장
    for t in texts or []:
        tx0, ty0, tx1, ty1 = _text_extent(t)
        cx0, cy0, cx1, cy1 = min(cx0, tx0), min(cy0, ty0), max(cx1, tx1), max(cy1, ty1)
    cw, ch = cx1 - cx0, cy1 - cy0
    if cw <= 0 or ch <= 0:
        return None

    ix, iy = float(insert[0]), float(insert[1])
    # 삽입점이 클러스터 좌하단 근방이면 그대로 앵커, 아니면 클러스터 좌하단에서 소폭 여유
    if ix <= cx0 + cw * 0.05 and iy <= cy0 + ch * 0.05 and ix >= cx0 - cw * 0.5 and iy >= cy0 - ch * 0.5:
        anchor = (ix, iy)
    else:
        pad = max(cw, ch) * 0.01
        anchor = (cx0 - pad, cy0 - pad)

    landscape = cw >= ch
    W, H, paper, scale = _choose_paper_and_scale(anchor, (cx0, cy0, cx1, cy1), landscape, scale_hint)
    outer = (anchor[0], anchor[1], anchor[0] + W, anchor[1] + H)

    # KS B ISO 5457: A0/A1 도곽 여백 20mm, A2~A4 10mm (좌측 철함 여백 20mm)
    base_mm = 20.0 if paper in ('A0', 'A1', 'B0', 'B1') else 10.0
    inset = base_mm * scale
    bind = 20.0 * scale
    border = (outer[0] + bind, outer[1] + inset, outer[2] - inset, outer[3] - inset)
    margin_in = 5.0 * scale
    margin = (border[0] + margin_in, border[1] + margin_in, border[2] - margin_in, border[3] - margin_in)

    # 프레임이 실제 내용(텍스트 포함)을 절단하지 않도록 검증·축소
    guard = 2.0 * scale
    content = (cx0 - guard, cy0 - guard, cx1 + guard, cy1 + guard)

    def shrink_to_contain(frame):
        x0, y0, x1, y1 = frame
        return (min(x0, content[0]), min(y0, content[1]), max(x1, content[2]), max(y1, content[3]))

    margin = shrink_to_contain(margin)
    border = shrink_to_contain(border)
    # 내측 프레임이 외측을 넘지 않도록 클램프
    border = (max(border[0], outer[0]), max(border[1], outer[1]), min(border[2], outer[2]), min(border[3], outer[3]))
    margin = (max(margin[0], border[0]), max(margin[1], border[1]), min(margin[2], border[2]), min(margin[3], border[3]))

    grid, tb_rect = build_title_block_grid(texts or [], margin, W, H)

    segments = []
    for s in rect_segments(outer):
        segments.append((s[0], s[1], 'PAPER_EDGE'))
    for s in rect_segments(border):
        segments.append((s[0], s[1], 'BORDER'))
    for s in rect_segments(margin):
        segments.append((s[0], s[1], 'MARGIN'))
    for s in grid:
        segments.append((s[0], s[1], 'GRID'))

    return {
        'paper': paper,
        'scale': round(scale, 4),
        'outer': outer,
        'border': border,
        'margin': margin,
        'grid': grid,
        'tb_rect': tb_rect,
        'segments': segments,
    }


def is_empty_block(block, renderable_types=None):
    """블록에 렌더링 가능한 엔티티(프록시 포함)가 하나도 없으면 True."""
    if block is None:
        return True
    for e in block:
        t = e.dxftype()
        if t in ('ATTDEF',):
            continue
        return False
    return True


def segment_on_rect(p1, p2, rect, tol):
    """선분이 사각형의 네 변 중 하나 위에 놓여 있으면 True (도곽 승격 판정용)."""
    x0, y0, x1, y1 = rect
    # 빠른 기각: 선분 바운딩 박스가 사각형 밖
    if max(p1[0], p2[0]) < x0 - tol or min(p1[0], p2[0]) > x1 + tol:
        return False
    if max(p1[1], p2[1]) < y0 - tol or min(p1[1], p2[1]) > y1 + tol:
        return False
    if abs(p1[1] - p2[1]) <= tol:  # 수평 선분
        y = (p1[1] + p2[1]) / 2.0
        return abs(y - y0) <= tol or abs(y - y1) <= tol
    if abs(p1[0] - p2[0]) <= tol:  # 수직 선분
        x = (p1[0] + p2[0]) / 2.0
        return abs(x - x0) <= tol or abs(x - x1) <= tol
    return False


def rect_tol(rect, rel=0.003, floor=1e-6):
    """사각형 크기에 비례한 판정 허용 오차."""
    return max((rect[2] - rect[0]), (rect[3] - rect[1]), floor) * rel


def transform_rect(rect, ins, sx, sy, rotation_deg=0.0):
    """블록 로컬 사각형을 INSERT 변환(회전은 90도 배수만 축 정렬 유지)으로 모델 공간 사각형에 매핑."""
    x0, y0, x1, y1 = rect
    rot = round(rotation_deg / 90.0) * 90 % 360 if abs(rotation_deg % 90) < 1e-6 else None
    if rot is None:
        return None
    rad = math.radians(rot)
    c, s = math.cos(rad), math.sin(rad)
    pts = []
    for (px, py) in [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]:
        lx, ly = px * sx, py * sy
        pts.append((ins[0] + lx * c - ly * s, ins[1] + lx * s + ly * c))
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return (min(xs), min(ys), max(xs), max(ys))


def cluster_boxes(boxes, gap):
    """
    바운딩 박스들을 '서로 gap 이하로 떨어진 것끼리' 연결 요소로 묶는다.
    - boxes: [(x0, y0, x1, y1), ...]
    - gap: 연결 허용 간격 (전체 extent 비율 기반)
    반환: [{'bbox': (x0, y0, x1, y1), 'indices': [i, ...]}, ...] (면적 내림차순)

    구현 요구:
      - 셀 크기 = gap 인 균일 격자에 각 박스가 걸치는 셀을 등록
      - 같은 셀 또는 인접 8셀에 걸친 박스끼리 union-find 로 병합
      - 40,000 엔티티에서 1초 이내 (O(n) ~ O(n log n))
    """
    if not boxes:
        return []
    if gap <= 0:
        gap = 1.0

    n = len(boxes)
    parent = list(range(n))
    rank = [0] * n

    def find(i):
        p = parent[i]
        while p != parent[p]:
            parent[p] = parent[parent[p]]
            p = parent[p]
        return p

    def union(i, j):
        ri, rj = find(i), find(j)
        if ri != rj:
            if rank[ri] < rank[rj]:
                parent[ri] = rj
            elif rank[ri] > rank[rj]:
                parent[rj] = ri
            else:
                parent[rj] = ri
                rank[ri] += 1

    inv_gap = 1.0 / gap
    grid = {}  # key -> list of box indices

    for i, (x0, y0, x1, y1) in enumerate(boxes):
        gx0 = int(math.floor(x0 * inv_gap))
        gy0 = int(math.floor(y0 * inv_gap))
        gx1 = int(math.floor(x1 * inv_gap))
        gy1 = int(math.floor(y1 * inv_gap))

        # 큰 박스로 인한 과도한 셀 생성 방지
        gx1 = min(gx1, gx0 + 50)
        gy1 = min(gy1, gy0 + 50)

        for gx in range(gx0, gx1 + 1):
            for gy in range(gy0, gy1 + 1):
                key = (gx, gy)
                cell = grid.get(key)
                if cell is None:
                    grid[key] = [i]
                else:
                    union(i, cell[0])
                    cell.append(i)

    # 인접 셀 간 병합: 4개 전방 이웃 (1, 0), (0, 1), (1, 1), (1, -1)
    nbr_offsets = ((1, 0), (0, 1), (1, 1), (1, -1))
    for (gx, gy), cell_items in grid.items():
        rep_a = cell_items[0]
        root_a = find(rep_a)
        for dx, dy in nbr_offsets:
            nkey = (gx + dx, gy + dy)
            n_items = grid.get(nkey)
            if n_items is not None:
                rep_b = n_items[0]
                if root_a != find(rep_b):
                    matched = False
                    for idx_a in cell_items:
                        ax0, ay0, ax1, ay1 = boxes[idx_a]
                        for idx_b in n_items:
                            bx0, by0, bx1, by1 = boxes[idx_b]
                            if max(0.0, max(ax0, bx0) - min(ax1, bx1)) <= gap and max(0.0, max(ay0, by0) - min(ay1, by1)) <= gap:
                                union(rep_a, rep_b)
                                root_a = find(rep_a)
                                matched = True
                                break
                        if matched:
                            break

    comp_map = {}
    for i in range(n):
        r = find(i)
        comp_map.setdefault(r, []).append(i)

    results = []
    for root, indices in comp_map.items():
        bx0 = min(boxes[i][0] for i in indices)
        by0 = min(boxes[i][1] for i in indices)
        bx1 = max(boxes[i][2] for i in indices)
        by1 = max(boxes[i][3] for i in indices)
        results.append({'bbox': (bx0, by0, bx1, by1), 'indices': indices})

    results.sort(key=lambda c: (c['bbox'][2] - c['bbox'][0]) * (c['bbox'][3] - c['bbox'][1]), reverse=True)
    return results

