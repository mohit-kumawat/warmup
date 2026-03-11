import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { readConfig, writeConfig, formatHour } from '../config';
import { installSchedule, getPlatformName } from '../scheduler';
import { printNotSetup, printMiniLogo, animateSetupComplete } from '../ui';
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

  console.log('');
  console.log(`  ${chalk.bgCyan.black(' OPTIMAL SCHEDULE ')}`);
  console.log(`  ${chalk.cyan('💡')} ${DIM(explanation)}`);
  console.log('');


  const spinner = ora({
    text: 'Updating schedule...',
    color: 'magenta',
  }).start();

  try {
    config.schedule.time = time;
    config.schedule.enabled = true;
    config.runtime = resolveRuntimePaths();
    installSchedule({ hour: h, minute: m, runtime: config.runtime });
    writeConfig(config);

    spinner.succeed('Schedule updated');
    await animateSetupComplete(config);
  } catch (err: any) {
    spinner.fail(`Update failed: ${err.message}`);
  }
}
