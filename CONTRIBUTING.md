# Contributing to warmup

Thanks for your interest in contributing to warmup! Here's how to get started.

## Development Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/YOUR_USERNAME/warmup.git
   cd warmup
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build:
   ```bash
   npm run build
   ```

4. Run in development:
   ```bash
   npm run dev -- setup
   ```

## Project Structure

```
src/
├── index.ts          # CLI entry point (commander.js)
├── config.ts         # Config read/write, logging, timezone helpers
├── warmup.ts         # Core: Claude Code invocation + boot-recovery logic
├── ui.ts             # Terminal animations and display
├── commands/         # One file per CLI command
│   ├── setup.ts
│   ├── status.ts
│   ├── test.ts
│   ├── pause.ts
│   ├── resume.ts
│   ├── update.ts
│   ├── uninstall.ts
│   └── execute.ts    # Hidden internal command for OS scheduler
└── scheduler/        # OS-specific scheduler integration
    ├── index.ts      # Platform detection + dispatch
    ├── macos.ts      # launchd
    ├── linux.ts      # systemd + cron fallback
    └── windows.ts    # Task Scheduler
```

## Guidelines

- **TypeScript strict mode** — all code must compile under `strict: true`
- **No new dependencies** unless absolutely necessary
- **Test on your platform** — we support macOS, Linux, and Windows
- **Keep the CLI surface clean** — internal commands use underscore prefix (e.g., `_execute-warmup`)

## Submitting Changes

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-change`
3. Make your changes and ensure `npm run build` passes
4. Submit a pull request with a clear description

## Reporting Issues

Please include:
- Your OS and version
- Node.js version (`node --version`)
- Claude Code version (`claude --version`)
- Contents of `~/.warmup/config.json` (if relevant)
- Relevant log entries from `~/.warmup/logs/`

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
