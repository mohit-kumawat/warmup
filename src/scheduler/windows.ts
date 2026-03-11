import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import type { ScheduleInstallOptions } from './index';

const TASK_NAME = 'warmup';

function getWarmupScriptPath(): string {
  return path.join(os.homedir(), '.warmup', 'warmup.bat');
}

function windowsQuote(value: string): string {
  return value.replace(/"/g, '""');
}

export function buildWindowsWarmupScript(runtime: ScheduleInstallOptions['runtime']): string {
  return `@echo off
setlocal

if not exist "%USERPROFILE%\\.warmup\\logs" mkdir "%USERPROFILE%\\.warmup\\logs"

"${windowsQuote(runtime.nodePath)}" "${windowsQuote(runtime.cliEntry)}" _execute-warmup >> "%USERPROFILE%\\.warmup\\logs\\schtasks.log" 2>&1
`;
}

/** Create the warmup batch script for Windows */
function createWarmupScript(runtime: ScheduleInstallOptions['runtime']): string {
  const scriptPath = getWarmupScriptPath();
  const script = buildWindowsWarmupScript(runtime);
  fs.writeFileSync(scriptPath, script);
  return scriptPath;
}

/**
 * Install Windows Task Scheduler task.
 * Key: StartWhenAvailable enables "run ASAP if missed" for boot-recovery.
 */
export function installWindowsSchedule(options: ScheduleInstallOptions): void {
  const scriptPath = createWarmupScript(options.runtime);
  const hStr = options.hour.toString().padStart(2, '0');
  const mStr = options.minute.toString().padStart(2, '0');
  const timeStr = `${hStr}:${mStr}`;

  // Remove existing task first
  try {
    execSync(`schtasks /Delete /TN "${TASK_NAME}" /F 2>nul`, { stdio: 'pipe' });
  } catch {}

  // Create scheduled task
  // /SC DAILY = run daily
  // /ST = start time
  // /RI 1 = repeat interval (enables missed-run recovery)
  // /DU 0000:05 = duration window for repeat
  execSync(
    `schtasks /Create /TN "${TASK_NAME}" /TR "${scriptPath}" /SC DAILY /ST ${timeStr} /F`,
    { stdio: 'pipe' }
  );

  // Enable "run as soon as possible after a scheduled start is missed"
  // This requires modifying the task XML — use PowerShell
  try {
    const psCommand = `
      $task = Get-ScheduledTask -TaskName '${TASK_NAME}'
      $task.Settings.StartWhenAvailable = $true
      $task.Settings.WakeToRun = $false
      $task.Settings.DisallowStartIfOnBatteries = $false
      $task.Settings.StopIfGoingOnBatteries = $false
      Set-ScheduledTask -InputObject $task
    `.replace(/\n/g, '; ');

    execSync(`powershell -Command "${psCommand}"`, { stdio: 'pipe' });
  } catch {
    // StartWhenAvailable is the key feature; if PowerShell fails, the basic task still works
  }
}

/** Remove Windows scheduled task */
export function uninstallWindowsSchedule(): void {
  try {
    execSync(`schtasks /Delete /TN "${TASK_NAME}" /F 2>nul`, { stdio: 'pipe' });
  } catch {}

  const scriptPath = getWarmupScriptPath();
  if (fs.existsSync(scriptPath)) {
    fs.unlinkSync(scriptPath);
  }
}

/** Check if Windows schedule is installed */
export function isWindowsScheduleInstalled(): boolean {
  try {
    execSync(`schtasks /Query /TN "${TASK_NAME}" 2>nul`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function pauseWindowsSchedule(): void {
  try {
    execSync(`schtasks /Change /TN "${TASK_NAME}" /DISABLE`, { stdio: 'pipe' });
  } catch {}
}

export function resumeWindowsSchedule(): void {
  try {
    execSync(`schtasks /Change /TN "${TASK_NAME}" /ENABLE`, { stdio: 'pipe' });
  } catch {}
}
