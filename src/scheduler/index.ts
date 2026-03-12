import * as os from 'os';
import { installMacSchedule, uninstallMacSchedule, isMacScheduleInstalled, pauseMacSchedule, resumeMacSchedule } from './macos';
import { installLinuxSchedule, uninstallLinuxSchedule, isLinuxScheduleInstalled, pauseLinuxSchedule, resumeLinuxSchedule, getLinuxSchedulerName } from './linux';
import { installWindowsSchedule, uninstallWindowsSchedule, isWindowsScheduleInstalled, pauseWindowsSchedule, resumeWindowsSchedule } from './windows';
import type { RuntimePaths } from '../runtime';

export type Platform = 'macos' | 'linux' | 'windows';
export interface ScheduleInstallOptions {
  hour: number;
  minute: number;
  runtime: RuntimePaths;
}

export function detectPlatform(): Platform {
  const platform = os.platform();
  if (platform === 'darwin') return 'macos';
  if (platform === 'win32') return 'windows';
  return 'linux';
}

export function getPlatformName(): string {
  const p = detectPlatform();
  switch (p) {
    case 'macos': return 'macOS (launchd)';
    case 'linux': return 'Linux (systemd/cron)';
    case 'windows': return 'Windows (Task Scheduler)';
  }
}

export function getSchedulerName(): string {
  const platform = detectPlatform();
  switch (platform) {
    case 'macos':
      return 'macOS (launchd LaunchAgent)';
    case 'linux':
      try {
        return getLinuxSchedulerName();
      } catch {
        return 'Linux (systemd user timer or cron)';
      }
    case 'windows':
      return 'Windows (Task Scheduler)';
  }
}

export function installSchedule(options: ScheduleInstallOptions): void {
  const platform = detectPlatform();
  switch (platform) {
    case 'macos': return installMacSchedule(options);
    case 'linux': return installLinuxSchedule(options);
    case 'windows': return installWindowsSchedule(options);
  }
}

export function uninstallSchedule(): void {
  const platform = detectPlatform();
  switch (platform) {
    case 'macos': return uninstallMacSchedule();
    case 'linux': return uninstallLinuxSchedule();
    case 'windows': return uninstallWindowsSchedule();
  }
}

export function isScheduleInstalled(): boolean {
  const platform = detectPlatform();
  switch (platform) {
    case 'macos': return isMacScheduleInstalled();
    case 'linux': return isLinuxScheduleInstalled();
    case 'windows': return isWindowsScheduleInstalled();
  }
}

export function pauseSchedule(): void {
  const platform = detectPlatform();
  switch (platform) {
    case 'macos': return pauseMacSchedule();
    case 'linux': return pauseLinuxSchedule();
    case 'windows': return pauseWindowsSchedule();
  }
}

export function resumeSchedule(): void {
  const platform = detectPlatform();
  switch (platform) {
    case 'macos': return resumeMacSchedule();
    case 'linux': return resumeLinuxSchedule();
    case 'windows': return resumeWindowsSchedule();
  }
}
