import assert from 'assert/strict';
import chalk from 'chalk';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { stripVTControlCharacters } from 'util';
import { buildLinuxWarmupScript, determineLinuxSchedulerBackend } from '../src/scheduler/linux';
import { buildMacWarmupScript } from '../src/scheduler/macos';
import { buildWindowsWarmupScript } from '../src/scheduler/windows';
import { parseClaudeAuthStatus } from '../src/runtime';

type ConfigModule = typeof import('../src/config');
type WarmupModule = typeof import('../src/warmup');
type UiModule = typeof import('../src/ui');
type SetupModule = typeof import('../src/commands/setup');
type DefaultCommandModule = typeof import('../src/commands/default');

const PROJECT_ROOT = path.resolve(__dirname, '..');

function loadFreshModule<T>(relativePath: string): T {
  const modulePath = path.join(PROJECT_ROOT, relativePath);
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  return require(resolved) as T;
}

function stripAnsi(input: string): string {
  return stripVTControlCharacters(input);
}

async function captureConsoleOutput(testFn: () => Promise<void> | void): Promise<string[]> {
  const originalLog = console.log;
  const lines: string[] = [];

  console.log = (...args: unknown[]) => {
    lines.push(args.join(' '));
  };

  try {
    await testFn();
  } finally {
    console.log = originalLog;
  }

  return lines;
}

interface LoadedModules {
  config: ConfigModule;
  warmup: WarmupModule;
  ui: UiModule;
  setup: SetupModule;
  defaultCommand: DefaultCommandModule;
}

async function withTempConfigDir(
  testFn: (modules: LoadedModules, dir: string) => Promise<void> | void,
): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'warmup-test-'));
  const previousConfigDir = process.env.WARMUP_CONFIG_DIR;

  process.env.WARMUP_CONFIG_DIR = tempDir;

  try {
    const config = loadFreshModule<ConfigModule>('src/config');
    const warmup = loadFreshModule<WarmupModule>('src/warmup');
    const ui = loadFreshModule<UiModule>('src/ui');
    const setup = loadFreshModule<SetupModule>('src/commands/setup');
    const defaultCommand = loadFreshModule<DefaultCommandModule>('src/commands/default');

    await testFn({ config, warmup, ui, setup, defaultCommand }, tempDir);
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

async function testDefaultCommandRouting(): Promise<void> {
  const defaultModule = loadFreshModule<DefaultCommandModule>('src/commands/default');

  let statusCalls = 0;
  let onboardingCalls = 0;
  const statusRoute = await defaultModule.defaultCommand({
    readConfig: () => ({ schedule: {} } as any),
    runStatus: async () => { statusCalls += 1; },
    runFirstRunOnboarding: async () => { onboardingCalls += 1; },
  });

  assert.equal(statusRoute, 'status');
  assert.equal(statusCalls, 1);
  assert.equal(onboardingCalls, 0);

  statusCalls = 0;
  onboardingCalls = 0;
  const onboardingRoute = await defaultModule.defaultCommand({
    readConfig: () => null,
    runStatus: async () => { statusCalls += 1; },
    runFirstRunOnboarding: async () => { onboardingCalls += 1; },
  });

  assert.equal(onboardingRoute, 'onboarding');
  assert.equal(statusCalls, 0);
  assert.equal(onboardingCalls, 1);
}

async function testMidnightBootRecovery(): Promise<void> {
  await withTempConfigDir(({ config, warmup }) => {
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

async function testNoFalseRecoveryBeforeSchedule(): Promise<void> {
  await withTempConfigDir(({ warmup }) => {
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

async function testTimezoneLocalLogDates(): Promise<void> {
  await withTempConfigDir(({ config }) => {
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

async function testFirstRunCancelPath(): Promise<void> {
  await withTempConfigDir(async ({ config, defaultCommand }) => {
    let setupCalls = 0;
    let deferredCalls = 0;

    await defaultCommand.runFirstRunOnboarding({
      confirmStartSetup: async () => false,
      printLogo: () => {},
      printFirstRunIntro: () => {},
      printSetupTransparency: () => {},
      printSetupDeferred: () => { deferredCalls += 1; },
      runSetup: async () => { setupCalls += 1; },
    });

    assert.equal(setupCalls, 0);
    assert.equal(deferredCalls, 1);
    assert.equal(config.configExists(), false);
  });
}

async function testSetupTransparencyCopy(): Promise<void> {
  await withTempConfigDir(async ({ config, ui }) => {
    const lines = ui.renderSetupTransparencyLines();

    assert.equal(lines[1], 'claude -p ping --max-turns 1');
    assert.ok(lines.some(line => line.includes('does not start your 5-hour window')));
    assert.ok(lines.some(line => line.includes(config.getConfigFilePath())));
    assert.ok(lines.some(line => line.includes(`${config.getLogsDir()}/`)));
    assert.ok(lines.some(line => line.includes('warmup uninstall')));
  });
}

async function testInstallPreviewCopy(): Promise<void> {
  await withTempConfigDir(async ({ config, ui }) => {
    const lines = ui.renderInstallPreviewLines({
      explanation: 'Reset should land at noon.',
      warmTime: '7:00 AM',
      timezone: 'America/New_York',
      resetTime: '12:00 PM',
      schedulerLabel: 'macOS (launchd LaunchAgent)',
    });

    assert.ok(lines.some(line => line.includes('Expected reset: ~12:00 PM')));
    assert.ok(lines.some(line => line.includes('Scheduler: macOS (launchd LaunchAgent)')));
    assert.ok(lines.some(line => line.includes(config.getConfigFilePath())));
    assert.ok(lines.some(line => line.includes(`${config.getLogsDir()}/`)));
    assert.ok(lines.some(line => line.includes('does not send a live pre-warm yet')));
  });
}

function testPostSetupNextStepsCopy(): void {
  const ui = loadFreshModule<UiModule>('src/ui');
  const lines = ui.renderPostSetupNextStepLines();

  assert.ok(lines.some(line => line.includes('without sending a live Claude request')));
  assert.ok(lines.some(line => line.includes('warmup status')));
  assert.ok(lines.some(line => line.includes('warmup test')));
  assert.ok(lines.some(line => line.includes('starts a real 5-hour window')));
  assert.ok(lines.some(line => line.includes('warmup uninstall')));
  assert.ok(lines.some(line => line.includes('Use it only when you want a manual pre-warm')));
}

function testVisibleWidthHelpers(): void {
  const ui = loadFreshModule<UiModule>('src/ui');

  assert.equal(ui.visibleTextWidth(chalk.magenta('warmup')), 6);
  assert.equal(ui.visibleTextWidth(ui.padVisibleText(chalk.magenta('warmup'), 12)), 12);
  assert.equal(ui.visibleTextWidth(ui.padVisibleText('⚡ warmup', 14)), 14);
}

function testDetailRowAlignment(): void {
  const ui = loadFreshModule<UiModule>('src/ui');
  const lines = ui.renderDetailRows([
    { label: 'Schedule', value: `${chalk.green('7:00 AM')} daily` },
    { label: 'Last run', value: `${chalk.yellow('7:10 AM')} ${chalk.green('success')}` },
  ], { minLabelWidth: ui.visibleTextWidth('Window:') }).map(stripAnsi);

  assert.equal(lines[0].indexOf('7:00 AM'), lines[1].indexOf('7:10 AM'));
}

function testMiniLogoRendering(): void {
  const ui = loadFreshModule<UiModule>('src/ui');
  const lines = ui.renderMiniLogoLines().map(stripAnsi);

  assert.equal(lines[1].trim(), 'warmup v1.0.0');
}

function testWindowMarkerLayout(): void {
  const ui = loadFreshModule<UiModule>('src/ui');
  const markers = ui.renderWindowMarkerLines(30, 0.4, '7:00 AM', '9:24 AM', '12:00 PM');

  assert.equal(markers.labelRows.length, 1);
  assert.equal(markers.timeRows.length, 1);
  assert.ok(markers.labelRows[0].indexOf('start') < markers.labelRows[0].indexOf('now'));
  assert.ok(markers.labelRows[0].indexOf('now') < markers.labelRows[0].indexOf('reset'));
  assert.ok(markers.timeRows[0].indexOf('7:00 AM') < markers.timeRows[0].indexOf('9:24 AM'));
  assert.ok(markers.timeRows[0].indexOf('9:24 AM') < markers.timeRows[0].indexOf('12:00 PM'));
}

async function testStatusRendering(): Promise<void> {
  await withTempConfigDir(async ({ config, ui }) => {
    const warmupConfig = {
      version: '1.0.0',
      schedule: {
        time: '07:00',
        timezone: 'America/New_York',
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

    config.writeLog({
      timestamp: new Date(Date.now() - (2 * 60 * 60 * 1000)).toISOString(),
      status: 'success',
      message: 'Pre-warm executed successfully',
      actualTime: '7:00 AM',
    }, warmupConfig.schedule.timezone);

    const lines = (await captureConsoleOutput(async () => {
      await ui.displayStatus(warmupConfig);
    })).map(stripAnsi);

    const scheduleLine = lines.find(line => line.includes('Schedule:'));
    const lastRunLine = lines.find(line => line.includes('Last run:'));
    const windowLine = lines.find(line => line.includes('Window:'));

    assert.equal(lines.find(line => line.trim().length > 0), '  warmup v1.0.0');
    assert.ok(scheduleLine);
    assert.ok(lastRunLine);
    assert.ok(windowLine);
    assert.equal(scheduleLine!.indexOf('7:00 AM'), lastRunLine!.indexOf('7:00 AM'));
    assert.ok(lines.some(line => line.includes('start')));
    assert.ok(lines.some(line => line.includes('reset')));
    assert.ok(!lines.some(line => line.includes('(now)')));
  });
}

async function testSetupCancelBeforeInstall(): Promise<void> {
  await withTempConfigDir(async ({ config, setup }) => {
    let previewCalls = 0;
    let deferredCalls = 0;
    let spinnerCalls = 0;
    let ensureDirCalls = 0;
    let installCalls = 0;
    let writeConfigCalls = 0;

    const result = await setup.confirmAndInstallSchedule({
      explanation: 'Reset should land at noon.',
      time: '07:00',
      hour: 7,
      minute: 0,
      warmTime: '7:00 AM',
      timezone: 'America/New_York',
      resetTime: '12:00 PM',
      schedulerLabel: 'macOS (launchd LaunchAgent)',
    }, {
      printInstallPreview: () => { previewCalls += 1; },
      confirmInstall: async () => false,
      printSetupDeferred: () => { deferredCalls += 1; },
      createInstallSpinner: () => {
        spinnerCalls += 1;
        return {
          succeed: () => {},
          fail: () => {},
        };
      },
      ensureConfigDir: () => {
        ensureDirCalls += 1;
        config.ensureConfigDir();
      },
      resolveRuntimePaths: () => ({
        nodePath: '/usr/local/bin/node',
        cliEntry: '/tmp/warmup/dist/index.js',
        claudePath: '/usr/local/bin/claude',
      }),
      installSchedule: () => { installCalls += 1; },
      createDefaultConfig: config.createDefaultConfig,
      writeConfig: () => { writeConfigCalls += 1; },
      animateSetupComplete: async () => {},
    });

    assert.equal(result, 'cancelled');
    assert.equal(previewCalls, 1);
    assert.equal(deferredCalls, 1);
    assert.equal(spinnerCalls, 0);
    assert.equal(ensureDirCalls, 0);
    assert.equal(installCalls, 0);
    assert.equal(writeConfigCalls, 0);
    assert.equal(config.configExists(), false);
  });
}

function testReadmeQuickStartCopy(): void {
  const readme = fs.readFileSync(path.join(PROJECT_ROOT, 'README.md'), 'utf-8');

  assert.match(readme, /npm install -g @mohitkumawat\/warmup-cli/);
  assert.match(readme, /```bash\nwarmup\n```/);
  assert.match(readme, /## What happens/);
  assert.match(readme, /claude -p ping --max-turns 1/);
  assert.match(readme, /## What does not happen/);
  assert.match(readme, /warmup setup/);
}

async function main(): Promise<void> {
  testAuthStatusParsing();
  await testDefaultCommandRouting();
  await testMidnightBootRecovery();
  await testNoFalseRecoveryBeforeSchedule();
  await testTimezoneLocalLogDates();
  testSchedulerScriptGeneration();
  testLinuxBackendSelection();
  await testFirstRunCancelPath();
  await testSetupTransparencyCopy();
  await testInstallPreviewCopy();
  testPostSetupNextStepsCopy();
  testVisibleWidthHelpers();
  testDetailRowAlignment();
  testMiniLogoRendering();
  testWindowMarkerLayout();
  await testStatusRendering();
  await testSetupCancelBeforeInstall();
  testReadmeQuickStartCopy();

  console.log('All warmup tests passed.');
}

void main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
