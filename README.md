# warmup

**Pre-warm your Claude rate limits while you sleep.**

One command. Zero daily effort. Full Claude capacity when you need it.

---

## The Problem

Claude Pro and Max subscribers share a **5-hour rolling rate limit window** across Claude Code, Cowork, and claude.ai. When you start an intensive session, you burn through your allocation and are forced to wait 2-3 hours for the window to reset.

## The Solution

**warmup** starts your rate limit window _before_ you wake up by sending a tiny message through Claude Code at a scheduled time. By the time you sit down to work, the window has already expired and you get a fresh allocation.

```
Without warmup:
  10:00 AM → You start working, window starts
  12:00 PM → Rate limited! Must wait until 3:00 PM

With warmup:
   5:00 AM → warmup sends "ping" (10 tokens)
  10:00 AM → Window resets! Full capacity when you start working
```

## Install

```bash
npm install -g warmup-cli
```

**Prerequisites:** [Claude Code](https://code.claude.com) must be installed and authenticated.

`warmup setup` verifies your Claude login with `claude auth status`; it does not send a prompt or start the rate-limit window.

## Setup

```bash
warmup setup
```

Interactive setup takes 30 seconds:
1. Auto-detects your timezone
2. You pick your pre-warm time (5:00 AM recommended)
3. Schedule is installed with boot-recovery enabled

That's it. You'll never touch it again.

## Upgrade Note

If you installed an older version of `warmup` before the scheduler-path hardening, run:

```bash
warmup update
```

once after upgrading. That refreshes the scheduled task with absolute `node`, `warmup`, and `claude` paths so background runs stay reliable.

## Commands

| Command | Description |
|---------|-------------|
| `warmup setup` | Interactive setup wizard |
| `warmup status` | Show schedule, last run, and window progress bar |
| `warmup test` | Fire a pre-warm right now |
| `warmup update` | Change your pre-warm time |
| `warmup pause` | Pause the schedule |
| `warmup resume` | Resume the schedule |
| `warmup uninstall` | Remove the scheduled task |

## Boot Recovery

**What if my computer is off at the scheduled time?**

warmup handles this automatically. If your machine was off at 5:00 AM, the pre-warm fires immediately when you turn it on. So if you open your laptop at 8:00 AM, it pre-warms right then, and your window resets by ~1:15 PM.

This works on all platforms:
- **macOS:** `launchd` with `RunAtLoad`
- **Linux:** `systemd` timer with `Persistent=true`
- **Windows:** Task Scheduler with "run ASAP if missed"

## How It Works

Under the hood, warmup runs:

```bash
claude -p "ping" --max-turns 1
```

This sends a minimal message (~10 tokens) through Claude Code, which starts the 5-hour rate limit window. The OS scheduler ensures this happens automatically at your configured time every day.

**Is this ToS-compliant?** Yes. The request goes through Claude Code itself using your authenticated session. We never extract, store, or proxy your OAuth token. This is functionally identical to running a cron job that uses Claude Code — a standard, legitimate use case.

## Platform Support

| Platform | Scheduler | Boot Recovery |
|----------|-----------|---------------|
| macOS | launchd (LaunchAgents) | RunAtLoad ✓ |
| Linux | systemd user timer (cron fallback) | Persistent=true ✓ |
| Windows | Task Scheduler | StartWhenAvailable ✓ |

## Configuration

Config is stored at `~/.warmup/config.json`. Logs at `~/.warmup/logs/` (auto-rotated at 30 days).

## FAQ

**Q: Does this work for claude.ai web chat?**
A: The subscription rate limit pool is shared across claude.ai, Claude Code, and Cowork. So yes — pre-warming through Claude Code also benefits your web chat sessions.

**Q: How many tokens does the pre-warm use?**
A: Around 10-20 tokens per day. Negligible.

**Q: What if I travel to a different timezone?**
A: Run `warmup update` to adjust. Your timezone is auto-detected.

**Q: Can I set different times for different days?**
A: Not yet in v1. Coming soon.

## Uninstall

```bash
warmup uninstall    # removes scheduled task
npm uninstall -g warmup-cli  # removes the package
```

## License

MIT

## Author

Mohit
