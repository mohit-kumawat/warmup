import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { readConfig, writeConfig, formatHour, type WarmupConfig } from '../config';
import { installSchedule } from '../scheduler';
import { animateSetupComplete, printNotSetup, printMiniLogo } from '../ui';
import { resolveRuntimePaths, type RuntimePaths } from '../runtime';
import {
  buildSetupInstallPlan,
  confirmAndInstallSchedule,
  generateStartTimeChoices,
  type SetupInstallPlan,
} from './setup';

const ACCENT = chalk.hex('#6C5CE7');
const DIM = chalk.gray;

async function promptToConfirmUpdate(): Promise<boolean> {
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: 'Update to this schedule?',
    default: true,
  }]);

  return confirm;
}

function printUpdateDeferred(): void {
  console.log(`  ${DIM('Update cancelled. Current schedule is unchanged.')}`);
  console.log('');
}

function createUpdateSpinner(schedulerLabel: string): { succeed(text: string): void; fail(text: string): void } {
  return ora({
    text: `Updating schedule (${schedulerLabel})...`,
    color: 'magenta',
  }).start();
}

function buildUpdatedConfig(
  config: WarmupConfig,
  plan: SetupInstallPlan,
  runtime: RuntimePaths,
): WarmupConfig {
  return {
    ...config,
    schedule: {
      ...config.schedule,
      time: plan.time,
      timezone: plan.timezone,
      enabled: true,
    },
    runtime,
  };
}

export async function updateCommand(): Promise<void> {
  printMiniLogo();

  const config = readConfig();
  if (!config) {
    printNotSetup();
    return;
  }

  const [curH, curM] = config.schedule.time.split(':').map(Number);
  console.log(`  ${DIM('Current schedule:')} ${ACCENT(formatHour(curH, curM))} ${DIM(`(${config.schedule.timezone})`)}`);
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

  const plan = buildSetupInstallPlan(startMins, exhaustMins, config.schedule.timezone, {
    note: 'Updating the schedule will not send a live pre-warm yet.',
  });

  await confirmAndInstallSchedule(plan, {
    confirmInstall: promptToConfirmUpdate,
    printSetupDeferred: printUpdateDeferred,
    createInstallSpinner: createUpdateSpinner,
    resolveRuntimePaths,
    installSchedule,
    createDefaultConfig: (_time, _timezone, runtime) => buildUpdatedConfig(config, plan, runtime),
    writeConfig,
    animateSetupComplete,
  });
}
