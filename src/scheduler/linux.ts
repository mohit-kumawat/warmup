import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';
import type { SpawnSyncReturns } from 'child_process';
import { findExecutable } from '../runtime';
import type { ScheduleInstallOptions } from './index';

const SERVICE_NAME = 'warmup';
const SYSTEMD_USER_DIR = path.join(os.homedir(), '.config', 'systemd', 'user');
const SERVICE_PATH = path.join(SYSTEMD_USER_DIR, `${SERVICE_NAME}.service`);
const TIMER_PATH = path.join(SYSTEMD_USER_DIR, `${SERVICE_NAME}.timer`);

type LinuxSchedulerBackend = 'systemd' | 'cron';

function getWarmupScriptPath(): string {
  return path.join(os.homedir(), '.warmup', 'warmup.sh');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function runCommand(command: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync(command, args, {
    encoding: 'utf-8',
    timeout: 10000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function runChecked(command: string, args: string[], context: string): string {
  const result = runCommand(command, args);
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || 'unknown error').trim();
    throw new Error(`${context}: ${details}`);
  }
  return result.stdout || '';
}

export function hasUsableSystemdUserSession(): boolean {
  const result = runCommand('systemctl', ['--user', 'show-environment']);
  return !result.error && result.status === 0;
}

function hasCrontab(): boolean {
  return findExecutable('crontab') !== null;
}

function readCurrentCrontab(): string {
  const result = runCommand('crontab', ['-l']);
  if (result.error) {
    throw new Error(`Failed to read crontab: ${result.error.message}`);
  }
  if (result.status === 0) {
    return result.stdout || '';
  }
  if (result.status === 1) {
    return '';
  }

  const details = (result.stderr || result.stdout || 'unknown error').trim();
  throw new Error(`Failed to read crontab: ${details}`);
}

function writeCrontab(lines: string[], context: string): void {
  const tmpFile = path.join(os.tmpdir(), 'warmup-cron.tmp');
  try {
    fs.writeFileSync(tmpFile, `${lines.filter(line => line.trim()).join('\n')}\n`);
    runChecked('crontab', [tmpFile], context);
  } finally {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  }
}

export function determineLinuxSchedulerBackend(
  systemdUsable: boolean,
  crontabAvailable: boolean,
): LinuxSchedulerBackend {
  if (systemdUsable) return 'systemd';
  if (crontabAvailable) return 'cron';
  throw new Error('Neither a usable user systemd session nor crontab is available on this system.');
}

export function buildLinuxWarmupScript(runtime: ScheduleInstallOptions['runtime']): string {
  return `#!/bin/bash
set -euo pipefail

mkdir -p "$HOME/.warmup/logs"

${shellQuote(runtime.nodePath)} ${shellQuote(runtime.cliEntry)} _execute-warmup >> "$HOME/.warmup/logs/systemd.log" 2>&1
`;
}

function createWarmupScript(runtime: ScheduleInstallOptions['runtime']): string {
  const scriptPath = getWarmupScriptPath();
  const script = buildLinuxWarmupScript(runtime);

  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  return scriptPath;
}

function installSystemdSchedule(options: ScheduleInstallOptions): void {
  if (!fs.existsSync(SYSTEMD_USER_DIR)) {
    fs.mkdirSync(SYSTEMD_USER_DIR, { recursive: true });
  }

  const scriptPath = createWarmupScript(options.runtime);
  const hStr = options.hour.toString().padStart(2, '0');
  const mStr = options.minute.toString().padStart(2, '0');

  const service = `[Unit]
Description=warmup pre-warm service

[Service]
Type=oneshot
ExecStart=/bin/bash ${scriptPath}
Environment=HOME=${os.homedir()}
`;

  const timer = `[Unit]
Description=warmup daily pre-warm timer

[Timer]
OnCalendar=*-*-* ${hStr}:${mStr}:00
Persistent=true
AccuracySec=1min

[Install]
WantedBy=timers.target
`;

  fs.writeFileSync(SERVICE_PATH, service);
  fs.writeFileSync(TIMER_PATH, timer);

  try {
    runChecked('systemctl', ['--user', 'daemon-reload'], 'Failed to reload the user systemd daemon');
    runChecked('systemctl', ['--user', 'enable', '--now', `${SERVICE_NAME}.timer`], 'Failed to enable and start warmup.timer');

    const enabledState = runChecked('systemctl', ['--user', 'is-enabled', `${SERVICE_NAME}.timer`], 'Failed to verify warmup.timer enablement').trim();
    const activeState = runChecked('systemctl', ['--user', 'is-active', `${SERVICE_NAME}.timer`], 'Failed to verify warmup.timer activity').trim();

    if (enabledState !== 'enabled') {
      throw new Error(`warmup.timer is not enabled (state: ${enabledState})`);
    }

    if (!['active', 'activating'].includes(activeState)) {
      throw new Error(`warmup.timer is not active (state: ${activeState})`);
    }
  } catch (error) {
    try {
      if (fs.existsSync(SERVICE_PATH)) fs.unlinkSync(SERVICE_PATH);
      if (fs.existsSync(TIMER_PATH)) fs.unlinkSync(TIMER_PATH);
      runCommand('systemctl', ['--user', 'daemon-reload']);
    } catch {}

    throw error;
  }
}

function installCronSchedule(options: ScheduleInstallOptions): void {
  if (!hasCrontab()) {
    throw new Error('crontab is not available on this system.');
  }

  const scriptPath = createWarmupScript(options.runtime);
  const cronLine = `${options.minute} ${options.hour} * * * /bin/bash ${scriptPath} # warmup`;
  const rebootLine = `@reboot sleep 30 && /bin/bash ${scriptPath} # warmup-boot`;
  const existing = readCurrentCrontab();
  const lines = existing
    .split('\n')
    .filter(line => line.trim())
    .filter(line => !line.includes('# warmup'));

  lines.push(cronLine);
  lines.push(rebootLine);

  writeCrontab(lines, 'Failed to install warmup crontab entries');
}

export function installLinuxSchedule(options: ScheduleInstallOptions): void {
  const backend = determineLinuxSchedulerBackend(
    hasUsableSystemdUserSession(),
    hasCrontab(),
  );

  if (backend === 'systemd') {
    installSystemdSchedule(options);
    return;
  }

  installCronSchedule(options);
}

export function uninstallLinuxSchedule(): void {
  if (hasUsableSystemdUserSession()) {
    try { runCommand('systemctl', ['--user', 'stop', `${SERVICE_NAME}.timer`]); } catch {}
    try { runCommand('systemctl', ['--user', 'disable', `${SERVICE_NAME}.timer`]); } catch {}

    if (fs.existsSync(SERVICE_PATH)) fs.unlinkSync(SERVICE_PATH);
    if (fs.existsSync(TIMER_PATH)) fs.unlinkSync(TIMER_PATH);

    try { runCommand('systemctl', ['--user', 'daemon-reload']); } catch {}
  }

  if (hasCrontab()) {
    try {
      const lines = readCurrentCrontab()
        .split('\n')
        .filter(line => line.trim())
        .filter(line => !line.includes('# warmup'));
      writeCrontab(lines, 'Failed to remove warmup crontab entries');
    } catch {}
  }

  const scriptPath = getWarmupScriptPath();
  if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
}

export function isLinuxScheduleInstalled(): boolean {
  if (hasUsableSystemdUserSession()) {
    return fs.existsSync(TIMER_PATH);
  }

  if (!hasCrontab()) {
    return false;
  }

  try {
    return readCurrentCrontab().includes('# warmup');
  } catch {
    return false;
  }
}

export function pauseLinuxSchedule(): void {
  if (hasUsableSystemdUserSession()) {
    try { runCommand('systemctl', ['--user', 'stop', `${SERVICE_NAME}.timer`]); } catch {}
  }

  if (!hasCrontab()) return;

  try {
    const existing = readCurrentCrontab();
    if (existing.includes('# warmup')) {
      const lines = existing.split('\n').map(line => {
        if (line.includes('# warmup') && !line.startsWith('#PAUSED#')) {
          return `#PAUSED#${line}`;
        }
        return line;
      });

      writeCrontab(lines, 'Failed to pause warmup crontab entries');
    }
  } catch {}
}

export function resumeLinuxSchedule(): void {
  if (hasUsableSystemdUserSession()) {
    try { runCommand('systemctl', ['--user', 'start', `${SERVICE_NAME}.timer`]); } catch {}
  }

  if (!hasCrontab()) return;

  try {
    const existing = readCurrentCrontab();
    if (existing.includes('#PAUSED#')) {
      const lines = existing.split('\n').map(line => {
        if (line.startsWith('#PAUSED#') && line.includes('# warmup')) {
          return line.replace('#PAUSED#', '');
        }
        return line;
      });

      writeCrontab(lines, 'Failed to resume warmup crontab entries');
    }
  } catch {}
}
