import { readConfig, writeConfig } from '../config';
import { resumeSchedule } from '../scheduler';
import { printNotSetup, printResumed } from '../ui';

export async function resumeCommand(): Promise<void> {
  const config = readConfig();
  if (!config) {
    printNotSetup();
    return;
  }

  config.schedule.enabled = true;
  writeConfig(config);
  resumeSchedule();
  printResumed(config);
}
