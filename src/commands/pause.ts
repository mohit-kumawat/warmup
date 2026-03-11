import { readConfig, writeConfig } from '../config';
import { pauseSchedule } from '../scheduler';
import { printNotSetup, printPaused } from '../ui';

export async function pauseCommand(): Promise<void> {
  const config = readConfig();
  if (!config) {
    printNotSetup();
    return;
  }

  config.schedule.enabled = false;
  writeConfig(config);
  pauseSchedule();
  printPaused();
}
