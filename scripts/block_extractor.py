#!/usr/bin/env python3
"""
CADON Block & Smart Block Metadata Extractor
Extracts Standard Blocks, Attribute Blocks (ATTRIB/ATTDEF), and Dynamic Blocks (*U...)
from DXF files with hardware/purchase-part detection.
"""
import sys
import os
import json
import re
import time

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

try:
    import ezdxf
    from ezdxf import recover
except ImportError:
    ezdxf = None

# Hardware / Purchase part regex keywords
HARDWARE_PATTERN = re.compile(
    r'(BOLT|NUT|SCREW|WASHER|BEARING|PIN|FITTING|CYLINDER|SENSOR|VALVE|'
    r'MOTOR|ROLLER|JOINT|SPRING|BUSH|O-RING|ORING|PLUG|NIPPLE|FLANGE|'
    r'CLAMP|COUPLING|KEY|RETAINER|ELBOW|UNION|TEE|SOCKET|M\d+|SUS-BOLT|HEX)',
    re.IGNORECASE
)

def clean_text(raw):
    if not raw:
        return ""
    # Remove CAD formatting like \A1;, \P, %%c, etc.
    t = str(raw)
    t = re.sub(r'\\A\d+;', '', t)
    t = re.sub(r'\\[WwHh]\d+(\.\d+)?;', '', t)
    t = re.sub(r'\\P', ' ', t)
    t = re.sub(r'%%[cCdDpP]', '', t)
    t = re.sub(r'\{|\}', '', t)
    t = re.sub(r'\\f[^;]+;', '', t)
    return t.strip()

def extract_blocks_from_dxf(dxf_path: str) -> dict:
    start_time = time.time()
    if not ezdxf:
        return {"status": "ERROR", "message": "ezdxf library is not installed"}

    if not os.path.exists(dxf_path):
        return {"status": "ERROR", "message": f"DXF file not found: {dxf_path}"}

    # Load DXF with fallback
    doc = None
    try:
        doc = ezdxf.readfile(dxf_path, errors='ignore')
    except Exception:
        try:
            doc = ezdxf.readfile(dxf_path, encoding='cp949', errors='ignore')
        except Exception:
            try:
                doc = ezdxf.readfile(dxf_path, encoding='latin1', errors='ignore')
            except Exception:
                try:
                    doc, _ = recover.readfile(dxf_path)
                except Exception as ex:
                    return {"status": "ERROR", "message": f"Failed to open DXF: {str(ex)}"}

    if not doc:
        return {"status": "ERROR", "message": "Could not read DXF document"}

    msp = doc.modelspace()
    
    # 1. Analyze Block Definitions in doc.blocks
    block_definitions = {}
    for block in doc.blocks:
        bname = block.name
        is_anonymous = bname.startswith('*')
        is_dynamic = bname.startswith('*U')
        
        # Check sub-entities in block definition for ATTDEF or special features
        attdefs = []
        entity_types = {}
        for sub_e in block:
            st = sub_e.dxftype()
            entity_types[st] = entity_types.get(st, 0) + 1
            if st == 'ATTDEF':
                attdefs.append({
                    "tag": getattr(sub_e.dxf, 'tag', ''),
                    "prompt": getattr(sub_e.dxf, 'prompt', ''),
                    "default": clean_text(getattr(sub_e.dxf, 'text', ''))
                })
                
        block_definitions[bname] = {
            "name": bname,
            "is_anonymous": is_anonymous,
            "is_dynamic": is_dynamic,
            "attdefs": attdefs,
            "has_attdef": len(attdefs) > 0,
            "sub_entity_counts": entity_types
        }

    # 2. Iterate Modelspace INSERT Entities
    blocks_catalog = {}
    total_inserts = 0

    for e in msp:
        if e.dxftype() != 'INSERT':
            continue

        total_inserts += 1
        bname = getattr(e.dxf, 'name', 'UNKNOWN_BLOCK')
        layer = getattr(e.dxf, 'layer', '0')
        ins = getattr(e.dxf, 'insert', (0.0, 0.0, 0.0))
        rot = getattr(e.dxf, 'rotation', 0.0)
        sx = getattr(e.dxf, 'xscale', 1.0)
        sy = getattr(e.dxf, 'yscale', 1.0)

        # Extract attributes on the INSERT instance (ATTRIB)
        attrib_map = {}
        attrib_list = []
        for att in getattr(e, 'attribs', []):
            tag = clean_text(getattr(att.dxf, 'tag', ''))
            val = clean_text(getattr(att.dxf, 'text', ''))
            if tag:
                attrib_map[tag] = val
                attrib_list.append({"tag": tag, "value": val})

        # Determine Block Classification Type
        b_def = block_definitions.get(bname, {})
        is_dynamic = bname.startswith('*U') or b_def.get("is_dynamic", False)
        has_attribs = len(attrib_map) > 0 or b_def.get("has_attdef", False)

        if has_attribs:
            b_type = "ATTRIBUTE"
        elif is_dynamic:
            b_type = "DYNAMIC"
        else:
            b_type = "STANDARD"

        # Check Hardware / Purchase Part candidate
        is_hw = bool(HARDWARE_PATTERN.search(bname))
        if not is_hw:
            # Check attribute tags or values
            for k, v in attrib_map.items():
                if HARDWARE_PATTERN.search(k) or HARDWARE_PATTERN.search(v):
                    is_hw = True
                    break

        # Group into blocks_catalog
        if bname not in blocks_catalog:
            blocks_catalog[bname] = {
                "name": bname,
                "type": b_type,
                "count": 0,
                "layers": set(),
                "is_dynamic": is_dynamic,
                "is_hardware": is_hw,
                "attribute_tags": set(),
                "sample_attributes": {},
                "instances": []
            }

        cat = blocks_catalog[bname]
        cat["count"] += 1
        cat["layers"].add(layer)
        for t, v in attrib_map.items():
            cat["attribute_tags"].add(t)
            if t not in cat["sample_attributes"] and v:
                cat["sample_attributes"][t] = v

        # Store compact instance (up to 50 instances per block to keep payload lightweight)
        if len(cat["instances"]) < 50:
            cat["instances"].append({
                "x": round(ins[0], 2),
                "y": round(ins[1], 2),
                "scale_x": round(sx, 3),
                "scale_y": round(sy, 3),
                "rotation": round(rot, 1),
                "layer": layer,
                "attribs": attrib_map
            })

    # 3. Format and Sort Catalog
    formatted_blocks = []
    attrib_count = 0
    dynamic_count = 0
    standard_count = 0
    hardware_count = 0

    for bname, cat in blocks_catalog.items():
        if cat["type"] == "ATTRIBUTE":
            attrib_count += 1
        elif cat["type"] == "DYNAMIC":
            dynamic_count += 1
        else:
            standard_count += 1

        if cat["is_hardware"]:
            hardware_count += 1

        formatted_blocks.append({
            "name": bname,
            "type": cat["type"],
            "count": cat["count"],
            "layers": sorted(list(cat["layers"])),
            "is_dynamic": cat["is_dynamic"],
            "is_hardware": cat["is_hardware"],
            "attribute_tags": sorted(list(cat["attribute_tags"])),
            "sample_attributes": cat["sample_attributes"],
            "instances": cat["instances"]
        })

    # Sort blocks by count descending
    formatted_blocks.sort(key=lambda x: (0 if x["is_hardware"] else 1, -x["count"]))

    duration_ms = int((time.time() - start_time) * 1000)

    return {
        "status": "SUCCESS",
        "dxf_path": dxf_path,
        "duration_ms": duration_ms,
        "summary": {
            "total_insert_count": total_inserts,
            "unique_block_count": len(formatted_blocks),
            "attribute_block_count": attrib_count,
            "dynamic_block_count": dynamic_count,
            "standard_block_count": standard_count,
            "hardware_candidate_count": hardware_count
        },
        "blocks": formatted_blocks
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
        print(json.dumps({"status": "ERROR", "message": "Usage: block_extractor.py <file.dxf> [output.json]"}))
        sys.exit(1)

    input_dxf = sys.argv[1]
    res = extract_blocks_from_dxf(input_dxf)
    clean_res = sanitize_unicode(res)

    if len(sys.argv) > 2:
        out_json = sys.argv[2]
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump(clean_res, f, ensure_ascii=False, indent=2)
        print(json.dumps({"status": "SUCCESS", "saved_to": out_json, "summary": clean_res.get("summary")}))
    else:
        print(json.dumps(clean_res, ensure_ascii=False))
