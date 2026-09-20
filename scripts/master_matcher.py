#!/usr/bin/env python3
"""
CADON-BOM SERVER POC - PROMPT 12
Master Candidate Search & Standard BOM Matching Engine
Updated for Phase 1-B: DB-based matching with positive/negative evidence scoring.
"""
import sys
import os
import json
import time

# Windows 콘솔 및 파이프 UTF-8 강제 설정
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def score_candidate(item: dict, master: dict) -> dict:
    score = 0
    pos_evidence = []
    neg_evidence = []
    
    norm_name = (item.get("normalized_name") or item.get("raw_name") or "").strip().upper()
    search_name = (item.get("search_name") or norm_name).strip().upper()
    m_code = (master.get("master_code") or "").strip().upper()
    m_name = (master.get("standard_name") or "").strip().upper()
    category = (master.get("category") or "").strip().upper()
    
    # 1. Alias Matching (Highest Priority)
    aliases = master.get("aliases", [])
    matched_alias = None
    for a in aliases:
        anorm = (a.get("alias_normalized") or a.get("alias_name") or "").strip().upper()
        if anorm and (anorm == norm_name or anorm == search_name):
            matched_alias = a
            break
            
    if matched_alias:
        app_cnt = matched_alias.get("approval_count", 1)
        bonus = min(app_cnt * 2, 10)
        alias_score = 50 + bonus
        score += alias_score
        pos_evidence.append(f"별칭 일치: '{matched_alias.get('alias_name')}' (+50점, 승인이력 {app_cnt}건 반영 +{bonus}점)")
    else:
        # 2. Exact / Partial Code Match
        if m_code and (m_code == norm_name or m_code == search_name):
            score += 45
            pos_evidence.append(f"마스터 코드 정확 일치: [{m_code}] (+45점)")
        elif m_code and len(m_code) >= 3 and (m_code in norm_name or m_code in search_name):
            score += 30
            pos_evidence.append(f"마스터 코드 부분 일치: [{m_code}] (+30점)")
            
        # 3. Standard Name Similarity
        if m_name and (m_name == norm_name or norm_name == m_name):
            score += 35
            pos_evidence.append(f"표준 품명 정확 일치: '{m_name}' (+35점)")
        elif m_name:
            # Token Overlap
            item_toks = set([t for t in search_name.replace('-', ' ').replace('_', ' ').split() if len(t) > 1])
            master_toks = set([t for t in m_name.replace('-', ' ').replace('_', ' ').split() if len(t) > 1])
            overlap = item_toks.intersection(master_toks)
            if overlap:
                tok_score = min(len(overlap) * 12, 30)
                score += tok_score
                pos_evidence.append(f"품명 키워드 일치: {', '.join(overlap)} (+{tok_score}점)")

    # 4. Material Check
    item_mat = (item.get("material_candidate") or "").strip().upper()
    master_mat = (master.get("material") or "").strip().upper()
    
    # 구매품이거나 마스터 재질이 미지정인 경우 재질 불일치 감점 면제
    if category in ("PURCHASED_STD", "COMMERCIAL") or not master_mat or master_mat == "-":
        if item_mat and master_mat and item_mat == master_mat:
            score += 10
            pos_evidence.append(f"재질 일치: {master_mat} (+10점)")
    else:
        if item_mat and master_mat:
            if item_mat == master_mat or (item_mat in master_mat) or (master_mat in item_mat):
                score += 15
                pos_evidence.append(f"재질 일치: {master_mat} (+15점)")
            else:
                score -= 10
                neg_evidence.append(f"재질 불일치 (도면: {item_mat} vs 마스터: {master_mat}, -10점)")

    # 5. Direction Check (방향 일치/불일치)
    item_dir = item.get("direction")
    if item_dir:
        item_dir_up = str(item_dir).upper()
        if item_dir_up in m_code or item_dir_up in m_name:
            score += 10
            pos_evidence.append(f"방향 일치: {item_dir_up} (+10점)")
        elif "LH" in m_name or "RH" in m_name:
            score -= 15
            neg_evidence.append(f"방향 불일치 (도면: {item_dir_up} vs 마스터, -15점)")

    return {
        "master_id": master.get("id"),
        "master_code": master.get("master_code"),
        "standard_name": master.get("standard_name"),
        "specification": master.get("specification", "-"),
        "material": master.get("material", "-"),
        "unit": master.get("unit", "EA"),
        "total_score": max(0, min(100, score)),
        "positive_evidence": pos_evidence,
        "negative_evidence": neg_evidence
    }

def match_master_candidates(normalized_data: dict, master_list: list = None) -> dict:
    start_time = time.time()
    items = normalized_data.get("normalized_items", [])
    masters = master_list or []
    
    matched_results = []
    
    for item in items:
        candidates = []
        for m in masters:
            res = score_candidate(item, m)
            if res["total_score"] >= 25:
                candidates.append(res)
                
        candidates.sort(key=lambda c: c["total_score"], reverse=True)
        top3 = candidates[:3]
        
        # Determine status
        if not top3:
            status = "NO_MATCH"
        elif len(top3) >= 2 and (top3[0]["total_score"] - top3[1]["total_score"] < 5):
            status = "AMBIGUOUS"
        else:
            status = "MATCH_FOUND"
            
        matched_results.append({
            "item_id": item.get("id"),
            "raw_name": item.get("raw_name"),
            "normalized_name": item.get("normalized_name"),
            "spec_candidate": item.get("spec_candidate"),
            "material_candidate": item.get("material_candidate"),
            "quantity": item.get("quantity", 1.0),
            "unit": item.get("unit", "EA"),
            "status": status,
            "top_candidates": top3,
            "selected_master": top3[0] if top3 and status == "MATCH_FOUND" else None
        })
        
    return {
        "status": "SUCCESS",
        "total_items": len(matched_results),
        "results": matched_results,
        "duration_ms": int((time.time() - start_time) * 1000)
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: master_matcher.py <normalized_json> [masters_json]"}))
        sys.exit(1)
        
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        norm = json.load(f)
        
    masters = None
    if len(sys.argv) > 2 and os.path.exists(sys.argv[2]):
        with open(sys.argv[2], "r", encoding="utf-8") as f:
            masters = json.load(f)
            
    res = match_master_candidates(norm, masters)
    print(json.dumps(res, ensure_ascii=False, indent=2))
