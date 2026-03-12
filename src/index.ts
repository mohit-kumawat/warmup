#!/usr/bin/env node

import { Command } from 'commander';
import { defaultCommand } from './commands/default';
import { setupCommand } from './commands/setup';
import { statusCommand } from './commands/status';
import { testCommand } from './commands/test';
import { pauseCommand } from './commands/pause';
import { resumeCommand } from './commands/resume';
import { updateCommand } from './commands/update';
import { uninstallCommand } from './commands/uninstall';
import { executeCommand } from './commands/execute';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('warmup')
    .description('Pre-warm your Claude rate limits while you sleep.')
    .version(require("../package.json").version);;

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

  program
    .command('_execute-warmup', { hidden: true })
    .description('Internal: execute pre-warm (called by OS scheduler)')
    .action(async () => {
      await executeCommand();
    });

  program
    .action(async () => {
      await defaultCommand();
    });

  return program;
}

if (require.main === module) {
  const program = createProgram();
  void program.parseAsync().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}
