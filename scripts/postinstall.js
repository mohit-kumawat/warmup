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

// Automatically trigger "warmup setup" if possible
try {
  const { execSync } = require('child_process');
  const fs = require('fs');
  
  // npm often pipes stdout/stderr during postinstall, obscuring interactive prompts.
  // By reading/writing directly to the TTY device, we ensure the prompt is visible.
  if (fs.existsSync('/dev/tty')) {
    const tty = fs.openSync('/dev/tty', 'r+');
    execSync('warmup setup', { stdio: [tty, tty, tty] });
  } else if (process.stdout.isTTY) {
    // Fallback for Windows or environments without /dev/tty but with interactive stdout
    execSync('warmup setup', { stdio: 'inherit' });
  } else {
    throw new Error('No interactive terminal available');
  }
} catch (err) {
  // If the warmup command isn't immediately available, fails, or we're in CI
  const fallbackMessage = `
${bright}${yellow}Could not automatically start setup.${reset}
To finish the setup and start pre-warming Claude, please run:
${bright}${cyan}  warmup setup${reset}
`;
  process.stdout.write(fallbackMessage);
}
