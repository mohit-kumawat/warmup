import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import type { ScheduleInstallOptions } from './index';

const PLIST_NAME = 'com.warmup.prewarm';
const PLIST_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
const PLIST_PATH = path.join(PLIST_DIR, `${PLIST_NAME}.plist`);

/**
 * Get the path to the warmup script.
 * We generate a small shell script that warmup's launchd plist will execute.
 */
function getWarmupScriptPath(): string {
  return path.join(os.homedir(), '.warmup', 'warmup.sh');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildMacWarmupScript(runtime: ScheduleInstallOptions['runtime']): string {
  return `#!/bin/bash
set -euo pipefail

mkdir -p "$HOME/.warmup/logs"

${shellQuote(runtime.nodePath)} ${shellQuote(runtime.cliEntry)} _execute-warmup >> "$HOME/.warmup/logs/launchd.log" 2>&1
`;
}

/** Create the warmup shell script that launchd will execute */
function createWarmupScript(runtime: ScheduleInstallOptions['runtime']): string {
  const scriptPath = getWarmupScriptPath();
  const script = buildMacWarmupScript(runtime);

  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  return scriptPath;
}

/**
 * Install a launchd plist for macOS.
 * Key feature: RunAtLoad=true ensures boot-recovery.
 */
export function installMacSchedule(options: ScheduleInstallOptions): void {
  // Ensure LaunchAgents directory exists
  if (!fs.existsSync(PLIST_DIR)) {
    fs.mkdirSync(PLIST_DIR, { recursive: true });
  }

  const scriptPath = createWarmupScript(options.runtime);
  const { hour, minute } = options;

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_NAME}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${scriptPath}</string>
  </array>

  <!-- Schedule: fire at specified time daily -->
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>

  <!-- BOOT RECOVERY: Run immediately on load if scheduled time was missed -->
  <key>RunAtLoad</key>
  <true/>

  <!-- Don't run if already running -->
  <key>KeepAlive</key>
  <false/>

  <!-- Working directory -->
  <key>WorkingDirectory</key>
  <string>${os.homedir()}</string>

  <!-- Logging -->
  <key>StandardOutPath</key>
  <string>${path.join(os.homedir(), '.warmup', 'logs', 'launchd-stdout.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(os.homedir(), '.warmup', 'logs', 'launchd-stderr.log')}</string>
</dict>
</plist>`;

  fs.writeFileSync(PLIST_PATH, plist);

  // Unload first if already loaded (ignore errors)
  try {
    execSync(`launchctl unload ${PLIST_PATH} 2>/dev/null`, { stdio: 'pipe' });
  } catch {}

  // Load the plist
  execSync(`launchctl load ${PLIST_PATH}`);
}

/** Remove the launchd plist */
export function uninstallMacSchedule(): void {
  try {
    execSync(`launchctl unload ${PLIST_PATH} 2>/dev/null`, { stdio: 'pipe' });
  } catch {}

  if (fs.existsSync(PLIST_PATH)) {
    fs.unlinkSync(PLIST_PATH);
  }

  const scriptPath = getWarmupScriptPath();
  if (fs.existsSync(scriptPath)) {
    fs.unlinkSync(scriptPath);
  }
}

/** Check if macOS schedule is installed */
export function isMacScheduleInstalled(): boolean {
  return fs.existsSync(PLIST_PATH);
}

/** Temporarily disable by unloading (don't delete) */
export function pauseMacSchedule(): void {
  try {
    execSync(`launchctl unload ${PLIST_PATH} 2>/dev/null`, { stdio: 'pipe' });
  } catch {}
}

/** Re-enable by loading */
export function resumeMacSchedule(): void {
  if (fs.existsSync(PLIST_PATH)) {
    try {
      execSync(`launchctl load ${PLIST_PATH}`, { stdio: 'pipe' });
    } catch {}
  }
}
