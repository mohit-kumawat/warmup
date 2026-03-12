import inquirer from 'inquirer';
import { readConfig } from '../config';
import {
  printFirstRunIntro,
  printLogo,
  printSetupDeferred,
  printSetupTransparency,
} from '../ui';
import { setupCommand, type SetupCommandOptions } from './setup';
import { statusCommand } from './status';

interface OnboardingDependencies {
  confirmStartSetup: () => Promise<boolean>;
  printLogo: () => void;
  printFirstRunIntro: () => void;
  printSetupTransparency: () => void;
  printSetupDeferred: () => void;
  runSetup: (options?: SetupCommandOptions) => Promise<void>;
}

interface DefaultCommandDependencies {
  readConfig: typeof readConfig;
  runStatus: () => Promise<void>;
  runFirstRunOnboarding: () => Promise<void>;
}

async function promptToStartSetup(): Promise<boolean> {
  const { startSetup } = await inquirer.prompt([{
    type: 'confirm',
    name: 'startSetup',
    message: 'Start setup now?',
    default: true,
  }]);

  return startSetup;
}

export async function runFirstRunOnboarding(
  deps: Partial<OnboardingDependencies> = {},
): Promise<void> {
  const confirmStartSetup = deps.confirmStartSetup ?? promptToStartSetup;
  const showLogo = deps.printLogo ?? printLogo;
  const showFirstRunIntro = deps.printFirstRunIntro ?? printFirstRunIntro;
  const showSetupTransparency = deps.printSetupTransparency ?? printSetupTransparency;
  const showSetupDeferred = deps.printSetupDeferred ?? printSetupDeferred;
  const runSetup = deps.runSetup ?? setupCommand;

  showLogo();
  showFirstRunIntro();
  showSetupTransparency();

  if (!(await confirmStartSetup())) {
    showSetupDeferred();
    return;
  }

  await runSetup({ skipLogo: true });
}

export async function defaultCommand(
  deps: Partial<DefaultCommandDependencies> = {},
): Promise<'status' | 'onboarding'> {
  const loadConfig = deps.readConfig ?? readConfig;
  const runStatus = deps.runStatus ?? statusCommand;
  const runOnboarding = deps.runFirstRunOnboarding ?? runFirstRunOnboarding;

  if (loadConfig()) {
    await runStatus();
    return 'status';
  }

  await runOnboarding();
  return 'onboarding';
}
