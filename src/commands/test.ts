import { readConfig } from '../config';
import { executeWarmup, isClaudeInstalled } from '../warmup';
import {
  printNotSetup,
  printNoClaudeCode,
  animateTestWarmup,
  animateTestSuccess,
  animateTestFailure,
  printMiniLogo,
} from '../ui';

export interface TestCommandOptions {
  dryRun?: boolean;
}

export async function testCommand(options: TestCommandOptions = {}): Promise<void> {
  const isDryRun = !!options.dryRun;
  printMiniLogo();
  
  const config = readConfig();
  if (!config) {
    printNotSetup();
    return;
  }

  if (!isClaudeInstalled()) {
    printNoClaudeCode();
    return;
  }

  await animateTestWarmup(isDryRun);

  const result = executeWarmup(false, isDryRun);

  if (result.success) {
    await animateTestSuccess(result.duration, isDryRun);
  } else {
    await animateTestFailure(result.message);
  }
}
