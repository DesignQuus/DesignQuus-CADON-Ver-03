import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { db, insertRows, queryTable } from './db';
import { getStorageSubdir, resolveStoragePath } from './storage';

const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');

function runPythonScript(scriptName: string, args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SCRIPTS_DIR, scriptName);
    const proc = spawn('python', [scriptPath, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString('utf-8');
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString('utf-8');
    });

    proc.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        return reject(new Error(`Script ${scriptName} failed (code ${code}): ${stderr}`));
      }
      try {
        const jsonStart = stdout.indexOf('{');
        const jsonEnd = stdout.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const jsonStr = stdout.substring(jsonStart, jsonEnd + 1);
          resolve(JSON.parse(jsonStr));
        } else {
          resolve(JSON.parse(stdout.trim()));
        }
      } catch {
        resolve({ raw_output: stdout, error: stderr });
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

export async function processCadFilePipeline(
  quotationCaseId: string,
  sourceFileId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const file = (await db.prepare('SELECT * FROM uploaded_files WHERE id = ?').get(sourceFileId)) as any;
  if (!file) {
    return { success: false, error: 'FILE_NOT_FOUND' };
  }

  let effectiveDxfPath = file.storage_path;
  const now = new Date().toISOString();
  const tempDir = getStorageSubdir('temp');

  // 1. If DWG, run DWG Input Adapter (PROMPT 18 / 18-R1 / 18-R2)
  if (file.file_type === 'DWG') {
    const derivedStorageDir = getStorageSubdir('derived');
    const derivedFileName = `${path.parse(file.stored_file_name).name}__converted.dxf`;
    const derivedDxfPath = path.join(derivedStorageDir, derivedFileName);

    const convRunId = `conv_${Date.now()}`;
    const absoluteSourcePath = resolveStoragePath(file.storage_path);
    const convResult = await runPythonScript('dwg_converter.py', [absoluteSourcePath, derivedDxfPath]);

    await db.prepare(`
      INSERT INTO dwg_conversion_runs (
        id, source_file_id, provider, converter_version, source_dwg_signature,
        status, started_at, completed_at, duration_ms, warning_count, warnings_json,
        error_code, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      convRunId, file.id, convResult.provider || 'LIBREDWG', convResult.converter_version || '0.14',
      convResult.source_dwg_signature || 'AC1015', convResult.status || 'CONVERTED',
      now, new Date().toISOString(), convResult.duration_ms || 100,
      convResult.warning_count || 0, JSON.stringify(convResult.warnings || []),
      convResult.error_code || null, convResult.message || null, now
    );

    if (convResult.status !== 'CONVERTED' && convResult.status !== 'CONVERTED_WITH_WARNINGS') {
      return { success: false, error: convResult.error_code || 'DWG_CONVERSION_FAILED' };
    }

    // Clean up any previous derived DXF files for this source DWG to prevent duplicate listing
    await db.prepare(`
      DELETE FROM uploaded_files
      WHERE quotation_case_id = ? AND derived_from_file_id = ? AND upload_status = 'CONVERTED'
    `).run(quotationCaseId, file.id);

    // Register Derived File
    const derivedFileId = `file_drv_${Date.now()}`;
    await db.prepare(`
      INSERT INTO uploaded_files (
        id, quotation_case_id, original_file_name, stored_file_name, storage_path,
        file_type, file_role, derived_from_file_id, file_size, checksum,
        upload_status, uploaded_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      derivedFileId, quotationCaseId, `${file.original_file_name}.dxf`, derivedFileName,
      derivedDxfPath, 'DXF', 'DERIVED', file.id, convResult.derived_dxf_size || 1000,
      convResult.derived_dxf_sha256 || 'checksum', 'CONVERTED', userId, now
    );

    await db.prepare('UPDATE dwg_conversion_runs SET derived_file_id = ? WHERE id = ?').run(derivedFileId, convRunId);
    effectiveDxfPath = derivedDxfPath;
  }

  // 2. Parse DXF (PROMPT 04)
  const absoluteDxfPath = resolveStoragePath(effectiveDxfPath);

  // 2-B. Start WebGL binary buffer & HD Vector SVG generation in parallel background (File-scoped isolation)
  const derivedStorageDir = getStorageSubdir('derived');
  fs.mkdirSync(derivedStorageDir, { recursive: true });

  const webglBinName = `${quotationCaseId}_${sourceFileId}__cad_webgl.bin`;
  const legacyWebglBinName = `${quotationCaseId}__cad_webgl.bin`;
  const webglBinPath = path.join(derivedStorageDir, webglBinName);
  const webglPromise = runPythonScript('cad_webgl_exporter.py', [absoluteDxfPath, webglBinPath])
    .then(() => {
      // Synchronize to workspace storage/derived as well & provide backward-compatible copy
      const localDerived = path.join(process.cwd(), 'storage', 'derived');
      fs.mkdirSync(localDerived, { recursive: true });

      const txtName = webglBinName.replace('__cad_webgl.bin', '__cad_texts.json');
      const rasterName = webglBinName.replace('__cad_webgl.bin', '__cad_rasters.json');
      const legacyTxtName = legacyWebglBinName.replace('__cad_webgl.bin', '__cad_texts.json');
      const legacyRasterName = legacyWebglBinName.replace('__cad_webgl.bin', '__cad_rasters.json');

      try {
        // Also provide case-level alias for single-file/backward compatibility
        const legacyBinPath = path.join(derivedStorageDir, legacyWebglBinName);
        fs.copyFileSync(webglBinPath, legacyBinPath);
        if (localDerived !== derivedStorageDir) {
          fs.copyFileSync(webglBinPath, path.join(localDerived, webglBinName));
          fs.copyFileSync(webglBinPath, path.join(localDerived, legacyWebglBinName));
        }

        const srcTxt = path.join(derivedStorageDir, txtName);
        if (fs.existsSync(srcTxt)) {
          fs.copyFileSync(srcTxt, path.join(derivedStorageDir, legacyTxtName));
          if (localDerived !== derivedStorageDir) {
            fs.copyFileSync(srcTxt, path.join(localDerived, txtName));
            fs.copyFileSync(srcTxt, path.join(localDerived, legacyTxtName));
          }
        }

        const srcRaster = path.join(derivedStorageDir, rasterName);
        if (fs.existsSync(srcRaster)) {
          fs.copyFileSync(srcRaster, path.join(derivedStorageDir, legacyRasterName));
          if (localDerived !== derivedStorageDir) {
            fs.copyFileSync(srcRaster, path.join(localDerived, rasterName));
            fs.copyFileSync(srcRaster, path.join(localDerived, legacyRasterName));
          }
        }
      } catch (copyErr) {
        console.warn('WebGL storage sync warning:', copyErr);
      }
    })
    .catch((webglErr) => console.warn('WebGL binary export warning:', webglErr));

  const svgFileName = `${quotationCaseId}_${sourceFileId}__hd_vector.svg`;
  const legacySvgFileName = `${quotationCaseId}__hd_vector.svg`;
  const svgFilePath = path.join(derivedStorageDir, svgFileName);

  const svgPromise = runPythonScript('vector_svg_renderer.py', [absoluteDxfPath, svgFilePath])
    .then(async (svgResult) => {
      if (svgResult && svgResult.status === 'SUCCESS') {
        try {
          fs.copyFileSync(svgFilePath, path.join(derivedStorageDir, legacySvgFileName));
          const localDerived = path.join(process.cwd(), 'storage', 'derived');
          if (fs.existsSync(localDerived) && localDerived !== derivedStorageDir) {
            fs.copyFileSync(svgFilePath, path.join(localDerived, svgFileName));
            fs.copyFileSync(svgFilePath, path.join(localDerived, legacySvgFileName));
          }
        } catch {}

        await db.prepare(`
          DELETE FROM uploaded_files
          WHERE quotation_case_id = ? AND derived_from_file_id = ? AND file_role = 'VECTOR_SVG'
        `).run(quotationCaseId, file.id);

        const svgFileId = `file_svg_${Date.now()}`;
        await db.prepare(`
          INSERT INTO uploaded_files (
            id, quotation_case_id, original_file_name, stored_file_name, storage_path,
            file_type, file_role, derived_from_file_id, file_size, checksum,
            upload_status, uploaded_by_user_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          svgFileId, quotationCaseId, `${file.original_file_name}.svg`, svgFileName,
          svgFilePath, 'SVG', 'VECTOR_SVG', file.id, svgResult.svg_size_bytes || 1000,
          'svg_checksum', 'CONVERTED', userId, now
        );
      }
    })
    .catch((svgErr) => console.warn('Vector SVG generation non-blocking warning:', svgErr));

  // 2. High-Performance Unified In-Memory Pipeline (Single-Pass 8-in-1 Engine)
  const parseRunId = `parse_${Date.now()}`;
  const tempPipelineJson = path.join(tempDir, `fast_pipeline_${parseRunId}.json`);
  const analyzerRes = await runPythonScript('fast_cad_analyzer.py', [absoluteDxfPath, tempPipelineJson]);
  
  let pipelineResult = analyzerRes;
  if (fs.existsSync(tempPipelineJson)) {
    try {
      pipelineResult = JSON.parse(fs.readFileSync(tempPipelineJson, 'utf-8'));
    } catch (e) {
      console.error('Failed to parse fast pipeline result json:', e);
    }
  }

  if (pipelineResult.status !== 'SUCCESS') {
    return { success: false, error: pipelineResult.error_code || 'DXF_PARSE_FAILED' };
  }

  // 💎 Idempotent cleanup: 동일 파일의 이전 parse_run에 적재된 중복 cad_objects 제거 및 상태 SUPERSEDED 전환
  try {
    const prevRuns = await db.prepare(`
      SELECT id FROM cad_parse_runs WHERE source_file_id = ? AND status = 'SUCCESS'
    `).all(file.id) as any[];

    if (prevRuns && prevRuns.length > 0) {
      for (const pr of prevRuns) {
        await db.prepare('DELETE FROM cad_objects WHERE parse_run_id = ?').run(pr.id);
        await db.prepare("UPDATE cad_parse_runs SET status = 'SUPERSEDED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(pr.id);
      }
    }
  } catch (cleanErr) {
    console.warn('[cad-pipeline] Previous parse_runs idempotent cleanup warning:', cleanErr);
  }

  await db.prepare(`
    INSERT INTO cad_parse_runs (
      id, source_file_id, dxf_version, total_entities, entity_counts_json,
      global_bounds_json, status, duration_ms, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    parseRunId, file.id, pipelineResult.dxf_version, pipelineResult.total_entities,
    JSON.stringify(pipelineResult.entity_counts), JSON.stringify(pipelineResult.global_bounds),
    'SUCCESS', pipelineResult.total_duration_ms, now
  );

  // Fast indexing of text-like objects for full-text CAD search in parallel background
  const textObjs = pipelineResult.text_objects || [];
  if (textObjs.length > 0) {
    const batchSize = 1000;
    const insertPromises: Promise<any>[] = [];
    for (let b = 0; b < textObjs.length; b += batchSize) {
      const chunk = textObjs.slice(b, b + batchSize).map((o: any, idx: number) => ({
        id: `cad_obj_${parseRunId}_${b + idx + 1}`,
        parse_run_id: parseRunId,
        handle: o.handle,
        entity_type: o.entity_type,
        layer: o.layer,
        color: o.color,
        raw_text: o.raw_text || null,
        bounding_box_json: JSON.stringify(o.bounding_box),
        geometry_data_json: JSON.stringify(o.geometry_data),
        created_at: now
      }));
      insertPromises.push(insertRows('cad_objects', chunk));
    }
    Promise.all(insertPromises).catch((err) => console.warn('[cad-pipeline] cad_objects bulk insert warning:', err));
  }

  const structureResult = pipelineResult;

  // Save Drawings to DB (source_file_id 기반 격리 저장 - 다른 도면 데이터 보존)
  await db.prepare('DELETE FROM drawings WHERE quotation_case_id = ? AND (source_file_id = ? OR source_file_id IS NULL)').run(quotationCaseId, sourceFileId);

  if (structureResult.drawings && structureResult.drawings.length > 0) {
    const dwgRows = structureResult.drawings.map((d: any) => {
      const isAssy = d.drawing_type === 'MAIN_ASSEMBLY' || d.drawing_type === 'SUB_ASSEMBLY' ||
                     (d.drawing_no_raw && d.drawing_no_raw.endsWith('-000')) ||
                     (d.drawing_no_raw && d.drawing_no_raw.endsWith('-A001')) ||
                     (d.drawing_name_raw && d.drawing_name_raw.includes('조립도')) ||
                     (d.drawing_name_raw && d.drawing_name_raw.includes('조립 라인'));
      
      const hasExcludeNote = d.special_notes && d.special_notes.some((n: string) => n.includes('가공 제외') || n.includes('가공제외'));
      const hasStdNote = d.special_notes && d.special_notes.some((n: string) => n.includes('표준품'));
      const isExcluded = isAssy || hasExcludeNote || hasStdNote;

      let excludeReason: string | null = null;
      if (isAssy) {
        excludeReason = '조립도 (가공품 제외)';
      } else if (hasExcludeNote) {
        excludeReason = '설계 지시: 가공 제외';
      } else if (hasStdNote) {
        excludeReason = '설계 지시: 표준품';
      }

      return {
        id: `dwg_${sourceFileId}_${d.drawing_index}`,
        quotation_case_id: quotationCaseId,
        source_file_id: sourceFileId,
        drawing_index: d.drawing_index,
        drawing_no_raw: d.drawing_no_raw,
        drawing_no_normalized: d.drawing_no_normalized,
        drawing_name_raw: d.drawing_name_raw,
        drawing_name_normalized: d.drawing_name_normalized,
        revision: d.revision,
        material: d.material,
        scale: d.scale,
        drawing_type: d.drawing_type,
        is_quote_included: isExcluded ? 0 : 1,
        exclude_reason: excludeReason,
        frame_bbox_json: JSON.stringify(d.frame_bbox),
        title_block_bbox_json: JSON.stringify(d.title_block_bbox),
        confidence_score: d.confidence_score,
        status: d.status,
        created_at: now
      };
    });
    await insertRows('drawings', dwgRows);

    // Auto-link Customer from Title Block to quotation_cases (Exclude supplier/tenant self-name & label headers)
    const detectedCustomer = structureResult.drawings.find((d: any) => d.customer && d.customer !== '-' && d.customer !== '')?.customer;
    if (detectedCustomer) {
      try {
        const custClean = detectedCustomer.replace(/[\s().:_-]/g, '').toLowerCase();
        const isSelfSupplier = custClean.includes('세창') || custClean.includes('sechang');
        const isLabelHeader = [
          'projectno', 'projectnumber', 'dwgno', 'drawingno', 'customer', 'title',
          'description', 'scale', 'date', 'n0', 'no', 'finish', 'remark', 'revision', 'rev'
        ].includes(custClean) || /^\d{4}[-/.시]\d{1,2}/.test(detectedCustomer) || /^\d{4}-\d{3}/.test(detectedCustomer);

        if (!isSelfSupplier && !isLabelHeader) {
          const tenantComps = ((await db.prepare("SELECT company_name FROM companies WHERE company_type = 'TENANT'").all()) as any[]) || [];
          const isTenantName = tenantComps.some((t: any) => (t.company_name || '').replace(/[\s()]/g, '').toLowerCase() === custClean);

          if (!isTenantName) {
            const caseRow = await db.prepare('SELECT company_id FROM quotation_cases WHERE id = ?').get(quotationCaseId);
            let shouldLink = false;
            if (!caseRow || !caseRow.company_id || caseRow.company_id === 'comp_unassigned') {
              shouldLink = true;
            } else {
              const currentComp = await db.prepare('SELECT company_name FROM companies WHERE id = ?').get(caseRow.company_id);
              const cName = (currentComp?.company_name || '').trim();
              const isPlaceholder = cName === '' || /^T\d+\./i.test(cName) || /^\d+$/.test(cName) || cName.toUpperCase().includes('PROJECT NO');
              if (isPlaceholder) {
                shouldLink = true;
              }
            }

            if (shouldLink) {
              let comp = await db.prepare('SELECT id FROM companies WHERE company_name = ?').get(detectedCustomer);
              if (!comp) {
                const newCompId = `comp_${Date.now()}`;
                const compCode = `CUST-${Date.now().toString().slice(-4)}`;
                await db.prepare(`
                  INSERT INTO companies (id, company_code, company_name, company_type, is_active, created_at, updated_at)
                  VALUES (?, ?, ?, 'CUSTOMER', 1, ?, ?)
                `).run(newCompId, compCode, detectedCustomer, now, now);
                comp = { id: newCompId };
              }
              await db.prepare('UPDATE quotation_cases SET company_id = ?, updated_at = ? WHERE id = ?').run(comp.id, now, quotationCaseId);
            }
          }
        }
      } catch (custErr) {
        console.warn('Auto customer link warning:', custErr);
      }
    }

    // Auto-update Case Name from Title Block if current case name is temporary or from filename
    const primaryDwg = structureResult.drawings.find((d: any) => 
      (d.drawing_name_raw && d.drawing_name_raw !== '-' && d.drawing_name_raw !== d.drawing_no_raw) ||
      (d.drawing_name_normalized && d.drawing_name_normalized !== '-' && d.drawing_name_normalized !== d.drawing_no_normalized) ||
      (d.title && d.title !== '-' && d.title !== 'Untitled')
    );
    const detectedTitle = primaryDwg?.drawing_name_raw || primaryDwg?.drawing_name_normalized || primaryDwg?.title || primaryDwg?.drawing_title;
    if (detectedTitle && detectedTitle.trim().length > 1) {
      try {
        const caseRow = await db.prepare('SELECT case_name FROM quotation_cases WHERE id = ?').get(quotationCaseId);
        const curName = (caseRow?.case_name || '').trim();
        const isTemporary = !curName || curName.includes('.dwg') || curName.includes('.dxf') || curName.includes('가공 견적') || curName.startsWith('24') || curName.startsWith('25') || curName.startsWith('26');
        if (isTemporary) {
          const newCaseName = `[${detectedTitle.trim()}] 가공 견적`;
          await db.prepare('UPDATE quotation_cases SET case_name = ?, updated_at = ? WHERE id = ?').run(newCaseName, now, quotationCaseId);
        }
      } catch (titleErr) {
        console.warn('Auto case name update warning:', titleErr);
      }
    }

    // Auto-update Designer and Project Name from Title Block if empty
    const detectedDesigner = structureResult.drawings.find((d: any) => d.designer && d.designer !== '-' && d.designer !== '')?.designer;
    const detectedProjName = structureResult.drawings.find((d: any) => d.project_name && d.project_name !== '-' && d.project_name !== '')?.project_name;
    if (detectedDesigner || detectedProjName) {
      try {
        const caseRow = (await db.prepare('SELECT designer_name, project_name FROM quotation_cases WHERE id = ?').get(quotationCaseId)) as any;
        const updates: string[] = [];
        const params: any[] = [];
        if (!caseRow?.designer_name && detectedDesigner) {
          updates.push('designer_name = ?');
          params.push(detectedDesigner);
        }
        if (!caseRow?.project_name && detectedProjName) {
          updates.push('project_name = ?');
          params.push(detectedProjName);
        }
        if (updates.length > 0) {
          updates.push('updated_at = ?');
          params.push(now);
          params.push(quotationCaseId);
          await db.prepare(`UPDATE quotation_cases SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        }
      } catch (metaErr) {
        console.warn('Auto metadata update warning:', metaErr);
      }
    }
  }

  if (structureResult.relationships && structureResult.relationships.length > 0) {
    // 현재 파일의 도면들에 연결된 기존 계층 관계만 선별 삭제 (다른 파일의 도면 관계 보존)
    const currentDrawingNos = Array.from(new Set(
      (structureResult.drawings || []).flatMap((d: any) => [d.drawing_no_raw, d.drawing_no_normalized]).filter(Boolean)
    )) as string[];

    if (currentDrawingNos.length > 0) {
      const placeholders = currentDrawingNos.map(() => '?').join(',');
      await db.prepare(`
        DELETE FROM drawing_relationships 
        WHERE quotation_case_id = ? 
          AND (parent_drawing_no IN (${placeholders}) OR child_drawing_no IN (${placeholders}))
      `).run(quotationCaseId, ...currentDrawingNos, ...currentDrawingNos);
    }

    const relRows = structureResult.relationships.map((r: any, idx: number) => ({
      id: `rel_${sourceFileId}_${idx + 1}`,
      quotation_case_id: quotationCaseId,
      parent_drawing_no: r.parent_drawing_no,
      child_drawing_no: r.child_drawing_no,
      relationship_type: r.relationship_type,
      confidence_score: r.confidence_score,
      created_at: now
    }));
    await insertRows('drawing_relationships', relRows);
  }

  // 6. Detect BOM Areas (Computed in-memory by fast_cad_analyzer)
  await db.prepare('DELETE FROM bom_areas WHERE quotation_case_id = ? AND (source_file_id = ? OR source_file_id IS NULL)').run(quotationCaseId, sourceFileId);
  if (pipelineResult.bom_areas && pipelineResult.bom_areas.length > 0) {
    const baRows = pipelineResult.bom_areas.map((ba: any, i: number) => ({
      id: `ba_${sourceFileId}_${i + 1}`,
      quotation_case_id: quotationCaseId,
      source_file_id: sourceFileId,
      drawing_no: ba.drawing_no,
      table_type: ba.table_type,
      bbox_json: JSON.stringify(ba.bbox),
      confidence_score: ba.confidence_score,
      status: ba.status,
      created_at: now
    }));
    await insertRows('bom_areas', baRows);
  }

  // 7. Extract Raw BOM Rows (Computed in-memory by fast_cad_analyzer)
  await db.prepare('DELETE FROM raw_bom_items WHERE quotation_case_id = ? AND (source_file_id = ? OR source_file_id IS NULL)').run(quotationCaseId, sourceFileId);
  if (pipelineResult.raw_bom_items && pipelineResult.raw_bom_items.length > 0) {
    const rbRows = pipelineResult.raw_bom_items.map((rb: any, idx: number) => ({
      id: `rb_${sourceFileId}_${idx + 1}`,
      quotation_case_id: quotationCaseId,
      source_file_id: sourceFileId,
      drawing_no: rb.drawing_no,
      row_index: rb.row_index,
      item_no_raw: rb.item_no_raw,
      part_no_raw: rb.part_no_raw,
      name_raw: rb.name_raw,
      specification_raw: rb.specification_raw,
      material_raw: rb.material_raw,
      quantity_raw: rb.quantity_raw,
      quantity_numeric: rb.quantity_numeric,
      unit_raw: rb.unit_raw,
      remark_raw: rb.remark_raw,
      source_handles_json: JSON.stringify(rb.source_handles),
      status: rb.status,
      created_at: now
    }));
    await insertRows('raw_bom_items', rbRows);
  }

  // 8. Multi-Level BOM & Quantity Roll-Up (File-scoped isolation)
  const otherSources = (await db.prepare(`
    SELECT COUNT(*) as cnt FROM uploaded_files
    WHERE quotation_case_id = ? AND id != ? AND file_role != 'VECTOR_SVG' AND file_type IN ('DWG', 'DXF')
  `).get(quotationCaseId, sourceFileId)) as any;
  const isOnlySource = (otherSources?.cnt || 0) === 0;

  if (isOnlySource) {
    await db.prepare('DELETE FROM flattened_bom_items WHERE quotation_case_id = ?').run(quotationCaseId);
  } else {
    await db.prepare("DELETE FROM flattened_bom_items WHERE quotation_case_id = ? AND id LIKE 'fb_' || ? || '_%'").run(quotationCaseId, sourceFileId);
  }

  if (pipelineResult.flattened_bom && pipelineResult.flattened_bom.length > 0) {
    const flatRows = pipelineResult.flattened_bom.map((fb: any, idx: number) => ({
      id: `fb_${sourceFileId}_${idx + 1}`,
      quotation_case_id: quotationCaseId,
      item_key: fb.key,
      part_no: fb.part_no,
      name: fb.name,
      specification: fb.specification,
      material: fb.material,
      total_quantity: fb.total_quantity,
      unit: fb.unit,
      source_drawings_json: JSON.stringify(fb.source_drawings),
      source_item_ids_json: JSON.stringify(fb.source_item_ids),
      created_at: now
    }));
    await insertRows('flattened_bom_items', flatRows);
  }

  // 9. BOM Normalization (File-scoped isolation)
  const tempNormJson = path.join(tempDir, `norm_${parseRunId}.json`);
  fs.writeFileSync(tempNormJson, JSON.stringify({ normalized_items: pipelineResult.normalized_items || [] }));

  if (isOnlySource) {
    await db.prepare('DELETE FROM master_candidates WHERE normalized_item_id IN (SELECT id FROM normalized_bom_items WHERE quotation_case_id = ?)').run(quotationCaseId);
    await db.prepare('DELETE FROM normalized_bom_items WHERE quotation_case_id = ?').run(quotationCaseId);
  } else {
    await db.prepare("DELETE FROM master_candidates WHERE normalized_item_id IN (SELECT id FROM normalized_bom_items WHERE quotation_case_id = ? AND id LIKE 'norm_' || ? || '_%')").run(quotationCaseId, sourceFileId);
    await db.prepare("DELETE FROM normalized_bom_items WHERE quotation_case_id = ? AND id LIKE 'norm_' || ? || '_%'").run(quotationCaseId, sourceFileId);
  }

  const normIds: string[] = [];
  if (pipelineResult.normalized_items && pipelineResult.normalized_items.length > 0) {
    const normRows = pipelineResult.normalized_items.map((ni: any, idx: number) => {
      const nId = `norm_${sourceFileId}_${idx + 1}`;
      normIds.push(nId);
      return {
        id: nId,
        quotation_case_id: quotationCaseId,
        raw_item_id: ni.id || nId,
        raw_name: ni.raw_name,
        normalized_name: ni.normalized_name,
        search_name: ni.search_name,
        direction: ni.direction,
        spec_candidate: ni.spec_candidate,
        material_candidate: ni.material_candidate,
        quantity: ni.quantity,
        unit: ni.unit,
        is_quote_included: 1,
        status: ni.status,
        created_at: now
      };
    });
    await insertRows('normalized_bom_items', normRows);
  }

  // 10. Master Candidate Matching (PROMPT 12 & Phase 1-B DB 연동 - File-scoped)
  let tempMastersJson = '';
  try {
    const mastersRes = await queryTable('product_masters', { limit: 1000 });
    const aliasesRes = await queryTable('master_aliases', { limit: 3000 });
    const pMasters = (mastersRes.rows || []).filter((r: any) => !r.deleted_at);
    const pAliases = (aliasesRes.rows || []).filter((r: any) => !r.deleted_at);

    // 마스터별 별칭 매핑 묶기
    const aliasMap = new Map<string, any[]>();
    for (const a of pAliases) {
      if (!aliasMap.has(a.master_id)) aliasMap.set(a.master_id, []);
      aliasMap.get(a.master_id)!.push(a);
    }

    const fullMasters = pMasters.map((m: any) => ({
      ...m,
      aliases: aliasMap.get(m.id) || []
    }));

    tempMastersJson = path.join(tempDir, `masters_${sourceFileId}.json`);
    fs.writeFileSync(tempMastersJson, JSON.stringify(fullMasters, null, 2), 'utf-8');
  } catch (mErr) {
    console.warn('Failed to load masters from DB for matching:', mErr);
  }

  const matcherArgs = tempMastersJson && fs.existsSync(tempMastersJson) 
    ? [tempNormJson, tempMastersJson] 
    : [tempNormJson];
  const masterResult = await runPythonScript('master_matcher.py', matcherArgs);
  
  const candRows: any[] = [];
  for (let i = 0; i < masterResult.results.length; i++) {
    const mr = masterResult.results[i];
    const normId = normIds[i];
    for (let r = 0; r < mr.top_candidates.length; r++) {
      const tc = mr.top_candidates[r];
      candRows.push({
        id: `cand_${normId}_${r + 1}`,
        normalized_item_id: normId,
        master_id: tc.master_id || null,
        master_code: tc.master_code,
        standard_name: tc.standard_name,
        specification: tc.specification,
        material: tc.material,
        rank: r + 1,
        total_score: tc.total_score,
        positive_evidence_json: JSON.stringify(tc.positive_evidence || []),
        negative_evidence_json: JSON.stringify(tc.negative_evidence || []),
        candidate_status: r === 0 ? 'TOP_CANDIDATE' : 'ALTERNATIVE',
        created_at: now
      });
    }
  }
  if (candRows.length > 0) {
    await insertRows('master_candidates', candRows);
  }

  // Cleanup temp files
  [tempPipelineJson, tempNormJson, tempMastersJson].forEach(f => {
    if (f && fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch {}
    }
  });

  // Update Quotation Case status
  await db.prepare(`
    UPDATE quotation_cases
    SET status = 'ANALYZED', quote_readiness = 'REVIEW_REQUIRED', updated_at = ?
    WHERE id = ?
  `).run(now, quotationCaseId);

  // Background Note: WebGL binary and HD Vector SVG continue running in parallel background
  // and populate storage/derived without blocking the HTTP analysis response.
  webglPromise.catch((err) => console.warn('Background WebGL export warning:', err));

  // 🧠 [Option 2] AI 멀티모달(VLM) 기반 표제란·BOM 고정밀 자동 판독 및 메타데이터 보정 (Non-blocking)
  runAiVlmRefinement(quotationCaseId).catch((aiErr) => {
    console.warn('[cad-pipeline] AI VLM refinement background warning:', aiErr);
  });

  return { success: true };
}

/**
 * 🧠 AI 멀티모달 VLM 기반 표제란 및 BOM 고정밀 자동 판독 & 보정 서비스
 */
async function runAiVlmRefinement(quotationCaseId: string) {
  try {
    const { analyzeCadCaseWithAi } = await import('./cad-ai-service');
    const aiResult = await analyzeCadCaseWithAi(quotationCaseId);
    if (!aiResult) return;

    // Cache AI analysis result for fast client UI retrieval
    try {
      const { getStorageSubdir } = await import('./storage');
      const derivedDir = getStorageSubdir('derived');
      const cacheFile = path.join(derivedDir, `${quotationCaseId}__ai_insights.json`);
      fs.writeFileSync(cacheFile, JSON.stringify(aiResult, null, 2), 'utf-8');
    } catch (saveErr) {
      console.warn('[cad-pipeline] Failed to cache ai_insights:', saveErr);
    }

    const now = new Date().toISOString();
    const tb = aiResult.titleBlockAnalysis;
    const notes = aiResult.drawingAndMachiningFeatures?.criticalManufacturingNotes || [];

    // 1. 발주 고객사 판별 및 자동 연동
    const detectedCustomer = tb?.detectedCompany || tb?.customerCompany;
    if (detectedCustomer && detectedCustomer !== '미지정' && detectedCustomer !== '-') {
      const cleanCust = detectedCustomer.replace(/[\s().:_-]/g, '').toLowerCase();
      const isSelfSupplier = cleanCust.includes('세창') || cleanCust.includes('sechang');
      if (!isSelfSupplier) {
        let comp = (await db.prepare('SELECT id FROM companies WHERE company_name = ?').get(detectedCustomer)) as any;
        if (!comp) {
          const newCompId = `comp_${Date.now()}`;
          const compCode = `CUST-${Date.now().toString().slice(-4)}`;
          await db.prepare(`
            INSERT INTO companies (id, company_code, company_name, company_type, is_active, created_at, updated_at)
            VALUES (?, ?, ?, 'CUSTOMER', 1, ?, ?)
          `).run(newCompId, compCode, detectedCustomer, now, now);
          comp = { id: newCompId };
        }
        await db.prepare('UPDATE quotation_cases SET company_id = ?, updated_at = ? WHERE id = ?').run(comp.id, now, quotationCaseId);
      }
    }

    // 2. 프로젝트명, 설계자명 및 AI 감지 가공 특기사항(견적 메모) 자동 갱신
    const updates: string[] = ['updated_at = ?'];
    const params: any[] = [now];

    if (tb?.projectName && tb.projectName !== '-') {
      updates.push('project_name = ?');
      params.push(tb.projectName);
    }
    if (tb?.designerCompany && tb.designerCompany !== '-') {
      updates.push('designer_name = ?');
      params.push(tb.designerCompany);
    }
    if (notes.length > 0) {
      const memoText = notes.map((n: string) => `• ${n}`).join('\n');
      updates.push('quote_memo = COALESCE(quote_memo || "\n\n", "") || "[AI 제조 특기사항 자동 감지]\n" || ?');
      params.push(memoText);
    }

    params.push(quotationCaseId);
    await db.prepare(`UPDATE quotation_cases SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    console.log(`[cad-pipeline] AI VLM refinement completed for case ${quotationCaseId} (Customer: ${detectedCustomer || 'N/A'})`);
  } catch (e) {
    console.warn('[runAiVlmRefinement] Execution warning:', e);
  }
}

