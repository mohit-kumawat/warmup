#!/usr/bin/env node

import { Command } from 'commander';
import { setupCommand } from './commands/setup';
import { statusCommand } from './commands/status';
import { testCommand } from './commands/test';
import { pauseCommand } from './commands/pause';
import { resumeCommand } from './commands/resume';
import { updateCommand } from './commands/update';
import { uninstallCommand } from './commands/uninstall';
import { executeCommand } from './commands/execute';

const program = new Command();

program
  .name('warmup')
  .description('Pre-warm your Claude rate limits while you sleep.')
  .version('1.0.0');

program
  .command('setup')
  .description('Set up warmup with your preferred pre-warm time')
  .action(async () => {
    await setupCommand();
  });

program
  .command('status')
  .description('Show your schedule, last run, and rate limit window progress')
  .action(async () => {
    await statusCommand();
  });

program
  .command('test')
  .description('Fire a pre-warm right now (counts as a real pre-warm)')
  .action(async () => {
    await testCommand();
  });

program
  .command('pause')
  .description('Pause the daily pre-warm schedule')
  .action(async () => {
    await pauseCommand();
  });

program
  .command('resume')
  .description('Resume the daily pre-warm schedule')
  .action(async () => {
    await resumeCommand();
  });

program
  .command('update')
  .description('Change your pre-warm time')
  .action(async () => {
    await updateCommand();
  });

program
  .command('uninstall')
  .description('Remove the scheduled task (keeps config)')
  .action(async () => {
    await uninstallCommand();
  });

// Hidden command: called by the OS scheduler
program
  .command('_execute-warmup', { hidden: true })
  .description('Internal: execute pre-warm (called by OS scheduler)')
  .action(async () => {
    await executeCommand();
  });

// Default: show status if set up, otherwise show help
program
  .action(async () => {
    const { readConfig } = await import('./config');
    const config = readConfig();
    if (config) {
      await statusCommand();
    } else {
      program.help();
    }
  });

program.parse();
