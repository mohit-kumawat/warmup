import chalk from 'chalk';
import boxen from 'boxen';
import gradient from 'gradient-string';
import figures from 'figures';
import { WarmupConfig, getLatestLog, formatTimeLocal, formatHour, LogEntry } from './config';

// ── Brand Colors ──
const BRAND = gradient(['#6C5CE7', '#A29BFE', '#74B9FF']); // purple-blue gradient
const ACCENT = chalk.hex('#6C5CE7');
const SUCCESS = chalk.hex('#00B894');
const WARNING = chalk.hex('#FDCB6E');
const ERROR = chalk.hex('#E17055');
const DIM = chalk.gray;
const BRIGHT = chalk.white.bold;

// ── Utility ──
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pad(str: string, len: number): string {
  return str.padEnd(len);
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

export function printMiniLogo(): void {
  console.log(`\n  ${BRAND('warmup')} ${DIM('v1.0.0')}\n`);
}

// ── Post-Setup Animation ──
export async function animateSetupComplete(config: WarmupConfig): Promise<void> {
  const time = config.schedule.time;
  const tz = config.schedule.timezone;
  const [h, m] = time.split(':').map(Number);

  const warmTime = formatHour(h, m);
  const resetHour = (h + 5) % 24;
  const resetTime = formatHour(resetHour, m);

  console.log('');

  // Animated header
  const header = boxen(
    BRIGHT(`${figures.tick} warmup is set up!`) + '\n\n' +
    DIM(`Schedule: `) + ACCENT(warmTime) + DIM(` daily (${tz})`) + '\n' +
    DIM(`Window resets: ~`) + SUCCESS(resetTime),
    {
      padding: 1,
      margin: { top: 0, bottom: 0, left: 2, right: 2 },
      borderStyle: 'round',
      borderColor: '#6C5CE7',
    }
  );
  console.log(header);
  await sleep(300);

  // Timeline animation
  console.log(`\n  ${BRIGHT('YOUR DAY')}                                ${BRIGHT('RATE LIMIT WINDOW')}`);
  console.log(DIM(`  ${'─'.repeat(52)}`));
  await sleep(150);

  // Build timeline entries
  const timelineEntries = [];

  // Pre-warm fires
  timelineEntries.push({
    time: warmTime,
    event: `${WARNING('⚡')} Pre-warm fires`,
    window: `${ACCENT('██')} Window starts`,
    delay: 200,
  });

  // Hours ticking by (sleeping)
  for (let i = 1; i < 5; i++) {
    const tickHour = (h + i) % 24;
    const tickTime = formatHour(tickHour, m);
    const barLen = Math.min(i * 3, 12);
    const bar = ACCENT('█'.repeat(barLen));
    const sleepMsgs = ['You\'re sleeping', 'Still sleeping', 'Maybe awake', 'Getting ready'];

    timelineEntries.push({
      time: tickTime,
      event: `${DIM('│')} ${DIM(sleepMsgs[i - 1])}`,
      window: `${bar} ${DIM(`${i}hr`)}`,
      delay: 150,
    });
  }

  // Window resets
  timelineEntries.push({
    time: resetTime,
    event: `${SUCCESS(figures.tick)} ${SUCCESS('Window resets!')}`,
    window: `${SUCCESS('━'.repeat(12))} ${SUCCESS.bold('FRESH!')}`,
    delay: 300,
  });

  // You start working
  timelineEntries.push({
    time: resetTime,
    event: `${chalk.hex('#FF6B6B')('🚀')} ${BRIGHT('You start working')}`,
    window: SUCCESS('Full capacity!'),
    delay: 200,
  });

  // Print each line with animation
  for (const entry of timelineEntries) {
    const timePad = pad(entry.time, 10);
    console.log(`  ${BRIGHT(timePad)} ${pad(entry.event, 38)} ${entry.window}`);
    await sleep(entry.delay);
  }

  await sleep(200);
  console.log(DIM(`  ${'─'.repeat(52)}`));
  await sleep(100);

  // Before / After comparison
  console.log('');
  console.log(`  ${ERROR(figures.cross)} ${DIM('Without warmup:')} Window starts when you work, resets mid-day`);
  await sleep(200);
  console.log(`  ${SUCCESS(figures.tick)} ${DIM('With warmup:   ')} Window starts at ${ACCENT(warmTime)}, resets by ${SUCCESS(resetTime)}`);
  await sleep(200);

  console.log('');
  console.log(boxen(
    SUCCESS.bold(`You save ~2-3 hours of waiting every day!`),
    {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      margin: { top: 0, bottom: 0, left: 2, right: 2 },
      borderStyle: 'round',
      borderColor: '#00B894',
    }
  ));
  console.log('');
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

  // Determine reset time: use actual fire time if available (boot-recovery),
  // otherwise fall back to scheduled time + 5h
  const lastLog = getLatestLog();
  let resetTime: string;
  if (lastLog && (lastLog.status === 'success' || lastLog.status === 'boot-recovery')) {
    const lastFireTime = new Date(lastLog.timestamp);
    const resetDate = new Date(lastFireTime.getTime() + 5 * 60 * 60 * 1000);
    resetTime = resetDate.toLocaleTimeString('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } else {
    const resetHour = (h + 5) % 24;
    resetTime = formatHour(resetHour, m);
  }

  // Schedule info
  const enabledStr = config.schedule.enabled
    ? SUCCESS('● active')
    : WARNING('○ paused');

  console.log(`  ${DIM('Schedule:')}    ${ACCENT(warmTime)} daily ${DIM(`(${tz})`)} ${enabledStr}`);
  if (options.needsRuntimeRefresh) {
    console.log(`  ${WARNING(figures.warning)} ${DIM('Older install detected. Run')} ${ACCENT('warmup update')} ${DIM('once to refresh scheduler scripts.')}`);
  }

  // Last run (lastLog already fetched above for reset time calculation)
  if (lastLog) {
    const statusIcon = lastLog.status === 'success' ? SUCCESS(figures.tick)
      : lastLog.status === 'boot-recovery' ? WARNING('⚡')
      : ERROR(figures.cross);
    const statusText = lastLog.status === 'success' ? SUCCESS('success')
      : lastLog.status === 'boot-recovery' ? WARNING('boot-recovery')
      : ERROR('failed');

    const logDate = new Date(lastLog.timestamp);
    const timeStr = lastLog.actualTime || formatTimeLocal(logDate, tz);

    console.log(`  ${DIM('Last run:')}    ${timeStr} ${statusIcon} ${statusText}`);

    if (lastLog.status === 'boot-recovery') {
      console.log(`  ${DIM('Boot-catch:')}  ${WARNING('machine was off at scheduled time')}`);
    }
  } else {
    console.log(`  ${DIM('Last run:')}    ${DIM('no runs yet')}`);
  }

  console.log('');

  // Progress bar
  if (lastLog && (lastLog.status === 'success' || lastLog.status === 'boot-recovery')) {
    const lastFireTime = new Date(lastLog.timestamp);
    const now = new Date();
    const elapsedMs = now.getTime() - lastFireTime.getTime();
    const windowMs = 5 * 60 * 60 * 1000;
    const progress = Math.min(1, Math.max(0, elapsedMs / windowMs));

    if (progress < 1) {
      // Window is still active
      const barWidth = 30;
      const filled = Math.round(progress * barWidth);
      const partial = Math.min(3, barWidth - filled);
      const empty = barWidth - filled - partial;

      const bar = ACCENT('█'.repeat(filled)) +
                  DIM('▓'.repeat(partial)) +
                  DIM('░'.repeat(empty));

      const pctStr = `${Math.round(progress * 100)}%`;
      console.log(`  ${DIM('Window:')} [${bar}] ${BRIGHT(pctStr)} elapsed`);

      // Time markers
      const fireTimeStr = lastLog.actualTime || warmTime;
      const nowStr = 'now';
      const resetStr = resetTime;

      const markerLine = `           ${fireTimeStr}${' '.repeat(Math.max(1, 12 - fireTimeStr.length))}${DIM('(now)')}${' '.repeat(Math.max(1, 15 - 5))}${resetStr}`;
      console.log(DIM(markerLine));

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
      // Window has expired
      console.log(`  ${DIM('Window:')} [${SUCCESS('█'.repeat(30))}] ${SUCCESS.bold('RESET!')}`);
      console.log('');
      console.log(`  ${SUCCESS(figures.tick)} ${SUCCESS.bold('Your window has reset!')} Full capacity available.`);
    }
  } else if (!config.schedule.enabled) {
    console.log(`  ${WARNING(figures.warning)} Schedule is paused. Run ${ACCENT('warmup resume')} to reactivate.`);
  } else {
    console.log(`  ${DIM('Window:')} ${DIM('waiting for first pre-warm...')}`);
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
  console.log(DIM(`  Tip: Keep your machine on overnight for best results,`));
  console.log(DIM(`       or enable auto-wake in System Settings.`));
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
    }
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
