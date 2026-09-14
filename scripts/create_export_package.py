#!/usr/bin/env python3
"""
CADON-BOM SERVER POC - Export Complete Case Archive Package (ZIP)
Bundles DWG + DXF + Title Block JSON + BOM JSON + Summary into a single ZIP archive.
"""
import sys
import os
import json
import zipfile
import time

def create_package(case_dir: str, output_zip_path: str, manifest: dict):
    os.makedirs(os.path.dirname(output_zip_path), exist_ok=True)
    
    with zipfile.ZipFile(output_zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        # 1. Add Original DWG if exists
        dwg_path = manifest.get('dwg_path')
        if dwg_path and os.path.exists(dwg_path):
            zf.write(dwg_path, arcname=f"01_Original_CAD/{os.path.basename(dwg_path)}")
            
        # 2. Add Converted DXF if exists
        dxf_path = manifest.get('dxf_path')
        if dxf_path and os.path.exists(dxf_path):
            zf.write(dxf_path, arcname=f"02_Vector_DXF/{os.path.basename(dxf_path)}")
            
        # 3. Add Title Block Metadata JSON
        title_blocks = manifest.get('title_blocks', [])
        zf.writestr(
            "03_Metadata/title_blocks_metadata.json",
            json.dumps(title_blocks, ensure_ascii=False, indent=2)
        )
        
        # 4. Add BOM Items JSON
        bom_items = manifest.get('bom_items', [])
        zf.writestr(
            "03_Metadata/bom_items_summary.json",
            json.dumps(bom_items, ensure_ascii=False, indent=2)
        )
        
        # 5. Add Human Readable Summary Text
        case_info = manifest.get('case_info', {})
        summary_text = f"""=======================================================
CADON-BOM AI - 견적 도면 및 다단계 BOM 분석 보관 패키지
=======================================================
* 프로젝트명: {case_info.get('project_name', '-')}
* 견적건명: {case_info.get('case_name', '-')} (도번: {case_info.get('case_no', '-')})
* 고객사: {case_info.get('customer', '-')}
* 설계자: {case_info.get('designer', '-')} (일자: {case_info.get('design_date', '-')})
* 제조사: {case_info.get('company', '-')}
* 보관일시: {time.strftime('%Y-%m-%d %H:%M:%S')}
* 총 도면 수량: {len(title_blocks)}개 시트 및 부품도
* 총 BOM 품목: {len(bom_items)}개 산출 부품
=======================================================
"""
        zf.writestr("00_READ_ME_보관요약.txt", summary_text)
        
    return {
        "status": "SUCCESS",
        "zip_path": output_zip_path,
        "zip_size": os.path.getsize(output_zip_path)
    }

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: create_export_package.py <manifest_json_path> <output_zip_path>"}))
        sys.exit(1)
        
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        manifest_data = json.load(f)
        
    res = create_package(os.getcwd(), sys.argv[2], manifest_data)
    print(json.dumps(res, ensure_ascii=False))
