import * as os from 'os';
import chalk from 'chalk';
import boxen from 'boxen';
import gradient from 'gradient-string';
import figures from 'figures';
import {
  WarmupConfig,
  getLatestLog,
  formatTimeLocal,
  formatHour,
  getConfigFilePath,
  getLogsDir,
} from './config';

const stringWidth = require('string-width') as (input: string) => number;

// ── Brand Colors ──
const BRAND = gradient(['#6C5CE7', '#A29BFE', '#74B9FF']);
const ACCENT = chalk.hex('#6C5CE7');
const SUCCESS = chalk.hex('#00B894');
const WARNING = chalk.hex('#FDCB6E');
const ERROR = chalk.hex('#E17055');
const DIM = chalk.gray;
const BRIGHT = chalk.white.bold;
const CLI_PING_COMMAND = 'claude -p ping --max-turns 1';
const NEXT_ACTIONS = [
  {
    command: 'warmup status',
    description: 'See your schedule, last run, and window progress',
    tone: 'accent' as const,
  },
  {
    command: 'warmup test',
    description: 'Send one real pre-warm now (starts a real 5-hour window)',
    tone: 'warning' as const,
  },
  {
    command: 'warmup uninstall',
    description: 'Remove the scheduled task later',
    tone: 'dim' as const,
  },
];
let setupTransparencyShown = false;

interface DetailRow {
  label: string;
  value: string;
}

interface CommandHelpRow {
  command: string;
  description: string;
  tone?: 'accent' | 'warning' | 'dim';
}

export interface TrackLabel {
  position: number;
  text: string;
}

export interface InstallPreviewContent {
  explanation: string;
  warmTime: string;
  timezone: string;
  resetTime: string;
  schedulerLabel: string;
  note?: string;
}

export interface WindowMarkerLines {
  labelRows: string[];
  timeRows: string[];
}

// ── Utility ──
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function visibleTextWidth(input: string): number {
  return stringWidth(input);
}

export function padVisibleText(input: string, width: number): string {
  return input + ' '.repeat(Math.max(0, width - visibleTextWidth(input)));
}

function buildRowPrefix(label: string, labelWidth: number, indent = '  '): string {
  return `${indent}${DIM(padVisibleText(`${label}:`, labelWidth + 1))}`;
}

export function renderDetailRows(
  rows: DetailRow[],
  options: { indent?: string; minLabelWidth?: number } = {},
): string[] {
  const labelWidth = rows.reduce((max, row) => {
    return Math.max(max, visibleTextWidth(`${row.label}:`));
  }, options.minLabelWidth ?? 0);
  const indent = options.indent ?? '  ';

  return rows.map(row => `${buildRowPrefix(row.label, labelWidth, indent)}${row.value}`);
}

function styleCommand(text: string, tone: CommandHelpRow['tone'] = 'accent'): string {
  switch (tone) {
    case 'warning':
      return WARNING(text);
    case 'dim':
      return DIM(text);
    default:
      return ACCENT(text);
  }
}

function renderCommandHelpRows(
  rows: CommandHelpRow[],
  options: { indent?: string } = {},
): string[] {
  const indent = options.indent ?? '  ';
  const commandWidth = rows.reduce((max, row) => Math.max(max, visibleTextWidth(row.command)), 0);

  return rows.map(row => {
    const command = styleCommand(padVisibleText(row.command, commandWidth + 2), row.tone);
    return `${indent}${command}${DIM(row.description)}`;
  });
}

export function renderTrackLabelRows(width: number, items: TrackLabel[]): string[] {
  const rows: string[][] = [];
  const occupied: boolean[][] = [];

  const filtered = items
    .filter(item => item.text.trim().length > 0)
    .sort((a, b) => a.position - b.position);

  for (const item of filtered) {
    const characters = Array.from(item.text);
    const textWidth = visibleTextWidth(item.text);
    const maxStart = Math.max(0, width - textWidth);
    const centeredStart = Math.round(item.position - (textWidth / 2));
    const start = Math.max(0, Math.min(maxStart, centeredStart));

    let rowIndex = 0;
    for (;;) {
      if (!rows[rowIndex]) {
        rows[rowIndex] = Array.from({ length: width }, () => ' ');
        occupied[rowIndex] = Array.from({ length: width }, () => false);
      }

      const canPlace = occupied[rowIndex]
        .slice(start, start + textWidth)
        .every(value => !value);

      if (canPlace) {
        for (let index = 0; index < textWidth; index += 1) {
          occupied[rowIndex][start + index] = true;
        }

        for (let index = 0; index < characters.length; index += 1) {
          rows[rowIndex][start + index] = characters[index];
        }
        break;
      }

      rowIndex += 1;
    }
  }

  return rows.map(row => row.join('').replace(/\s+$/, ''));
}

export function renderWindowMarkerLines(
  barWidth: number,
  progress: number,
  startTime: string,
  nowTime: string,
  resetTime: string,
): WindowMarkerLines {
  const nowPosition = Math.max(0, Math.min(barWidth - 1, Math.round(progress * (barWidth - 1))));

  return {
    labelRows: renderTrackLabelRows(barWidth, [
      { position: 0, text: 'start' },
      { position: nowPosition, text: 'now' },
      { position: barWidth - 1, text: 'reset' },
    ]),
    timeRows: renderTrackLabelRows(barWidth, [
      { position: 0, text: startTime },
      { position: nowPosition, text: nowTime },
      { position: barWidth - 1, text: resetTime },
    ]),
  };
}

function toDisplayPath(target: string): string {
  const home = os.homedir();
  return target.startsWith(home) ? `~${target.slice(home.length)}` : target;
}

// ── Logo / Brand ──
export function printLogo(): void {
  const logo = `
  _    _
 | |  | |
 | |  | | __ _ _ __ _ __ ___  _   _ _ __
 | |  | |/ _\` | '__| '_ \` _ \\| | | | '_ \\
 | |__| | (_| | |  | | | | | | |_| | |_) |
  \\____/ \\__,_|_|  |_| |_| |_|\\__,_| .__/
                                    | |
                                    |_|
`;
  console.log(BRAND(logo));
  console.log(DIM('  Pre-warm your Claude rate limits while you sleep.\n'));
}

export function renderMiniLogoLines(): string[] {
  return [
    '',
    `  ${BRIGHT('warmup')} ${DIM('v1.0.0')}`,
    '',
  ];
}

export function printMiniLogo(): void {
  for (const line of renderMiniLogoLines()) {
    console.log(line);
  }
}

export function renderSetupTransparencyLines(): string[] {
  return [
    'warmup schedules one tiny Claude Code ping each day:',
    CLI_PING_COMMAND,
    'Setup only checks Claude Code install + auth. It does not start your 5-hour window.',
    `Config stays local: ${toDisplayPath(getConfigFilePath())}`,
    `Logs stay local: ${toDisplayPath(getLogsDir())}/`,
    'Remove it anytime with: warmup uninstall',
  ];
}

export function printFirstRunIntro(): void {
  console.log(`  ${BRIGHT('First run:')} ${DIM('warmup will explain the exact scheduled action before it installs anything.')}`);
  console.log('');
}

export function printSetupTransparency(): void {
  if (setupTransparencyShown) return;
  setupTransparencyShown = true;

  const lines = renderSetupTransparencyLines();
  console.log(boxen(
    BRIGHT('Before we install anything') + '\n\n' +
    DIM(lines[0]) + '\n' +
    ACCENT(lines[1]) + '\n\n' +
    DIM(lines[2]) + '\n' +
    DIM(lines[3]) + '\n' +
    DIM(lines[4]) + '\n' +
    DIM(lines[5]),
    {
      padding: 1,
      margin: { top: 0, bottom: 0, left: 2, right: 2 },
      borderStyle: 'round',
      borderColor: '#74B9FF',
    },
  ));
  console.log('');
}

export function renderInstallPreviewLines(preview: InstallPreviewContent): string[] {
  return [
    preview.explanation,
    `Schedule: ${preview.warmTime} daily (${preview.timezone})`,
    `Expected reset: ~${preview.resetTime}`,
    `Scheduler: ${preview.schedulerLabel}`,
    `Config file: ${toDisplayPath(getConfigFilePath())}`,
    `Logs: ${toDisplayPath(getLogsDir())}/`,
    preview.note ?? 'This step installs the schedule only. It does not send a live pre-warm yet.',
  ];
}

export function printInstallPreview(preview: InstallPreviewContent): void {
  const lines = renderInstallPreviewLines(preview);

  console.log(`  ${BRIGHT('Schedule preview')}`);
  console.log(`  ${DIM(lines[0])}`);
  console.log('');

  for (const line of renderDetailRows([
    { label: 'Schedule', value: `${ACCENT(preview.warmTime)} daily ${DIM(`(${preview.timezone})`)}` },
    { label: 'Reset at', value: SUCCESS(`~${preview.resetTime}`) },
    { label: 'Scheduler', value: ACCENT(preview.schedulerLabel) },
    { label: 'Config', value: DIM(toDisplayPath(getConfigFilePath())) },
    { label: 'Logs', value: DIM(`${toDisplayPath(getLogsDir())}/`) },
  ], { minLabelWidth: visibleTextWidth('Scheduler:') })) {
    console.log(line);
  }

  console.log('');
  for (const line of renderDetailRows([
    { label: 'Note', value: WARNING(lines[6]) },
  ], { minLabelWidth: visibleTextWidth('Scheduler:') })) {
    console.log(line);
  }
  console.log('');
}

export function renderPostSetupNextStepLines(): string[] {
  return [
    'Setup finished without sending a live Claude request.',
    ...NEXT_ACTIONS.map(action => `${action.command} ${action.description}`),
    'warmup test starts a real 5-hour window. Use it only when you want a manual pre-warm.',
  ];
}

export function printSetupNextActions(): void {
  console.log(`  ${BRIGHT('Next actions')}`);
  console.log(`  ${DIM('Setup finished without sending a live Claude request.')}`);
  console.log('');

  for (const line of renderCommandHelpRows(NEXT_ACTIONS)) {
    console.log(line);
  }

  console.log('');
  console.log(`  ${WARNING(figures.warning)} ${DIM('warmup test starts a real 5-hour window. Use it only when you want a manual pre-warm.')}`);
  console.log('');
}

export function printSetupDeferred(): void {
  console.log(`  ${DIM('Nothing was installed.')}`);
  console.log(`  ${DIM('Run')} ${ACCENT('warmup setup')} ${DIM('when you are ready.')}`);
  console.log('');
}

// ── Post-Setup Summary ──
export async function animateSetupComplete(config: WarmupConfig): Promise<void> {
  const [h, m] = config.schedule.time.split(':').map(Number);
  const warmTime = formatHour(h, m);
  const resetTime = formatHour((h + 5) % 24, m);

  console.log('');
  console.log(`  ${SUCCESS(figures.tick)} ${BRIGHT('warmup is set up')}`);
  await sleep(120);
  console.log('');

  for (const line of renderDetailRows([
    { label: 'Schedule', value: `${ACCENT(warmTime)} daily ${DIM(`(${config.schedule.timezone})`)}` },
    { label: 'Reset at', value: SUCCESS(`~${resetTime}`) },
    { label: 'Time saved', value: SUCCESS('~2-3 hours on heavy-use days') },
  ], { minLabelWidth: visibleTextWidth('Time saved:') })) {
    console.log(line);
    await sleep(80);
  }

  console.log('');
  printSetupNextActions();
}

// ── Status Display ──
export async function displayStatus(
  config: WarmupConfig,
  options: { needsRuntimeRefresh?: boolean } = {},
): Promise<void> {
  printMiniLogo();

  const tz = config.schedule.timezone;
  const [h, m] = config.schedule.time.split(':').map(Number);
  const warmTime = formatHour(h, m);
  const lastLog = getLatestLog();

  let resetTime: string;
  if (lastLog && (lastLog.status === 'success' || lastLog.status === 'boot-recovery')) {
    const lastFireTime = new Date(lastLog.timestamp);
    resetTime = formatTimeLocal(new Date(lastFireTime.getTime() + 5 * 60 * 60 * 1000), tz);
  } else {
    resetTime = formatHour((h + 5) % 24, m);
  }

  const enabledStr = config.schedule.enabled
    ? SUCCESS('active')
    : WARNING('paused');

  const rows: DetailRow[] = [
    {
      label: 'Schedule',
      value: `${ACCENT(warmTime)} daily ${DIM(`(${tz})`)} ${enabledStr}`,
    },
  ];

  if (lastLog) {
    const statusIcon = lastLog.status === 'success'
      ? SUCCESS(figures.tick)
      : lastLog.status === 'boot-recovery'
        ? WARNING(figures.warning)
        : ERROR(figures.cross);
    const statusText = lastLog.status === 'success'
      ? SUCCESS('success')
      : lastLog.status === 'boot-recovery'
        ? WARNING('boot-recovery')
        : ERROR('failed');

    const logDate = new Date(lastLog.timestamp);
    const timeStr = lastLog.actualTime || formatTimeLocal(logDate, tz);
    rows.push({
      label: 'Last run',
      value: `${ACCENT(timeStr)} ${statusIcon} ${statusText}`,
    });

    if (lastLog.status === 'boot-recovery') {
      rows.push({
        label: 'Boot catch',
        value: WARNING('machine was off at scheduled time'),
      });
    }
  } else {
    rows.push({
      label: 'Last run',
      value: DIM('no runs yet'),
    });
  }

  const labelWidth = rows.reduce((max, row) => {
    return Math.max(max, visibleTextWidth(`${row.label}:`), visibleTextWidth('Window:'));
  }, 0);

  for (const line of renderDetailRows(rows, { minLabelWidth: labelWidth })) {
    console.log(line);
  }

  if (options.needsRuntimeRefresh) {
    console.log(`  ${WARNING(figures.warning)} ${DIM('Older install detected. Run')} ${ACCENT('warmup update')} ${DIM('once to refresh scheduler scripts.')}`);
  }

  console.log('');

  const windowPrefix = buildRowPrefix('Window', labelWidth);
  const barWidth = 30;

  if (lastLog && (lastLog.status === 'success' || lastLog.status === 'boot-recovery')) {
    const lastFireTime = new Date(lastLog.timestamp);
    const now = new Date();
    const elapsedMs = now.getTime() - lastFireTime.getTime();
    const windowMs = 5 * 60 * 60 * 1000;
    const progress = Math.min(1, Math.max(0, elapsedMs / windowMs));

    if (progress < 1) {
      const filled = Math.round(progress * barWidth);
      const partial = Math.min(3, barWidth - filled);
      const empty = barWidth - filled - partial;

      const bar = ACCENT('█'.repeat(filled)) +
        DIM('▓'.repeat(partial)) +
        DIM('░'.repeat(empty));
      const pctStr = `${Math.round(progress * 100)}%`;
      console.log(`${windowPrefix}[${bar}] ${BRIGHT(pctStr)} elapsed`);

      const markerLines = renderWindowMarkerLines(
        barWidth,
        progress,
        lastLog.actualTime || warmTime,
        formatTimeLocal(now, tz),
        resetTime,
      );
      const markerPrefix = ' '.repeat(visibleTextWidth(windowPrefix) + 1);

      for (const line of markerLines.labelRows) {
        console.log(`${markerPrefix}${DIM(line)}`);
      }
      for (const line of markerLines.timeRows) {
        console.log(`${markerPrefix}${line}`);
      }

      const remainMs = windowMs - elapsedMs;
      const remainHours = Math.floor(remainMs / (60 * 60 * 1000));
      const remainMins = Math.floor((remainMs % (60 * 60 * 1000)) / (60 * 1000));

      console.log('');
      if (remainHours > 0) {
        console.log(`  ${SUCCESS(figures.tick)} Window resets in ~${BRIGHT(`${remainHours}h ${remainMins}m`)}. Full capacity at ${SUCCESS(resetTime)}.`);
      } else {
        console.log(`  ${SUCCESS(figures.tick)} Window resets in ~${BRIGHT(`${remainMins}m`)}. Almost there!`);
      }
    } else {
      console.log(`${windowPrefix}[${SUCCESS('█'.repeat(barWidth))}] ${SUCCESS.bold('RESET!')}`);
      console.log('');
      console.log(`  ${SUCCESS(figures.tick)} ${SUCCESS.bold('Your window has reset!')} Full capacity available.`);
    }
  } else if (!config.schedule.enabled) {
    console.log(`${windowPrefix}${WARNING('Schedule is paused.')} ${DIM('Run')} ${ACCENT('warmup resume')} ${DIM('to reactivate.')}`);
  } else {
    console.log(`${windowPrefix}${DIM('waiting for first pre-warm...')}`);
  }

  console.log('');
}

// ── Boot Recovery Animation ──
export async function animateBootRecovery(scheduledTime: string, actualTime: string): Promise<void> {
  console.log('');
  console.log(`  ${WARNING('⚡')} ${WARNING.bold('warmup:')} Missed ${ACCENT(scheduledTime)} schedule ${DIM('(machine was off)')}`);
  await sleep(500);
  console.log(`  ${WARNING('⚡')} Firing pre-warm now ${DIM(`(${actualTime})`)}...`);
  await sleep(1000);
}

export async function animateBootRecoverySuccess(resetTime: string): Promise<void> {
  console.log(`  ${SUCCESS(figures.tick)} Pre-warm sent! Window started.`);
  await sleep(300);
  console.log(`  ${SUCCESS(figures.tick)} Your window will reset at ~${SUCCESS.bold(resetTime)}.`);
  console.log('');
  console.log(DIM('  Tip: Keep your machine on overnight for best results,'));
  console.log(DIM('       or enable auto-wake in System Settings.'));
  console.log('');
}

// ── Test Animation ──
export async function animateTestWarmup(): Promise<void> {
  console.log('');
  console.log(`  ${ACCENT('⚡')} Sending test pre-warm...`);
  await sleep(500);
}

export async function animateTestSuccess(duration: number): Promise<void> {
  console.log(`  ${SUCCESS(figures.tick)} ${SUCCESS.bold('Pre-warm sent!')} ${DIM(`(${duration}ms)`)}`);
  console.log(`  ${DIM('This counted as a real pre-warm and started your rate limit window.')}`);
  console.log('');
}

export async function animateTestFailure(message: string): Promise<void> {
  console.log(`  ${ERROR(figures.cross)} ${ERROR.bold('Pre-warm failed!')}`);
  console.log(`  ${DIM(message)}`);
  console.log('');
}

// ── Pause/Resume Messages ──
export function printPaused(): void {
  console.log('');
  console.log(`  ${WARNING('○')} ${WARNING.bold('Schedule paused.')}`);
  console.log(`  ${DIM('Run')} ${ACCENT('warmup resume')} ${DIM('to reactivate.')}`);
  console.log('');
}

export function printResumed(config: WarmupConfig): void {
  const [h, m] = config.schedule.time.split(':').map(Number);
  const warmTime = formatHour(h, m);

  console.log('');
  console.log(`  ${SUCCESS('●')} ${SUCCESS.bold('Schedule resumed!')}`);
  console.log(`  ${DIM('Next pre-warm at')} ${ACCENT(warmTime)} ${DIM(`(${config.schedule.timezone})`)}`);
  console.log('');
}

// ── Uninstall Message ──
export function printUninstalled(): void {
  console.log('');
  console.log(`  ${SUCCESS(figures.tick)} ${BRIGHT('warmup has been removed.')}`);
  console.log(`  ${DIM('Scheduled task removed. Config preserved at ~/.warmup/')}`);
  console.log(`  ${DIM('To fully remove, also run:')} ${ACCENT('npm uninstall -g warmup-cli')}`);
  console.log('');
}

// ── Error Messages ──
export function printNoClaudeCode(): void {
  console.log('');
  console.log(boxen(
    ERROR.bold('Claude Code not found!') + '\n\n' +
    DIM('warmup requires Claude Code to be installed.\n') +
    DIM('Install it at: ') + ACCENT('https://code.claude.com'),
    {
      padding: 1,
      margin: { top: 0, bottom: 0, left: 2, right: 2 },
      borderStyle: 'round',
      borderColor: '#E17055',
    },
  ));
  console.log('');
}

export function printNotSetup(): void {
  console.log('');
  console.log(`  ${WARNING(figures.warning)} warmup is not set up yet.`);
  console.log(`  ${DIM('Run')} ${ACCENT('warmup setup')} ${DIM('to get started.')}`);
  console.log('');
}

export function printAlreadySetup(config: WarmupConfig): void {
  const [h, m] = config.schedule.time.split(':').map(Number);
  const warmTime = formatHour(h, m);

  console.log('');
  console.log(`  ${WARNING(figures.warning)} warmup is already set up.`);
  console.log(`  ${DIM('Current schedule:')} ${ACCENT(warmTime)} ${DIM(`(${config.schedule.timezone})`)}`);
  console.log(`  ${DIM('Run')} ${ACCENT('warmup update')} ${DIM('to change the time.')}`);
  console.log('');
}
