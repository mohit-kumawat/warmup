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

process.stdout.write(`
${bright}${green}WarmUp CLI has been installed successfully!${reset}
To finish the setup and start pre-warming Claude, please run:
${bright}${cyan}  warmup setup${reset}
`);

process.exit(0);
