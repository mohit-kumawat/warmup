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
Starting initial setup...
`;

process.stdout.write(message);

// Automatically trigger "warmup setup" if we are in an interactive terminal
if (process.stdout.isTTY) {
  try {
    const { execSync } = require('child_process');
    
    // We run it synchronously so the user is immediately dropped into the setup prompt
    execSync('warmup setup', { stdio: 'inherit' });
  } catch (err) {
    // If the warmup command isn't immediately available or fails, fallback to instructions
    const fallbackMessage = `
${bright}${yellow}Could not automatically start setup.${reset}
To finish the setup and start pre-warming Claude, please run:
${bright}${cyan}  warmup setup${reset}
`;
    process.stdout.write(fallbackMessage);
  }
} else {
  // CI/CD or non-interactive environments
  const fallbackMessage = `
To finish the setup and start pre-warming Claude, please run:
${bright}${yellow}  warmup setup${reset}
`;
  process.stdout.write(fallbackMessage);
}
