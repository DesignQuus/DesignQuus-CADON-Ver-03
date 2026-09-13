#!/usr/bin/env python3
"""
CADON-BOM SERVER POC - PROMPT 18 / 18-R1 / 18-R2
DWG Input Adapter & LibreDWG Converter Provider
No Mock / No Simulation
"""
import os
import sys
import json
import time
import hashlib
import subprocess
import shutil

DWG_CONVERTER_PATH = os.environ.get("LIBREDWG_PATH", r"C:\tools\libredwg\dwg2dxf.exe")

def calculate_sha256(filepath: str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def validate_dwg_header(filepath: str) -> dict:
    if not os.path.exists(filepath):
        return {"valid": False, "error": "FILE_NOT_FOUND"}
    
    size = os.path.getsize(filepath)
    if size < 6:
        return {"valid": False, "error": "FILE_TOO_SMALL"}
    
    with open(filepath, "rb") as f:
        magic = f.read(6)
    
    magic_str = magic.decode("ascii", errors="ignore")
    # Known DWG signatures: AC1015 (2000), AC1018 (2004), AC1021 (2007), AC1024 (2010), AC1027 (2013), AC1032 (2018), etc.
    if magic_str.startswith("AC10") or magic_str in ["MC0.0", "AC1.2", "AC1.4", "AC2.10", "AC2.21", "AC2.22", "AC1002", "AC1003", "AC1004", "AC1006", "AC1009", "AC1012", "AC1014"]:
        return {
            "valid": True,
            "signature": magic_str,
            "file_size": size,
            "version": magic_str
        }
    return {
        "valid": False,
        "signature": magic_str,
        "error": "INVALID_DWG_SIGNATURE"
    }

def sanitize_dxf_zero_handles(input_dxf: str, output_dxf: str):
    """Sanitize zero handles and unclosed polylines from LibreDWG converted DXF so ezdxf can load cleanly."""
    try:
        with open(input_dxf, "r", encoding="utf-8", errors="surrogateescape") as f:
            raw_lines = [l.rstrip("\r\n") for l in f]
    except Exception:
        with open(input_dxf, "r", encoding="latin1", errors="ignore") as f:
            raw_lines = [l.rstrip("\r\n") for l in f]
        
    pairs = []
    i = 0
    n = len(raw_lines)
    while i < n - 1:
        pairs.append((raw_lines[i], raw_lines[i+1]))
        i += 2
        
    out_pairs = []
    in_polyline = False
    handle_gen = 0xF00000
    
    for code_str, val_str in pairs:
        code = code_str.strip()
        val = val_str.strip()
        
        if code == "0":
            val_upper = val.upper()
            if in_polyline:
                if val_upper in ["VERTEX", "SEQEND"]:
                    if val_upper == "SEQEND":
                        in_polyline = False
                else:
                    # Missing SEQEND before this new entity
                    handle_gen += 1
                    out_pairs.append(("0", "SEQEND"))
                    out_pairs.append(("5", f"{handle_gen:X}"))
                    out_pairs.append(("8", "0"))
                    out_pairs.append(("100", "AcDbEntity"))
                    in_polyline = False
                    
            if val_upper == "POLYLINE":
                in_polyline = True
                
        # Fix zero handles
        if code == "5" and val == "0":
            handle_gen += 1
            val_str = f"{handle_gen:X}"
            
        out_pairs.append((code_str, val_str))
        
    if in_polyline:
        handle_gen += 1
        out_pairs.append(("0", "SEQEND"))
        out_pairs.append(("5", f"{handle_gen:X}"))
        out_pairs.append(("8", "0"))
        out_pairs.append(("100", "AcDbEntity"))
        
    with open(output_dxf, "w", encoding="utf-8", errors="surrogateescape") as f:
        for c, v in out_pairs:
            f.write(f"{c}\n{v}\n")

def convert_dwg_to_dxf(dwg_path: str, output_dxf_path: str, timeout_sec: int = 120) -> dict:
    start_time = time.time()
    
    # 1. Validation of Source DWG
    val = validate_dwg_header(dwg_path)
    if not val["valid"]:
        return {
            "status": "INVALID_DWG",
            "error_code": val.get("error", "INVALID_DWG"),
            "message": f"DWG header check failed: {val.get('signature', 'unknown')}",
            "duration_ms": int((time.time() - start_time) * 1000)
        }
    
    source_sha_before = calculate_sha256(dwg_path)
    
    # 2. Check Converter Executable (Priority: ENV > Project tools/libredwg > C:\tools\libredwg > PATH)
    candidate_paths = [
        os.environ.get("LIBREDWG_PATH", ""),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools", "libredwg", "dwg2dxf.exe"),
        r"C:\tools\libredwg\dwg2dxf.exe",
        shutil.which("dwg2dxf") or ""
    ]
    converter_exe = None
    for cp in candidate_paths:
        if cp and os.path.exists(cp):
            converter_exe = cp
            break

    if not converter_exe:
        return {
            "status": "CONVERTER_NOT_AVAILABLE",
            "error_code": "CONVERTER_NOT_AVAILABLE",
            "message": f"LibreDWG executable not found. Checked: {candidate_paths}",
            "duration_ms": int((time.time() - start_time) * 1000)
        }
    
    # 3. Create temp workspace
    temp_dir = os.path.join(os.path.dirname(output_dxf_path), "temp_convert_" + str(int(time.time()*1000)))
    os.makedirs(temp_dir, exist_ok=True)
    raw_output_dxf = os.path.join(temp_dir, "raw_output.dxf")
    
    try:
        # Do not force --as r2000 downgrade! Preserving modern blocks (r2018/native) keeps blocks 2 & 3 intact.
        cmd = [converter_exe, "-y", "-o", raw_output_dxf, dwg_path]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout_sec)
        
        # Verify source DWG was not modified
        source_sha_after = calculate_sha256(dwg_path)
        if source_sha_before != source_sha_after:
            raise RuntimeError("Source DWG was modified during conversion!")
        
        if not os.path.exists(raw_output_dxf) or os.path.getsize(raw_output_dxf) == 0:
            return {
                "status": "DXF_NOT_CREATED",
                "error_code": "DXF_NOT_CREATED",
                "exit_code": res.returncode,
                "stderr": res.stderr[:500],
                "message": "Converter did not generate valid DXF output",
                "duration_ms": int((time.time() - start_time) * 1000)
            }
        
        # Verify it's not a fake rename
        dxf_sha = calculate_sha256(raw_output_dxf)
        if dxf_sha == source_sha_before:
            return {
                "status": "DXF_VALIDATION_FAILED",
                "error_code": "FAKE_CONVERSION_DETECTED",
                "message": "Output DXF is an identical binary copy of source DWG",
                "duration_ms": int((time.time() - start_time) * 1000)
            }
        
        # Sanitize zero handles for compatibility with ezdxf
        sanitize_dxf_zero_handles(raw_output_dxf, output_dxf_path)
        
        # Quick validation with ezdxf
        from ezdxf import recover
        import io
        import contextlib
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            doc, auditor = recover.readfile(output_dxf_path)
            entity_count = len(list(doc.modelspace()))
        
        warnings = [str(w) for w in auditor.errors]
        
        return {
            "status": "CONVERTED" if not warnings else "CONVERTED_WITH_WARNINGS",
            "source_dwg_size": val["file_size"],
            "source_dwg_signature": val["signature"],
            "derived_dxf_size": os.path.getsize(output_dxf_path),
            "derived_dxf_sha256": calculate_sha256(output_dxf_path),
            "entity_count": entity_count,
            "warning_count": len(warnings),
            "warnings": warnings[:10],
            "duration_ms": int((time.time() - start_time) * 1000),
            "converter_version": "GNU LibreDWG dwg2dxf 0.14",
            "provider": "LIBREDWG"
        }
        
    except subprocess.TimeoutExpired:
        return {
            "status": "TIMEOUT",
            "error_code": "DWG_CONVERSION_TIMEOUT",
            "message": f"Conversion timed out after {timeout_sec}s",
            "duration_ms": int((time.time() - start_time) * 1000)
        }
    except Exception as e:
        return {
            "status": "CONVERSION_FAILED",
            "error_code": "DWG_CONVERSION_FAILED",
            "message": str(e),
            "duration_ms": int((time.time() - start_time) * 1000)
        }
    finally:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: dwg_converter.py <source_dwg> <output_dxf>"}))
        sys.exit(1)
    
    src = sys.argv[1]
    dst = sys.argv[2]
    res = convert_dwg_to_dxf(src, dst)
    print(json.dumps(res, ensure_ascii=False, indent=2))
