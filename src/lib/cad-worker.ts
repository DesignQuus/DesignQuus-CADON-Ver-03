'use client';

/**
 * ⚡ CADON High-Performance Web Worker Pipeline
 * Offloads heavy binary buffer parsing, geometry array slicing, heavy-line bucketing,
 * and 16x16 spatial text grid computation off the main UI thread.
 * Uses Zero-Copy Transferable ArrayBuffers for 0ms main thread handoff.
 */

export interface CadWorkerParseResult {
  version: number;
  numLines: number;
  numTris: number;
  numHeavy: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  posArray: Float32Array;
  colArray: Float32Array;
  triPosArray?: Float32Array;
  triColArray?: Float32Array;
  heavyBuckets?: Array<{ px: number; pos: Float32Array; col: Float32Array }>;
}

export interface CadTextGridResult {
  minX: number;
  minY: number;
  cellSizeX: number;
  cellSizeY: number;
  cols: number;
  rows: number;
  cells: Array<Array<{ t: string; x: number; y: number; h: number; r: number; c?: string }>>;
}

const workerScript = `
self.onmessage = function(e) {
  var data = e.data;
  var action = data.action;

  if (action === 'PARSE_BINARY') {
    var arrayBuffer = data.buffer;
    if (!arrayBuffer || arrayBuffer.byteLength < 28) {
      self.postMessage({ action: 'PARSE_ERROR', error: 'CAD 바이너리 크기가 유효하지 않습니다.' });
      return;
    }

    try {
      var dataView = new DataView(arrayBuffer);
      var magic = String.fromCharCode(
        dataView.getUint8(0),
        dataView.getUint8(1),
        dataView.getUint8(2),
        dataView.getUint8(3)
      );

      if (magic !== 'CADW') {
        self.postMessage({ action: 'PARSE_ERROR', error: '알 수 없는 CAD 헤더: ' + magic });
        return;
      }

      var version = dataView.getUint32(4, true);
      var numLines = 0, numTris = 0, numHeavy = 0;
      var minX = 0, minY = 0, maxX = 0, maxY = 0;
      var posByteOffset = 28;

      if (version >= 3) {
        if (arrayBuffer.byteLength < 36) {
          self.postMessage({ action: 'PARSE_ERROR', error: 'CAD 바이너리 v3 헤더 오류' });
          return;
        }
        numLines = dataView.getUint32(8, true);
        numTris = dataView.getUint32(12, true);
        numHeavy = dataView.getUint32(16, true);
        minX = dataView.getFloat32(20, true);
        minY = dataView.getFloat32(24, true);
        maxX = dataView.getFloat32(28, true);
        maxY = dataView.getFloat32(32, true);
        posByteOffset = 36;
      } else if (version === 2) {
        numLines = dataView.getUint32(8, true);
        numTris = dataView.getUint32(12, true);
        minX = dataView.getFloat32(16, true);
        minY = dataView.getFloat32(20, true);
        maxX = dataView.getFloat32(24, true);
        maxY = dataView.getFloat32(28, true);
        posByteOffset = 32;
      } else {
        numLines = dataView.getUint32(8, true);
        minX = dataView.getFloat32(12, true);
        minY = dataView.getFloat32(16, true);
        maxX = dataView.getFloat32(20, true);
        maxY = dataView.getFloat32(24, true);
      }

      var posCount = numLines * 6;
      var posArray = new Float32Array(arrayBuffer, posByteOffset, posCount);
      var colByteOffset = posByteOffset + posCount * 4;
      var colArray = new Float32Array(arrayBuffer, colByteOffset, posCount);

      // Clone buffers for transferable postMessage
      var transferable = [];
      var posCopy = new Float32Array(posArray);
      var colCopy = new Float32Array(colArray);
      transferable.push(posCopy.buffer, colCopy.buffer);

      var triPosCopy = null;
      var triColCopy = null;
      if (numTris > 0) {
        var triPosOffset = colByteOffset + posCount * 4;
        var triPosCount = numTris * 9;
        var triPosArray = new Float32Array(arrayBuffer, triPosOffset, triPosCount);
        var triColOffset = triPosOffset + triPosCount * 4;
        var triColArray = new Float32Array(arrayBuffer, triColOffset, triPosCount);
        triPosCopy = new Float32Array(triPosArray);
        triColCopy = new Float32Array(triColArray);
        transferable.push(triPosCopy.buffer, triColCopy.buffer);
      }

      var heavyBuckets = [];
      if (numHeavy > 0) {
        var heavyPosOffset = colByteOffset + posCount * 4 + numTris * 9 * 4 * 2;
        var heavyCount = numHeavy * 6;
        var heavyPos = new Float32Array(arrayBuffer, heavyPosOffset, heavyCount);
        var heavyCol = new Float32Array(arrayBuffer, heavyPosOffset + heavyCount * 4, heavyCount);
        var heavyLw = new Float32Array(arrayBuffer, heavyPosOffset + heavyCount * 8, numHeavy);

        var lwToPx = function(lw) { return lw >= 0.95 ? 4 : (lw >= 0.6 ? 3 : 2); };
        var bMap = {};
        for (var i = 0; i < numHeavy; i++) {
          var px = lwToPx(heavyLw[i]);
          if (!bMap[px]) {
            bMap[px] = { pos: [], col: [] };
          }
          for (var k = 0; k < 6; k++) {
            bMap[px].pos.push(heavyPos[i * 6 + k]);
            bMap[px].col.push(heavyCol[i * 6 + k]);
          }
        }
        for (var key in bMap) {
          var pxVal = parseInt(key, 10);
          var bPos = new Float32Array(bMap[key].pos);
          var bCol = new Float32Array(bMap[key].col);
          heavyBuckets.push({ px: pxVal, pos: bPos, col: bCol });
          transferable.push(bPos.buffer, bCol.buffer);
        }
      }

      self.postMessage({
        action: 'PARSE_SUCCESS',
        result: {
          version: version,
          numLines: numLines,
          numTris: numTris,
          numHeavy: numHeavy,
          bounds: { minX: minX, minY: minY, maxX: maxX, maxY: maxY },
          posArray: posCopy,
          colArray: colCopy,
          triPosArray: triPosCopy,
          triColArray: triColCopy,
          heavyBuckets: heavyBuckets
        }
      }, transferable);
    } catch (err) {
      self.postMessage({ action: 'PARSE_ERROR', error: err.message || String(err) });
    }
  } else if (action === 'BUILD_TEXT_GRID') {
    var texts = data.texts;
    if (!texts || texts.length === 0) {
      self.postMessage({ action: 'TEXT_GRID_SUCCESS', result: null });
      return;
    }
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < texts.length; i++) {
      var t = texts[i];
      if (t.x < minX) minX = t.x;
      if (t.x > maxX) maxX = t.x;
      if (t.y < minY) minY = t.y;
      if (t.y > maxY) maxY = t.y;
    }
    var cols = 16;
    var rows = 16;
    var spanX = Math.max(maxX - minX, 100);
    var spanY = Math.max(maxY - minY, 100);
    var cellSizeX = spanX / cols;
    var cellSizeY = spanY / rows;
    var cells = [];
    for (var j = 0; j < cols * rows; j++) cells.push([]);

    for (var i = 0; i < texts.length; i++) {
      var t = texts[i];
      var c = Math.min(Math.max(0, Math.floor((t.x - minX) / cellSizeX)), cols - 1);
      var r = Math.min(Math.max(0, Math.floor((t.y - minY) / cellSizeY)), rows - 1);
      cells[c * rows + r].push(t);
    }

    self.postMessage({
      action: 'TEXT_GRID_SUCCESS',
      result: {
        minX: minX,
        minY: minY,
        cellSizeX: cellSizeX,
        cellSizeY: cellSizeY,
        cols: cols,
        rows: rows,
        cells: cells
      }
    });
  }
};
`;

let activeWorker: Worker | null = null;

function getWorker(): Worker | null {
  if (typeof window === 'undefined') return null;
  if (!activeWorker) {
    try {
      const blob = new Blob([workerScript], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      activeWorker = new Worker(workerUrl);
    } catch (e) {
      console.warn('[cad-worker] Web Worker creation failed, will fallback to sync:', e);
      return null;
    }
  }
  return activeWorker;
}

/**
 * Worker를 통한 CAD 바이너리 비동기 무복사 파싱
 */
export function parseCadBinaryWithWorker(buffer: ArrayBuffer): Promise<CadWorkerParseResult> {
  const worker = getWorker();
  if (!worker) {
    // Web Worker 미지원 시 동기 폴백
    return parseCadBinarySync(buffer);
  }

  return new Promise((resolve, reject) => {
    // Dedicated Worker listener for single request or pool
    const handler = (e: MessageEvent) => {
      if (e.data.action === 'PARSE_SUCCESS') {
        worker.removeEventListener('message', handler);
        resolve(e.data.result);
      } else if (e.data.action === 'PARSE_ERROR') {
        worker.removeEventListener('message', handler);
        reject(new Error(e.data.error));
      }
    };

    worker.addEventListener('message', handler);
    // Send with buffer transfer
    worker.postMessage({ action: 'PARSE_BINARY', buffer: buffer }, [buffer]);
  });
}

/**
 * 동기 폴백 파서
 */
function parseCadBinarySync(arrayBuffer: ArrayBuffer): Promise<CadWorkerParseResult> {
  return new Promise((resolve, reject) => {
    try {
      const dataView = new DataView(arrayBuffer);
      const magic = String.fromCharCode(
        dataView.getUint8(0),
        dataView.getUint8(1),
        dataView.getUint8(2),
        dataView.getUint8(3)
      );

      if (magic !== 'CADW') {
        return reject(new Error('알 수 없는 CAD 헤더: ' + magic));
      }

      const version = dataView.getUint32(4, true);
      let numLines = 0, numTris = 0, numHeavy = 0;
      let minX = 0, minY = 0, maxX = 0, maxY = 0;
      let posByteOffset = 28;

      if (version >= 3) {
        numLines = dataView.getUint32(8, true);
        numTris = dataView.getUint32(12, true);
        numHeavy = dataView.getUint32(16, true);
        minX = dataView.getFloat32(20, true);
        minY = dataView.getFloat32(24, true);
        maxX = dataView.getFloat32(28, true);
        maxY = dataView.getFloat32(32, true);
        posByteOffset = 36;
      } else if (version === 2) {
        numLines = dataView.getUint32(8, true);
        numTris = dataView.getUint32(12, true);
        minX = dataView.getFloat32(16, true);
        minY = dataView.getFloat32(20, true);
        maxX = dataView.getFloat32(24, true);
        maxY = dataView.getFloat32(28, true);
        posByteOffset = 32;
      } else {
        numLines = dataView.getUint32(8, true);
        minX = dataView.getFloat32(12, true);
        minY = dataView.getFloat32(16, true);
        maxX = dataView.getFloat32(20, true);
        maxY = dataView.getFloat32(24, true);
      }

      const posCount = numLines * 6;
      const posArray = new Float32Array(arrayBuffer, posByteOffset, posCount);
      const colByteOffset = posByteOffset + posCount * 4;
      const colArray = new Float32Array(arrayBuffer, colByteOffset, posCount);

      let triPosCopy: Float32Array | undefined;
      let triColCopy: Float32Array | undefined;
      if (numTris > 0) {
        const triPosOffset = colByteOffset + posCount * 4;
        const triPosCount = numTris * 9;
        triPosCopy = new Float32Array(arrayBuffer, triPosOffset, triPosCount);
        const triColOffset = triPosOffset + triPosCount * 4;
        triColCopy = new Float32Array(arrayBuffer, triColOffset, triPosCount);
      }

      const heavyBuckets: Array<{ px: number; pos: Float32Array; col: Float32Array }> = [];
      if (numHeavy > 0) {
        const heavyPosOffset = colByteOffset + posCount * 4 + numTris * 9 * 4 * 2;
        const heavyCount = numHeavy * 6;
        const heavyPos = new Float32Array(arrayBuffer, heavyPosOffset, heavyCount);
        const heavyCol = new Float32Array(arrayBuffer, heavyPosOffset + heavyCount * 4, heavyCount);
        const heavyLw = new Float32Array(arrayBuffer, heavyPosOffset + heavyCount * 8, numHeavy);

        const lwToPx = (lw: number) => (lw >= 0.95 ? 4 : lw >= 0.6 ? 3 : 2);
        const buckets = new Map<number, { pos: number[]; col: number[] }>();
        for (let i = 0; i < numHeavy; i++) {
          const px = lwToPx(heavyLw[i]);
          let b = buckets.get(px);
          if (!b) {
            b = { pos: [], col: [] };
            buckets.set(px, b);
          }
          for (let k = 0; k < 6; k++) {
            b.pos.push(heavyPos[i * 6 + k]);
            b.col.push(heavyCol[i * 6 + k]);
          }
        }
        buckets.forEach((b, px) => {
          heavyBuckets.push({
            px,
            pos: new Float32Array(b.pos),
            col: new Float32Array(b.col)
          });
        });
      }

      resolve({
        version,
        numLines,
        numTris,
        numHeavy,
        bounds: { minX, minY, maxX, maxY },
        posArray,
        colArray,
        triPosArray: triPosCopy,
        triColArray: triColCopy,
        heavyBuckets
      });
    } catch (e: any) {
      reject(e);
    }
  });
}

/**
 * Worker를 통한 텍스트 Spatial Grid 백그라운드 계산
 */
export function buildTextGridWithWorker(texts: any[]): Promise<CadTextGridResult | null> {
  const worker = getWorker();
  if (!worker || !texts || texts.length === 0) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const handler = (e: MessageEvent) => {
      if (e.data.action === 'TEXT_GRID_SUCCESS') {
        worker.removeEventListener('message', handler);
        resolve(e.data.result);
      }
    };
    worker.addEventListener('message', handler);
    worker.postMessage({ action: 'BUILD_TEXT_GRID', texts });
  });
}
