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
  WarmupConfig,
} from '../config';
import { isClaudeInstalled, isClaudeAuthenticated } from '../warmup';
import { installSchedule, getSchedulerName } from '../scheduler';
import {
  printLogo,
  printNoClaudeCode,
  printAlreadySetup,
  animateSetupComplete,
  printSetupTransparency,
  printInstallPreview,
  printSetupDeferred,
  type InstallPreviewContent,
} from '../ui';
import { resolveRuntimePaths, type RuntimePaths } from '../runtime';

const ACCENT = chalk.hex('#6C5CE7');
const DIM = chalk.gray;

export interface SetupCommandOptions {
  skipLogo?: boolean;
}

export interface SetupInstallPlan extends InstallPreviewContent {
  time: string;
  hour: number;
  minute: number;
}

interface SpinnerLike {
  succeed(text: string): void;
  fail(text: string): void;
}

interface ConfirmAndInstallDependencies {
  printInstallPreview: (preview: InstallPreviewContent) => void;
  confirmInstall: () => Promise<boolean>;
  printSetupDeferred: () => void;
  createInstallSpinner: (schedulerLabel: string) => SpinnerLike;
  ensureConfigDir: () => void;
  resolveRuntimePaths: () => RuntimePaths;
  installSchedule: (options: { hour: number; minute: number; runtime: RuntimePaths }) => void;
  createDefaultConfig: (time: string, timezone: string, runtime: RuntimePaths) => WarmupConfig;
  writeConfig: (config: WarmupConfig) => void;
  animateSetupComplete: (config: WarmupConfig) => Promise<void>;
}

/** Generate choices for work start time (30 min increments) */
export function generateStartTimeChoices(): Array<{ name: string; value: number }> {
  const choices = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const mStr = m.toString().padStart(2, '0');
      const label = `${h12}:${mStr} ${period}`;
      const minutesSinceMidnight = h * 60 + m;

      let suffix = '';
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
export function calculateOptimalPrewarm(
  startMins: number,
  exhaustMins: number,
): { time: string; h: number; m: number; explanation: string } {
  let prewarmMins = startMins + exhaustMins - (5 * 60);

  if (prewarmMins > startMins) {
    prewarmMins = startMins;
  }

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

export function buildSetupInstallPlan(
  startMins: number,
  exhaustMins: number,
  timezone: string,
  overrides: Partial<Pick<SetupInstallPlan, 'schedulerLabel' | 'note'>> = {},
): SetupInstallPlan {
  const { time, h, m, explanation } = calculateOptimalPrewarm(startMins, exhaustMins);

  return {
    explanation,
    time,
    hour: h,
    minute: m,
    warmTime: formatHour(h, m),
    timezone,
    resetTime: formatHour((h + 5) % 24, m),
    schedulerLabel: overrides.schedulerLabel ?? getSchedulerName(),
    note: overrides.note,
  };
}

async function promptToConfirmInstall(): Promise<boolean> {
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: 'Install this schedule?',
    default: true,
  }]);

  return confirm;
}

function createInstallSpinner(schedulerLabel: string): SpinnerLike {
  return ora({
    text: `Installing schedule (${schedulerLabel})...`,
    color: 'magenta',
  }).start();
}

export async function confirmAndInstallSchedule(
  plan: SetupInstallPlan,
  deps: Partial<ConfirmAndInstallDependencies> = {},
): Promise<'cancelled' | 'installed' | 'failed'> {
  const showInstallPreview = deps.printInstallPreview ?? printInstallPreview;
  const confirmInstall = deps.confirmInstall ?? promptToConfirmInstall;
  const showSetupDeferred = deps.printSetupDeferred ?? printSetupDeferred;
  const startInstallSpinner = deps.createInstallSpinner ?? createInstallSpinner;
  const ensureDir = deps.ensureConfigDir ?? ensureConfigDir;
  const resolveRuntime = deps.resolveRuntimePaths ?? resolveRuntimePaths;
  const install = deps.installSchedule ?? installSchedule;
  const makeConfig = deps.createDefaultConfig ?? createDefaultConfig;
  const persistConfig = deps.writeConfig ?? writeConfig;
  const finishSetup = deps.animateSetupComplete ?? animateSetupComplete;

  showInstallPreview(plan);

  if (!(await confirmInstall())) {
    showSetupDeferred();
    return 'cancelled';
  }

  const installSpinner = startInstallSpinner(plan.schedulerLabel);

  try {
    ensureDir();
    const runtime = resolveRuntime();
    install({ hour: plan.hour, minute: plan.minute, runtime });

    const config = makeConfig(plan.time, plan.timezone, runtime);
    persistConfig(config);

    installSpinner.succeed('Schedule installed with boot-recovery');
    await finishSetup(config);
    return 'installed';
  } catch (err: any) {
    installSpinner.fail(`Installation failed: ${err.message}`);
    return 'failed';
  }
}

export async function setupCommand(options: SetupCommandOptions = {}): Promise<void> {
  if (!options.skipLogo) {
    printLogo();
  }

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

  printSetupTransparency();

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

  const timezone = detectTimezone();
  console.log(`  ${DIM('Timezone:')} ${ACCENT(timezone)} ${DIM('(auto-detected)')}`);
  console.log('');

  console.log(chalk.cyan('  Let\'s optimize your schedule based on your typical usage.'));
  console.log('');

  const { startMins } = await inquirer.prompt([{
    type: 'list',
    name: 'startMins',
    message: 'When do you usually start your heavy Claude usage each day?',
    choices: generateStartTimeChoices(),
    default: 9 * 60,
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
      { name: 'I rarely hit the limit / 5+ hours', value: 300 },
    ],
    default: 120,
  }]);

  const plan = buildSetupInstallPlan(startMins, exhaustMins, timezone);

  await confirmAndInstallSchedule(plan);
}
