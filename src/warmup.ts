import { spawnSync } from 'child_process';
import {
  getMinutesSinceScheduled,
  getMostRecentScheduledOccurrence,
  hasSuccessfulRunSince,
  LogEntry,
  readConfig,
  writeLog,
} from './config';
import { parseClaudeAuthStatus } from './runtime';

/** Check if Claude Code CLI is installed */
export function isClaudeInstalled(): boolean {
  try {
    const result = spawnSync('claude', ['--version'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/** Check if Claude Code is authenticated (has valid session) */
export function isClaudeAuthenticated(): boolean {
  try {
    const result = spawnSync('claude', ['auth', 'status', '--json'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return parseClaudeAuthStatus(result.stdout || '');
  } catch {
    return false;
  }
}

/** Get Claude Code version string */
export function getClaudeVersion(): string | null {
  try {
    const result = spawnSync('claude', ['--version'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.status === 0) {
      return result.stdout?.trim() || null;
    }
    return null;
  } catch {
    return null;
  }
}

export interface WarmupResult {
  success: boolean;
  message: string;
  duration: number; // ms
  isBootRecovery: boolean;
}

/** Execute the pre-warm: send a minimal message through Claude Code */
export function executeWarmup(isBootRecovery: boolean = false, dryRun: boolean = false): WarmupResult {
  const config = readConfig();
  const startTime = Date.now();
  const timezone = config?.schedule.timezone || 'UTC';
  const claudeBinary = config?.runtime?.claudePath || 'claude';

  if (dryRun) {
    return {
      success: true,
      message: 'Dry run completed successfully (no request sent)',
      duration: 5,
      isBootRecovery,
    };
  }

  try {
    const result = spawnSync(claudeBinary, ['-p', 'ping', '--max-turns', '1'], {
      encoding: 'utf-8',
      timeout: 30000, // 30 second timeout
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CLAUDE_NO_ANALYTICS: '1' },
    });

    const duration = Date.now() - startTime;

    if (result.status === 0) {
      const logEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        status: isBootRecovery ? 'boot-recovery' : 'success',
        message: isBootRecovery
          ? `Boot-recovery pre-warm executed (machine was off at scheduled time)`
          : `Pre-warm executed successfully`,
        scheduledTime: config?.schedule.time || 'unknown',
        actualTime: new Date().toLocaleTimeString('en-US', {
          timeZone: timezone,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
      };
      writeLog(logEntry, timezone);

      return {
        success: true,
        message: isBootRecovery
          ? 'Boot-recovery pre-warm sent!'
          : 'Pre-warm sent successfully!',
        duration,
        isBootRecovery,
      };
    } else {
      const errorMsg = result.stderr?.trim() || 'Unknown error';
      const logEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        status: 'failed',
        message: `Pre-warm failed: ${errorMsg}`,
        scheduledTime: config?.schedule.time || 'unknown',
        actualTime: new Date().toLocaleTimeString('en-US', {
          timeZone: timezone,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
      };
      writeLog(logEntry, timezone);

      return {
        success: false,
        message: `Failed: ${errorMsg}`,
        duration,
        isBootRecovery,
      };
    }
  } catch (err: any) {
    const duration = Date.now() - startTime;
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      status: 'failed',
      message: `Pre-warm error: ${err.message}`,
    };
    writeLog(logEntry, timezone);

    return {
      success: false,
      message: `Error: ${err.message}`,
      duration,
      isBootRecovery,
    };
  }
}

/**
 * Boot-recovery check: determine if we should fire a pre-warm now
 * because the scheduled time was missed (machine was off).
 *
 * Returns true only if:
 * 1. Schedule is enabled
 * 2. The scheduled time already passed today
 * 3. We're still within the 5-hour window (otherwise it's too late)
 * 4. No successful pre-warm has already run today
 */
export function shouldBootRecover(config: {
  schedule: { time: string; timezone: string; enabled: boolean };
}, now: Date = new Date()): boolean {
  if (!config.schedule.enabled) return false;

  const elapsedMinutes = getMinutesSinceScheduled(
    config.schedule.time,
    config.schedule.timezone,
    now,
  );

  if (!(elapsedMinutes > 0 && elapsedMinutes < 5 * 60)) {
    return false;
  }

  const mostRecentScheduledOccurrence = getMostRecentScheduledOccurrence(
    config.schedule.time,
    config.schedule.timezone,
    now,
  );

  return !hasSuccessfulRunSince(mostRecentScheduledOccurrence);
}
