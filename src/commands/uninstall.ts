import inquirer from 'inquirer';
import { readConfig } from '../config';
import { uninstallSchedule } from '../scheduler';
import { printNotSetup, printUninstalled, printMiniLogo } from '../ui';
import chalk from 'chalk';

const DIM = chalk.gray;

export async function uninstallCommand(): Promise<void> {
  printMiniLogo();

  const config = readConfig();
  if (!config) {
    printNotSetup();
    return;
  }

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: 'Remove warmup scheduled task?',
    default: false,
  }]);

  if (!confirm) {
    console.log(DIM('\n  Cancelled.\n'));
    return;
  }

  try {
    uninstallSchedule();
    printUninstalled();
  } catch (err: any) {
    console.log(`\n  ${chalk.red('Error:')} ${err.message}\n`);
  }
}
