import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { db, insertRows } from './db';
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

  // 2-B. Start WebGL binary buffer & HD Vector SVG generation in parallel background
  const derivedStorageDir = getStorageSubdir('derived');
  fs.mkdirSync(derivedStorageDir, { recursive: true });

  const webglBinName = `${quotationCaseId}__cad_webgl.bin`;
  const webglBinPath = path.join(derivedStorageDir, webglBinName);
  const webglPromise = runPythonScript('cad_webgl_exporter.py', [absoluteDxfPath, webglBinPath])
    .then(() => {
      // Synchronize to workspace storage/derived as well
      const localDerived = path.join(process.cwd(), 'storage', 'derived');
      if (fs.existsSync(localDerived) && localDerived !== derivedStorageDir) {
        try {
          fs.copyFileSync(webglBinPath, path.join(localDerived, webglBinName));
          const txtName = webglBinName.replace('__cad_webgl.bin', '__cad_texts.json');
          const srcTxt = path.join(derivedStorageDir, txtName);
          if (fs.existsSync(srcTxt)) {
            fs.copyFileSync(srcTxt, path.join(localDerived, txtName));
          }
        } catch (copyErr) {
          console.warn('WebGL storage sync warning:', copyErr);
        }
      }
    })
    .catch((webglErr) => console.warn('WebGL binary export warning:', webglErr));

  const svgFileName = `${quotationCaseId}__hd_vector.svg`;
  const svgFilePath = path.join(derivedStorageDir, svgFileName);

  const svgPromise = runPythonScript('vector_svg_renderer.py', [absoluteDxfPath, svgFilePath])
    .then(async (svgResult) => {
      if (svgResult && svgResult.status === 'SUCCESS') {
        await db.prepare(`
          DELETE FROM uploaded_files
          WHERE quotation_case_id = ? AND file_role = 'VECTOR_SVG'
        `).run(quotationCaseId);

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

  const parseResult = await runPythonScript('dxf_parser.py', [absoluteDxfPath]);
  if (parseResult.status !== 'SUCCESS') {
    return { success: false, error: parseResult.error_code || 'DXF_PARSE_FAILED' };
  }

  const parseRunId = `parse_${Date.now()}`;
  await db.prepare(`
    INSERT INTO cad_parse_runs (
      id, source_file_id, dxf_version, total_entities, entity_counts_json,
      global_bounds_json, status, duration_ms, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    parseRunId, file.id, parseResult.dxf_version, parseResult.total_entities,
    JSON.stringify(parseResult.entity_counts), JSON.stringify(parseResult.global_bounds),
    'SUCCESS', parseResult.duration_ms, now
  );

  // Insert CAD objects in batches via insertRows
  if (parseResult.objects && parseResult.objects.length > 0) {
    const batchSize = 500;
    for (let b = 0; b < parseResult.objects.length; b += batchSize) {
      const chunk = parseResult.objects.slice(b, b + batchSize).map((o: any, idx: number) => ({
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
      await insertRows('cad_objects', chunk);
    }
  }

  // 3. Detect Frames & Sheet Candidates (PROMPT 05)
  const tempDir = getStorageSubdir('temp');
  const tempCadJson = path.join(tempDir, `cad_${parseRunId}.json`);
  fs.writeFileSync(tempCadJson, JSON.stringify(parseResult));

  const frameResult = await runPythonScript('frame_detector.py', [tempCadJson]);
  const tempFrameJson = path.join(tempDir, `frame_${parseRunId}.json`);
  fs.writeFileSync(tempFrameJson, JSON.stringify(frameResult));

  // 4. Detect Title Block & Metadata (PROMPT 06)
  const titleBlockResult = await runPythonScript('title_block_detector.py', [tempCadJson, tempFrameJson]);
  const tempTitleJson = path.join(tempDir, `title_${parseRunId}.json`);
  fs.writeFileSync(tempTitleJson, JSON.stringify(titleBlockResult));

  // 5. Structure Classification (PROMPT 07)
  const structureResult = await runPythonScript('structure_classifier.py', [tempTitleJson]);
  const tempStrucJson = path.join(tempDir, `struc_${parseRunId}.json`);
  fs.writeFileSync(tempStrucJson, JSON.stringify(structureResult));

  // Save Drawings to DB (source_file_id 기반 격리 저장 - 다른 도면 데이터 보존)
  await db.prepare('DELETE FROM drawings WHERE quotation_case_id = ? AND (source_file_id = ? OR source_file_id IS NULL)').run(quotationCaseId, sourceFileId);
  await db.prepare('DELETE FROM drawing_relationships WHERE quotation_case_id = ?').run(quotationCaseId);

  if (structureResult.drawings && structureResult.drawings.length > 0) {
    const dwgRows = structureResult.drawings.map((d: any) => ({
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
      frame_bbox_json: JSON.stringify(d.frame_bbox),
      title_block_bbox_json: JSON.stringify(d.title_block_bbox),
      confidence_score: d.confidence_score,
      status: d.status,
      created_at: now
    }));
    await insertRows('drawings', dwgRows);

    // Auto-link Customer from Title Block to quotation_cases if unassigned
    const detectedCustomer = structureResult.drawings.find((d: any) => d.customer && d.customer !== '-' && d.customer !== '')?.customer;
    if (detectedCustomer) {
      try {
        const caseRow = await db.prepare('SELECT company_id FROM quotation_cases WHERE id = ?').get(quotationCaseId);
        if (caseRow && (!caseRow.company_id || caseRow.company_id === 'comp_unassigned')) {
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
      } catch (custErr) {
        console.warn('Auto customer link warning:', custErr);
      }
    }
  }

  if (structureResult.relationships && structureResult.relationships.length > 0) {
    const relRows = structureResult.relationships.map((r: any, idx: number) => ({
      id: `rel_${quotationCaseId}_${idx + 1}`,
      quotation_case_id: quotationCaseId,
      parent_drawing_no: r.parent_drawing_no,
      child_drawing_no: r.child_drawing_no,
      relationship_type: r.relationship_type,
      confidence_score: r.confidence_score,
      created_at: now
    }));
    await insertRows('drawing_relationships', relRows);
  }

  // 6. Detect BOM Areas (PROMPT 08)
  const bomAreaResult = await runPythonScript('bom_area_detector.py', [tempCadJson, tempStrucJson]);
  const tempBomAreaJson = path.join(tempDir, `bom_area_${parseRunId}.json`);
  fs.writeFileSync(tempBomAreaJson, JSON.stringify(bomAreaResult));

  await db.prepare('DELETE FROM bom_areas WHERE quotation_case_id = ? AND (source_file_id = ? OR source_file_id IS NULL)').run(quotationCaseId, sourceFileId);
  if (bomAreaResult.bom_areas && bomAreaResult.bom_areas.length > 0) {
    const baRows = bomAreaResult.bom_areas.map((ba: any, i: number) => ({
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

  // 7. Extract Raw BOM Rows (PROMPT 09)
  const rawBomResult = await runPythonScript('bom_row_extractor.py', [tempCadJson, tempBomAreaJson]);
  const tempRawBomJson = path.join(tempDir, `raw_bom_${parseRunId}.json`);
  fs.writeFileSync(tempRawBomJson, JSON.stringify(rawBomResult));

  await db.prepare('DELETE FROM raw_bom_items WHERE quotation_case_id = ? AND (source_file_id = ? OR source_file_id IS NULL)').run(quotationCaseId, sourceFileId);
  if (rawBomResult.raw_bom_items && rawBomResult.raw_bom_items.length > 0) {
    const rbRows = rawBomResult.raw_bom_items.map((rb: any, idx: number) => ({
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

  // 8. Multi-Level BOM & Quantity Roll-Up (PROMPT 10)
  const multiLevelResult = await runPythonScript('multilevel_bom_builder.py', [tempRawBomJson, tempStrucJson, '1.0']);
  const tempMultiJson = path.join(tempDir, `multi_${parseRunId}.json`);
  fs.writeFileSync(tempMultiJson, JSON.stringify(multiLevelResult));

  await db.prepare('DELETE FROM flattened_bom_items WHERE quotation_case_id = ?').run(quotationCaseId);
  if (multiLevelResult.flattened_bom && multiLevelResult.flattened_bom.length > 0) {
    const flatRows = multiLevelResult.flattened_bom.map((fb: any, idx: number) => ({
      id: `fb_${quotationCaseId}_${idx + 1}`,
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

  // 9. BOM Normalization (PROMPT 11)
  const normResult = await runPythonScript('bom_normalizer.py', [tempMultiJson]);
  const tempNormJson = path.join(tempDir, `norm_${parseRunId}.json`);
  fs.writeFileSync(tempNormJson, JSON.stringify(normResult));

  await db.prepare('DELETE FROM normalized_bom_items WHERE quotation_case_id = ?').run(quotationCaseId);
  const normIds: string[] = [];
  if (normResult.normalized_items && normResult.normalized_items.length > 0) {
    const normRows = normResult.normalized_items.map((ni: any, idx: number) => {
      const nId = `norm_${quotationCaseId}_${idx + 1}`;
      normIds.push(nId);
      return {
        id: nId,
        quotation_case_id: quotationCaseId,
        raw_name: ni.raw_name,
        normalized_name: ni.normalized_name,
        search_name: ni.search_name,
        direction: ni.direction,
        spec_candidate: ni.spec_candidate,
        material_candidate: ni.material_candidate,
        quantity: ni.quantity,
        unit: ni.unit,
        status: ni.status,
        created_at: now
      };
    });
    await insertRows('normalized_bom_items', normRows);
  }

  // 10. Master Candidate Matching (PROMPT 12)
  const masterResult = await runPythonScript('master_matcher.py', [tempNormJson]);
  
  await db.prepare('DELETE FROM master_candidates WHERE normalized_item_id IN (SELECT id FROM normalized_bom_items WHERE quotation_case_id = ?)').run(quotationCaseId);
  const candRows: any[] = [];
  for (let i = 0; i < masterResult.results.length; i++) {
    const mr = masterResult.results[i];
    const normId = normIds[i];
    for (let r = 0; r < mr.top_candidates.length; r++) {
      const tc = mr.top_candidates[r];
      candRows.push({
        id: `cand_${normId}_${r + 1}`,
        normalized_item_id: normId,
        master_code: tc.master_code,
        standard_name: tc.standard_name,
        specification: tc.specification,
        material: tc.material,
        rank: r + 1,
        total_score: tc.total_score,
        positive_evidence_json: JSON.stringify(tc.positive_evidence),
        negative_evidence_json: JSON.stringify(tc.negative_evidence),
        candidate_status: r === 0 ? 'TOP_CANDIDATE' : 'ALTERNATIVE',
        created_at: now
      });
    }
  }
  if (candRows.length > 0) {
    await insertRows('master_candidates', candRows);
  }

  // Cleanup temp files
  [tempCadJson, tempFrameJson, tempTitleJson, tempStrucJson, tempBomAreaJson, tempRawBomJson, tempMultiJson, tempNormJson].forEach(f => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });

  // Update Quotation Case status
  await db.prepare(`
    UPDATE quotation_cases
    SET status = 'ANALYZED', quote_readiness = 'REVIEW_REQUIRED', updated_at = ?
    WHERE id = ?
  `).run(now, quotationCaseId);

  // Ensure WebGL binary & texts generation has finished before returning
  try {
    await webglPromise;
  } catch (err) {
    console.warn('WebGL promise wait warning:', err);
  }

  // Background Note: svgPromise continues running in parallel and saves VECTOR_SVG file upon completion
  return { success: true };
}
