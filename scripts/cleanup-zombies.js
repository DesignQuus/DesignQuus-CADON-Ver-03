/**
 * CADON-Ver-03 좀비(고립) Node.js 프로세스 자동 감지 및 정리 스크립트
 * - 이전에 비정상 종료되거나 백그라운드에 남아 3GB 이상 메모리를 점유하는
 *   CADON-Ver-03 관련 Node/Next 개발 서버 프로세스를 안전하게 강제 종료합니다.
 */

const { execSync } = require('child_process');

function getCadonNodeProcesses() {
  if (process.platform !== 'win32') return [];

  try {
    const psCmd = `Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'node' -and $_.CommandLine -match 'CADON-Ver-03' } | Select-Object ProcessId, ParentProcessId, WorkingSetSize, CommandLine | ConvertTo-Json -Compress`;
    const stdout = execSync(`powershell -NoProfile -Command "${psCmd}"`, {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 10000,
    }).trim();

    if (!stdout) return [];
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    console.warn('[cleanup-zombies] 프로세스 조회 중 오류:', err.message);
    return [];
  }
}

function cleanupZombies(options = {}) {
  const currentPid = process.pid;
  const currentPpid = process.ppid;
  const preserveActivePort = options.preserveActivePort || null; // e.g. 4003

  console.log('🧹 [CADON] 백그라운드 유령(좀비) Node.js 프로세스 탐색 중...');
  const processes = getCadonNodeProcesses();

  if (processes.length === 0) {
    console.log('✨ [CADON] 정리할 대상 프로세스가 없습니다.');
    return;
  }

  let killedCount = 0;
  let freedBytes = 0;
  const killedPids = new Set();

  for (const proc of processes) {
    const pid = proc.ProcessId;
    if (pid === currentPid || pid === currentPpid || killedPids.has(pid)) continue;

    const cmd = proc.CommandLine || '';
    const memMb = Math.round((proc.WorkingSetSize || 0) / (1024 * 1024));

    // 현재 활성 포트가 지정된 경우, 해당 포트의 정식 활성 서버는 보호
    if (preserveActivePort && (cmd.includes(`-p ${preserveActivePort}`) || cmd.includes(`:${preserveActivePort}`))) {
      console.log(`  ℹ️ [유지] 현재 활성 서버 (PID: ${pid}, Port: ${preserveActivePort}, RAM: ${memMb}MB)`);
      continue;
    }

    try {
      console.log(`  ⚡ [종료 대상 감지] PID: ${pid} (${memMb}MB 점유) -> 트리 강제 종료 실행...`);
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', windowsHide: true });
      killedCount++;
      freedBytes += proc.WorkingSetSize || 0;
      killedPids.add(pid);
      // 자식 프로세스들도 함께 종료되었으므로 집합에 추가
      for (const child of processes) {
        if (child.ParentProcessId === pid) {
          killedPids.add(child.ProcessId);
          freedBytes += child.WorkingSetSize || 0;
        }
      }
      console.log(`  ✅ [정리 완료] PID: ${pid} 및 하위 프로세스 정상 종료됨`);
    } catch (e) {
      // 이미 종료된 프로세스는 무시
    }
  }

  const freedMb = Math.round(freedBytes / (1024 * 1024));
  if (killedCount > 0) {
    console.log(`🎉 [정리 완료] 총 ${killedCount}개의 유령 프로세스 정리 완료 (확보된 메모리: 약 ${freedMb}MB / ${(freedMb / 1024).toFixed(2)}GB)`);
  } else {
    console.log('✨ [CADON] 모든 프로세스가 정상 상태입니다.');
  }
}

// 직접 실행 시
if (require.main === module) {
  const args = process.argv.slice(2);
  const killAll = args.includes('--all');
  const portArg = args.find(a => a.startsWith('--port='));
  const activePort = portArg ? portArg.split('=')[1] : (killAll ? null : '4003');

  cleanupZombies({ preserveActivePort: killAll ? null : activePort });
}

module.exports = { cleanupZombies, getCadonNodeProcesses };
