import assert from 'assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildLinuxWarmupScript, determineLinuxSchedulerBackend } from '../src/scheduler/linux';
import { buildMacWarmupScript } from '../src/scheduler/macos';
import { buildWindowsWarmupScript } from '../src/scheduler/windows';
import { parseClaudeAuthStatus } from '../src/runtime';

type ConfigModule = typeof import('../src/config');
type WarmupModule = typeof import('../src/warmup');

const PROJECT_ROOT = path.resolve(__dirname, '..');

function loadFreshModule<T>(relativePath: string): T {
  const modulePath = path.join(PROJECT_ROOT, relativePath);
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  return require(resolved) as T;
}

function withTempConfigDir(testFn: (config: ConfigModule, warmup: WarmupModule, dir: string) => void): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'warmup-test-'));
  const previousConfigDir = process.env.WARMUP_CONFIG_DIR;

  process.env.WARMUP_CONFIG_DIR = tempDir;

  try {
    const config = loadFreshModule<ConfigModule>('src/config');
    const warmup = loadFreshModule<WarmupModule>('src/warmup');
    testFn(config, warmup, tempDir);
  } finally {
    if (previousConfigDir === undefined) {
      delete process.env.WARMUP_CONFIG_DIR;
    } else {
      process.env.WARMUP_CONFIG_DIR = previousConfigDir;
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function testAuthStatusParsing(): void {
  assert.equal(parseClaudeAuthStatus('{"loggedIn":true}'), true);
  assert.equal(parseClaudeAuthStatus('{"loggedIn":false}'), false);
  assert.equal(parseClaudeAuthStatus('not-json'), false);
}

function testMidnightBootRecovery(): void {
  withTempConfigDir((config, warmup) => {
    const runtime = {
      nodePath: '/usr/local/bin/node',
      cliEntry: '/tmp/warmup/dist/index.js',
      claudePath: '/usr/local/bin/claude',
    };

    const warmupConfig = {
      version: '1.0.0',
      schedule: {
        time: '23:00',
        timezone: 'UTC',
        enabled: true,
      },
      runtime,
      createdAt: new Date('2026-03-11T00:00:00Z').toISOString(),
      updatedAt: new Date('2026-03-11T00:00:00Z').toISOString(),
    };

    assert.equal(
      warmup.shouldBootRecover(warmupConfig, new Date('2026-03-12T00:30:00Z')),
      true,
    );

    config.writeLog({
      timestamp: '2026-03-11T23:05:00Z',
      status: 'success',
      message: 'Pre-warm executed successfully',
    }, 'UTC');

    assert.equal(
      warmup.shouldBootRecover(warmupConfig, new Date('2026-03-12T00:30:00Z')),
      false,
    );
  });
}

function testNoFalseRecoveryBeforeSchedule(): void {
  withTempConfigDir((_config, warmup) => {
    const warmupConfig = {
      version: '1.0.0',
      schedule: {
        time: '05:00',
        timezone: 'UTC',
        enabled: true,
      },
      runtime: {
        nodePath: '/usr/local/bin/node',
        cliEntry: '/tmp/warmup/dist/index.js',
        claudePath: '/usr/local/bin/claude',
      },
      createdAt: new Date('2026-03-11T00:00:00Z').toISOString(),
      updatedAt: new Date('2026-03-11T00:00:00Z').toISOString(),
    };

    assert.equal(
      warmup.shouldBootRecover(warmupConfig, new Date('2026-03-11T04:30:00Z')),
      false,
    );
  });
}

function testTimezoneLocalLogDates(): void {
  withTempConfigDir((config) => {
    config.writeLog({
      timestamp: '2026-03-12T06:30:00Z',
      status: 'success',
      message: 'Pre-warm executed successfully',
    }, 'America/Los_Angeles');

    assert.equal(config.getLogsForDate('2026-03-11').length, 1);
    assert.equal(config.getLogsForDate('2026-03-12').length, 0);
  });
}

function testSchedulerScriptGeneration(): void {
  const runtime = {
    nodePath: '/opt/node/bin/node',
    cliEntry: '/Users/test/warmup/dist/index.js',
    claudePath: '/opt/bin/claude',
  };

  const macScript = buildMacWarmupScript(runtime);
  const linuxScript = buildLinuxWarmupScript(runtime);
  const windowsScript = buildWindowsWarmupScript(runtime);

  assert.match(macScript, /\/opt\/node\/bin\/node/);
  assert.match(macScript, /_execute-warmup/);
  assert.doesNotMatch(macScript, /which warmup/);

  assert.match(linuxScript, /\/Users\/test\/warmup\/dist\/index\.js/);
  assert.doesNotMatch(linuxScript, /which warmup/);

  assert.match(windowsScript, /\\\.warmup\\logs\\schtasks\.log/);
  assert.match(windowsScript, /_execute-warmup/);
  assert.doesNotMatch(windowsScript, /where warmup/i);
}

function testLinuxBackendSelection(): void {
  assert.equal(determineLinuxSchedulerBackend(true, false), 'systemd');
  assert.equal(determineLinuxSchedulerBackend(false, true), 'cron');
  assert.throws(() => determineLinuxSchedulerBackend(false, false), /Neither a usable user systemd session nor crontab is available/);
}

function main(): void {
  testAuthStatusParsing();
  testMidnightBootRecovery();
  testNoFalseRecoveryBeforeSchedule();
  testTimezoneLocalLogDates();
  testSchedulerScriptGeneration();
  testLinuxBackendSelection();

  console.log('All warmup tests passed.');
}

main();
