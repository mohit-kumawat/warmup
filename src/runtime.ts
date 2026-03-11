import * as path from 'path';
import { spawnSync } from 'child_process';

export interface RuntimePaths {
  nodePath: string;
  cliEntry: string;
  claudePath: string;
}

interface ClaudeAuthStatus {
  loggedIn?: boolean;
}

function getLocatorCommand(): string {
  return process.platform === 'win32' ? 'where' : 'which';
}

function getFirstOutputLine(output: string): string | null {
  const line = output
    .split(/\r?\n/)
    .map(entry => entry.trim())
    .find(Boolean);

  return line || null;
}

export function findExecutable(command: string): string | null {
  try {
    const result = spawnSync(getLocatorCommand(), [command], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result.error || result.status !== 0) {
      return null;
    }

    const line = getFirstOutputLine(result.stdout || '');
    return line ? path.resolve(line) : null;
  } catch {
    return null;
  }
}

export function parseClaudeAuthStatus(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as ClaudeAuthStatus;
    return parsed.loggedIn === true;
  } catch {
    return false;
  }
}

export function resolveRuntimePaths(cliEntry: string = process.argv[1]): RuntimePaths {
  if (!cliEntry) {
    throw new Error('Unable to determine the current warmup CLI entry path.');
  }

  const claudePath = findExecutable('claude');
  if (!claudePath) {
    throw new Error('Claude Code not found in PATH.');
  }

  return {
    nodePath: path.resolve(process.execPath),
    cliEntry: path.resolve(cliEntry),
    claudePath,
  };
}
