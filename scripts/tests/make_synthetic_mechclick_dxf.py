#!/usr/bin/env python3
"""
합성 DXF 픽스처 생성기 (메카클릭 프록시 도곽 + 익명 단품 시트 블록 + 그룹핑 박스 재현)

실제 DWG(2503-021_sample_1)의 구조적 특징만 재현합니다:
  - 메인 조립도 도곽/표제란 = 내부 엔티티 0개인 프록시 블록 INSERT (MCL_DRAWFORM2)
  - 표제란 텍스트는 모델 공간 우하단(X 31,500~48,600 / Y 1,000~4,200)에 잔존
  - 우측 단품 시트 = 익명 블록 A$C645fd8c3 (107개) / A$Cbc27a0ff (4개), 420x297 도곽
  - 단품 시트들을 묶는 대형 폴리라인 그룹핑 박스 12개

사용법: python scripts/tests/make_synthetic_mechclick_dxf.py <out.dxf> [--form-scale 40|1]
"""
import sys
import math
import ezdxf


def build(out_path: str, form_scale: float = 40.0):
    doc = ezdxf.new('R2018')
    if 'Defpoints' not in doc.layers:
        doc.layers.add('Defpoints')
    doc.layers.add('FRAME', color=7)
    doc.layers.add('PART', color=7)
    msp = doc.modelspace()

    # ---------- 1) 메인 조립도: 빈 프록시 블록 ----------
    doc.blocks.new(name='MCL_DRAWFORM2')  # 내부 엔티티 0개
    msp.add_blockref('MCL_DRAWFORM2', (500.0, 500.0),
                     dxfattribs={'xscale': form_scale, 'yscale': form_scale, 'layer': 'FRAME'})

    # 메인 기하 클러스터 (A0 x40 = 47,560 x 33,640 안에 들어가는 크기)
    for i in range(12):
        x0 = 3000 + i * 3200
        msp.add_lwpolyline([(x0, 8000), (x0 + 2600, 8000), (x0 + 2600, 26000), (x0, 26000)],
                           close=True, dxfattribs={'layer': 'PART'})
        msp.add_circle((x0 + 1300, 17000), 900, dxfattribs={'layer': 'PART', 'color': 4})
    msp.add_line((2500, 7000), (42000, 7000), dxfattribs={'layer': 'PART', 'color': 1})
    msp.add_line((2500, 27500), (42000, 27500), dxfattribs={'layer': 'PART', 'color': 1})

    # 표제란 텍스트 (우하단 잔존)
    rows = [4200, 3500, 2800, 2100, 1500, 1000]
    cols = [31500, 34500, 37800, 41500, 44800, 47000]
    labels = [
        ['CUSTOMER', '가온기계(주)', 'PROJECT NO.', '2503-021', 'REV', 'R00'],
        ['TITLE', 'DIVERTER CONVEYOR ASS\'Y', 'DWG NO.', '2503-021-00-000', 'SHEET', '1/1'],
        ['DESIGN', '홍길동', 'CHECK', '김철수', 'APPROVE', '박영희'],
        ['DATE', '2025-03-21', 'SCALE', '1/40', 'UNIT', 'mm'],
        ['MATERIAL', '-', 'FINISH', '-', 'SIZE', 'A0'],
        ['명진 인터내쇼날(주)', '', 'PLOT DATE', '2025-10-23', '', ''],
    ]
    for r, y in enumerate(rows):
        for c, x in enumerate(cols):
            t = labels[r][c]
            if not t:
                continue
            msp.add_text(t, dxfattribs={'height': 140.0, 'layer': 'FRAME', 'color': 7}).set_placement((x, y))
    # 최우측 텍스트 끝점 ≈ 48,600
    msp.add_text('A0', dxfattribs={'height': 140.0, 'layer': 'FRAME'}).set_placement((48400, 1000))

    # ---------- 2) 단품 시트 익명 블록 ----------
    def make_sheet_block(name, use_lines):
        blk = doc.blocks.new(name=name)
        if use_lines:
            for (a, b) in [((0, 0), (420, 0)), ((420, 0), (420, 297)), ((420, 297), (0, 297)), ((0, 297), (0, 0))]:
                blk.add_line(a, b, dxfattribs={'layer': 'Defpoints', 'color': 2})
        else:
            blk.add_lwpolyline([(0, 0), (420, 0), (420, 297), (0, 297)], close=True,
                               dxfattribs={'layer': 'Defpoints', 'color': 2})
        # 여백선 (color 40, layer 0)
        blk.add_lwpolyline([(10, 10), (410, 10), (410, 287), (10, 287)], close=True,
                           dxfattribs={'layer': '0', 'color': 40})
        # 표제란 격자 (우하단 180x40)
        tb_x0, tb_y0, tb_x1, tb_y1 = 230, 10, 410, 50
        blk.add_line((tb_x0, tb_y1), (tb_x1, tb_y1), dxfattribs={'layer': '0'})
        blk.add_line((tb_x0, tb_y0), (tb_x0, tb_y1), dxfattribs={'layer': '0'})
        for yy in (23, 36):
            blk.add_line((tb_x0, yy), (tb_x1, yy), dxfattribs={'layer': '0'})
        for xx in (290, 350):
            blk.add_line((xx, tb_y0), (xx, tb_y1), dxfattribs={'layer': '0'})
        blk.add_text('DWG NO.', dxfattribs={'height': 4.0}).set_placement((233, 40))
        blk.add_text('TITLE', dxfattribs={'height': 4.0}).set_placement((233, 27))
        blk.add_text('MATERIAL', dxfattribs={'height': 4.0}).set_placement((233, 14))
        blk.add_text('SCALE', dxfattribs={'height': 4.0}).set_placement((353, 14))
        return blk

    make_sheet_block('A$C645fd8c3', use_lines=False)
    make_sheet_block('A$Cbc27a0ff', use_lines=True)

    # ---------- 3) 111개 INSERT + 12개 그룹핑 박스 ----------
    inserted = 0
    part_no = 1
    group_boxes = 0
    base_x, base_y = 70000, 500
    for g in range(12):
        gx = base_x + (g % 4) * 2400
        gy = base_y + (g // 4) * 1700
        per_group = 10 if g < 11 else 1
        cols_n = 5
        sheet_positions = []
        for k in range(per_group):
            sx = gx + 60 + (k % cols_n) * 460
            sy = gy + 60 + (k // cols_n) * 340
            bname = 'A$Cbc27a0ff' if inserted >= 107 else 'A$C645fd8c3'
            msp.add_blockref(bname, (sx, sy), dxfattribs={'layer': 'FRAME'})
            # 시트 내부 단품 기하 + 표제란 값
            msp.add_circle((sx + 150, sy + 170), 60, dxfattribs={'layer': 'PART'})
            msp.add_text(f'2503-021-01-{part_no:03d}', dxfattribs={'height': 4.0}).set_placement((sx + 292, sy + 40))
            msp.add_text(f'BRACKET-{part_no}', dxfattribs={'height': 4.0}).set_placement((sx + 292, sy + 27))
            msp.add_text('SS400', dxfattribs={'height': 4.0}).set_placement((sx + 292, sy + 14))
            sheet_positions.append((sx, sy))
            inserted += 1
            part_no += 1
        # 그룹핑 박스 (w > 500, h > 400)
        bw = 60 + cols_n * 460
        bh = 60 + ((per_group + cols_n - 1) // cols_n) * 340 + 40
        msp.add_lwpolyline([(gx, gy), (gx + bw, gy), (gx + bw, gy + bh), (gx, gy + bh)], close=True,
                           dxfattribs={'layer': 'FRAME', 'color': 7})
        group_boxes += 1

    doc.saveas(out_path)
    return {'inserts': inserted, 'group_boxes': group_boxes}


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    scale = 40.0
    if '--form-scale' in sys.argv:
        scale = float(sys.argv[sys.argv.index('--form-scale') + 1])
    print(build(sys.argv[1], scale))
