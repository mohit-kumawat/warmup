import { readConfig } from '../config';
import { displayStatus, printNotSetup } from '../ui';

export async function statusCommand(): Promise<void> {
  const config = readConfig();
  if (!config) {
    printNotSetup();
    return;
  }

  await displayStatus(config, { needsRuntimeRefresh: !config.runtime });
}
