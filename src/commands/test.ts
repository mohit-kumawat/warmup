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

export async function testCommand(): Promise<void> {
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

  await animateTestWarmup();

  const result = executeWarmup(false);

  if (result.success) {
    await animateTestSuccess(result.duration);
  } else {
    await animateTestFailure(result.message);
  }
}
