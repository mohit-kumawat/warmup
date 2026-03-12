import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import type { RuntimePaths } from './runtime';

export interface WarmupConfig {
  version: string;
  schedule: {
    time: string;        // "05:00" (24h format)
    timezone: string;    // IANA timezone e.g. "America/New_York"
    enabled: boolean;
  };
  runtime?: RuntimePaths;
  createdAt: string;
  updatedAt: string;
}

export interface LogEntry {
  timestamp: string;
  status: 'success' | 'failed' | 'boot-recovery';
  message: string;
  tokensUsed?: number;
  scheduledTime?: string;
  actualTime?: string;
}

function getWarmupBaseDir(): string {
  const override = process.env.WARMUP_CONFIG_DIR;
  return override ? path.resolve(override) : path.join(os.homedir(), '.warmup');
}

const DATE_LOG_PATTERN = /^\d{4}-\d{2}-\d{2}\.log$/;
const CONFIG_DIR = getWarmupBaseDir();
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const LOGS_DIR = path.join(CONFIG_DIR, 'logs');

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigFilePath(): string {
  return CONFIG_FILE;
}

export function getLogsDir(): string {
  return LOGS_DIR;
}

export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

export function configExists(): boolean {
  return fs.existsSync(CONFIG_FILE);
}

export function readConfig(): WarmupConfig | null {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as WarmupConfig;
    if (parsed.runtime) {
      const { nodePath, cliEntry, claudePath } = parsed.runtime;
      if (!nodePath || !cliEntry || !claudePath) {
        delete parsed.runtime;
      }
    }
    return parsed;
  } catch {
    console.error(
      chalk.yellow('  ⚠ Config file is corrupted: ') +
      chalk.gray(CONFIG_FILE) + '\n' +
      chalk.gray('  Run ') + chalk.hex('#6C5CE7')('warmup setup') +
      chalk.gray(' to reconfigure.')
    );
    return null;
  }
}

export function writeConfig(config: WarmupConfig): void {
  ensureConfigDir();
  config.updatedAt = new Date().toISOString();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function createDefaultConfig(time: string, timezone: string, runtime: RuntimePaths): WarmupConfig {
  return {
    version: '1.0.0',
    schedule: {
      time,
      timezone,
      enabled: true,
    },
    runtime,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── Logging ──

let lastCleanDate = '';

export function getDateStringInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = new Map(parts.map(part => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

function getDatedLogFiles(): string[] {
  if (!fs.existsSync(LOGS_DIR)) return [];

  return fs.readdirSync(LOGS_DIR)
    .filter(file => DATE_LOG_PATTERN.test(file))
    .sort()
    .reverse();
}

function readLogFile(fileName: string): LogEntry[] {
  const logFile = path.join(LOGS_DIR, fileName);
  if (!fs.existsSync(logFile)) return [];

  const content = fs.readFileSync(logFile, 'utf-8').trim();
  if (!content) return [];

  const lines = content.split('\n').filter(line => line.trim());
  return lines.map(line => {
    try {
      return JSON.parse(line) as LogEntry;
    } catch {
      return null;
    }
  }).filter((entry): entry is LogEntry => entry !== null);
}

export function writeLog(entry: LogEntry, timezone: string): void {
  ensureConfigDir();
  const timestamp = new Date(entry.timestamp);
  const safeDate = Number.isNaN(timestamp.getTime()) ? new Date() : timestamp;
  const date = getDateStringInTimezone(safeDate, timezone);
  const logFile = path.join(LOGS_DIR, `${date}.log`);

  const line = JSON.stringify(entry) + '\n';
  fs.appendFileSync(logFile, line, 'utf-8');

  // Auto-rotate: delete logs older than 30 days (at most once per day)
  if (lastCleanDate !== date) {
    lastCleanDate = date;
    cleanOldLogs(30);
  }
}

export function getLatestLog(): LogEntry | null {
  for (const file of getDatedLogFiles()) {
    const logs = readLogFile(file);
    if (logs.length > 0) {
      return logs[logs.length - 1];
    }
  }
  return null;
}

export function getLogsForDate(date: string): LogEntry[] {
  return readLogFile(`${date}.log`);
}

export function hasSuccessfulRunSince(since: Date): boolean {
  const threshold = since.getTime();

  return getDatedLogFiles().some(file => readLogFile(file).some(entry => {
    if (!(entry.status === 'success' || entry.status === 'boot-recovery')) {
      return false;
    }

    const timestamp = new Date(entry.timestamp).getTime();
    return !Number.isNaN(timestamp) && timestamp >= threshold;
  }));
}

function cleanOldLogs(maxDays: number): void {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxDays);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  for (const file of getDatedLogFiles()) {
    const dateStr = file.replace('.log', '');
    if (dateStr < cutoffStr) {
      try { fs.unlinkSync(path.join(LOGS_DIR, file)); } catch {}
    }
  }
}

// ── Timezone ──

export function detectTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function formatTimeLocal(date: Date, timezone: string): string {
  return date.toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDateTimeLocal(date: Date, timezone: string): string {
  return date.toLocaleString('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ── Shared Formatting ──

/** Format 24h (hour, minute) to 12-hour display string like "5:00 AM" */
export function formatHour(hour: number, min: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${h12}:${min.toString().padStart(2, '0')} ${period}`;
}

// ── Schedule Helpers ──

/**
 * Get the current hour and minute in a given IANA timezone.
 * Uses Intl to reliably extract timezone-local components.
 */
function getNowInTimezone(timezone: string, now: Date = new Date()): { hour: number; minute: number; date: Date } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);

  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === 'hour') hour = parseInt(p.value, 10);
    if (p.type === 'minute') minute = parseInt(p.value, 10);
  }
  // Intl hour12:false can return 24 for midnight in some locales
  if (hour === 24) hour = 0;

  return { hour, minute, date: now };
}

/** Get the next occurrence of the scheduled time */
export function getNextFireTime(config: WarmupConfig, now: Date = new Date()): Date {
  const [schedH, schedM] = config.schedule.time.split(':').map(Number);
  const { hour: nowH, minute: nowM } = getNowInTimezone(config.schedule.timezone, now);

  // Calculate minutes until schedule
  const nowMinutes = nowH * 60 + nowM;
  const schedMinutes = schedH * 60 + schedM;
  let diffMinutes = schedMinutes - nowMinutes;
  if (diffMinutes <= 0) diffMinutes += 24 * 60; // tomorrow

  return new Date(now.getTime() + diffMinutes * 60 * 1000);
}

/** Get the estimated window reset time (fire time + 5 hours) */
export function getWindowResetTime(fireTime: Date): Date {
  const reset = new Date(fireTime);
  reset.setHours(reset.getHours() + 5);
  return reset;
}

/** Calculate how far through the 5-hour window we are (0 to 1) */
export function getWindowProgress(lastFireTime: Date): number {
  const now = new Date();
  const elapsed = now.getTime() - lastFireTime.getTime();
  const windowMs = 5 * 60 * 60 * 1000; // 5 hours
  return Math.min(1, Math.max(0, elapsed / windowMs));
}

export function getMinutesSinceScheduled(scheduleTime: string, timezone: string, now: Date = new Date()): number {
  const [schedH, schedM] = scheduleTime.split(':').map(Number);
  const { hour: nowH, minute: nowM } = getNowInTimezone(timezone, now);

  const schedMinutes = schedH * 60 + schedM;
  const nowMinutes = nowH * 60 + nowM;

  return (nowMinutes - schedMinutes + (24 * 60)) % (24 * 60);
}

export function getMostRecentScheduledOccurrence(scheduleTime: string, timezone: string, now: Date = new Date()): Date {
  const minutesSinceScheduled = getMinutesSinceScheduled(scheduleTime, timezone, now);
  return new Date(now.getTime() - minutesSinceScheduled * 60 * 1000);
}

/**
 * Check if a given time (hour:minute) is approximately "now" in the user's timezone.
 * Used to decide if the scheduler fired at the right time vs. a boot-recovery.
 */
export function isNearScheduledTime(
  scheduleTime: string,
  timezone: string,
  toleranceMinutes: number = 5,
  now: Date = new Date(),
): boolean {
  const [schedH, schedM] = scheduleTime.split(':').map(Number);
  const { hour: nowH, minute: nowM } = getNowInTimezone(timezone, now);

  const schedMinutes = schedH * 60 + schedM;
  const nowMinutes = nowH * 60 + nowM;
  const diff = Math.abs(schedMinutes - nowMinutes);

  return diff <= toleranceMinutes || (24 * 60 - diff) <= toleranceMinutes;
}
