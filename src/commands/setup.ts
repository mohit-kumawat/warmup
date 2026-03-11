import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import {
  readConfig,
  createDefaultConfig,
  writeConfig,
  detectTimezone,
  ensureConfigDir,
  formatHour,
} from '../config';
import { isClaudeInstalled, isClaudeAuthenticated } from '../warmup';
import { installSchedule, getPlatformName } from '../scheduler';
import { printLogo, printNoClaudeCode, printAlreadySetup, animateSetupComplete } from '../ui';
import { resolveRuntimePaths } from '../runtime';

const ACCENT = chalk.hex('#6C5CE7');
const DIM = chalk.gray;

/** Generate choices for work start time (30 min increments) */
function generateStartTimeChoices(): Array<{ name: string; value: number }> {
  const choices = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const mStr = m.toString().padStart(2, '0');
      const label = `${h12}:${mStr} ${period}`;
      const minutesSinceMidnight = h * 60 + m;

      let suffix = '';
      // typical work start times
      if (h === 9 && m === 0) suffix = ' ← standard';
      if (h === 10 && m === 0) suffix = ' ← common';

      choices.push({
        name: `${label}${suffix}`,
        value: minutesSinceMidnight,
      });
    }
  }
  return choices;
}

/** Calculate the optimal pre-warm time based on user feedback */
function calculateOptimalPrewarm(startMins: number, exhaustMins: number): { time: string; h: number; m: number; explanation: string } {
  // We want the 5-hour window to end EXACTLY when they exhaust their limits.
  // Window End = Start Time + Exhaustion Time
  // Pre-warm Time = Window End - 5 hours
  let prewarmMins = startMins + exhaustMins - (5 * 60);

  // If exhaust time > 5 hours, pre-warm time would be *after* start time, which defeats the purpose.
  // Cap it so pre-warm is at absolute maximum their start time.
  if (prewarmMins > startMins) {
    prewarmMins = startMins;
  }

  // Handle midnight wraparound
  if (prewarmMins < 0) {
    prewarmMins += 24 * 60;
  }

  const h = Math.floor(prewarmMins / 60) % 24;
  const m = prewarmMins % 60;
  const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  
  const resetMins = (prewarmMins + 5 * 60) % (24 * 60);
  const resetH = Math.floor(resetMins / 60);
  const resetM = resetMins % 60;

  const resetStr = formatHour(resetH, resetM);

  const explanation = `To ensure your rate limit window resets completely at ${resetStr} exactly when you run out, we'll run the pre-warm at ${formatHour(h, m)}.`;

  return { time: timeStr, h, m, explanation };
}

export async function setupCommand(): Promise<void> {
  printLogo();

  // Check if already set up
  const existing = readConfig();
  if (existing) {
    printAlreadySetup(existing);
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: 'Do you want to reconfigure?',
      default: false,
    }]);
    if (!overwrite) return;
  }

  // Check Claude Code
  const spinner = ora({
    text: 'Checking for Claude Code...',
    color: 'magenta',
  }).start();

  if (!isClaudeInstalled()) {
    spinner.fail('Claude Code not found');
    printNoClaudeCode();
    return;
  }
  spinner.succeed('Claude Code detected');

  // Check authentication
  const authSpinner = ora({
    text: 'Checking Claude Code authentication...',
    color: 'magenta',
  }).start();

  if (!isClaudeAuthenticated()) {
    authSpinner.fail('Claude Code is not authenticated');
    console.log(`  ${DIM('Run')} ${ACCENT('claude')} ${DIM('first and complete authentication.')}`);
    console.log('');
    return;
  }
  authSpinner.succeed('Claude Code authenticated');

  // Detect timezone
  const timezone = detectTimezone();
  console.log(`  ${DIM('Timezone:')} ${ACCENT(timezone)} ${DIM('(auto-detected)')}`);
  console.log('');

  // Smart Scheduler Questionnaire
  console.log(chalk.cyan('  Let\'s optimize your schedule based on your typical usage.'));
  console.log('');
  
  const { startMins } = await inquirer.prompt([{
    type: 'list',
    name: 'startMins',
    message: 'When do you usually start your heavy Claude usage each day?',
    choices: generateStartTimeChoices(),
    default: 9 * 60, // 9:00 AM
    pageSize: 12,
  }]);

  const { exhaustMins } = await inquirer.prompt([{
    type: 'list',
    name: 'exhaustMins',
    message: 'How quickly do you usually hit your Pro/Max rate limit after starting?',
    choices: [
      { name: '< 1 hour', value: 60 },
      { name: '1-2 hours', value: 120 },
      { name: '2-3 hours', value: 180 },
      { name: '3-4 hours', value: 240 },
      { name: 'I rarely hit the limit / 5+ hours', value: 300 }
    ],
    default: 120, // 2 hours
  }]);

  // Calculate
  const { time, h, m, explanation } = calculateOptimalPrewarm(startMins, exhaustMins);
  const resetH = (h + 5) % 24;

  console.log('');
  console.log(`  ${chalk.bgCyan.black(' OPTIMAL SCHEDULE ')}`);
  console.log(`  ${chalk.cyan('💡')} ${DIM(explanation)}`);
  console.log('');
  console.log(`  ${DIM('Pre-warm at:')} ${ACCENT(formatHour(h, m))}`);
  console.log(`  ${DIM('Window resets:')} ${ACCENT(`~${formatHour(resetH, m)}`)}`);
  console.log(`  ${DIM('Platform:')} ${ACCENT(getPlatformName())}`);
  console.log(`  ${DIM('Boot-recovery:')} ${ACCENT('enabled')}`);
  console.log('');

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: 'Set up this schedule?',
    default: true,
  }]);

  if (!confirm) {
    console.log(DIM('\n  Setup cancelled.\n'));
    return;
  }

  // Install
  const installSpinner = ora({
    text: `Installing schedule (${getPlatformName()})...`,
    color: 'magenta',
  }).start();

  try {
    ensureConfigDir();
    const runtime = resolveRuntimePaths();
    installSchedule({ hour: h, minute: m, runtime });

    const config = createDefaultConfig(time, timezone, runtime);
    writeConfig(config);

    installSpinner.succeed('Schedule installed with boot-recovery');

    // Animate the setup complete visualization
    await animateSetupComplete(config);
  } catch (err: any) {
    installSpinner.fail(`Installation failed: ${err.message}`);
  }
}
