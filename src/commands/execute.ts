import { readConfig, isNearScheduledTime, formatHour } from '../config';
import { executeWarmup, shouldBootRecover } from '../warmup';
import {
  animateBootRecovery,
  animateBootRecoverySuccess,
} from '../ui';

/**
 * Internal command called by the OS scheduler (launchd/systemd/schtasks).
 * Not user-facing. Determines whether this is a normal run or boot-recovery.
 */
export async function executeCommand(): Promise<void> {
  const config = readConfig();
  if (!config || !config.schedule.enabled) {
    process.exit(0);
    return;
  }

  const isBootRecovery = shouldBootRecover(config);

  if (isBootRecovery) {
    const [h, m] = config.schedule.time.split(':').map(Number);
    const scheduledTime = formatHour(h, m);
    const now = new Date();
    const actualTime = now.toLocaleTimeString('en-US', {
      timeZone: config.schedule.timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    // These animations only show if running in an interactive terminal
    if (process.stdout.isTTY) {
      await animateBootRecovery(scheduledTime, actualTime);
    }

    const result = executeWarmup(true);

    if (result.success && process.stdout.isTTY) {
      // Boot-recovery reset = NOW + 5 hours, not scheduled time + 5
      const resetTime = new Date(now.getTime() + 5 * 60 * 60 * 1000)
        .toLocaleTimeString('en-US', {
          timeZone: config.schedule.timezone,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
      await animateBootRecoverySuccess(resetTime);
    }
  } else if (isNearScheduledTime(config.schedule.time, config.schedule.timezone)) {
    // Normal scheduled execution — only fire if we're near the scheduled time
    executeWarmup(false);
  }
  // If neither boot-recovery nor near scheduled time, do nothing.
  // This prevents RunAtLoad / reboot from firing pointless pre-warms.
}
