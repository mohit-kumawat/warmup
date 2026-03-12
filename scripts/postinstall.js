'use strict';

const isGlobal = process.env.npm_config_global === 'true';

if (!isGlobal) {
  process.exit(0);
}

// Simple color codes to avoid dependency issues during postinstall
const reset = '\x1b[0m';
const bright = '\x1b[1m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const cyan = '\x1b[36m';

const message = `
${bright}${green}WarmUp CLI has been installed successfully!${reset}

To finish the setup and start pre-warming Claude, please run:
${bright}${yellow}  warmup setup${reset}

${bright}${cyan}Why run setup?${reset}
- It configures your daily work schedule.
- It calculates the optimal 5-hour window.
- It installs the background scheduler for your OS.

${bright}Note:${reset} Ensure Claude Code is already installed and authenticated.
Check the docs at: ${cyan}https://github.com/mohit-kumawat/warmup${reset}
`;

process.stdout.write(message);
