# ☕ warmup

[![npm version](https://badge.fury.io/js/warmup-cli.svg)](https://badge.fury.io/js/warmup-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Pre-warm your Claude rate limits while you sleep.**

One command. Zero daily effort. Full Claude capacity when you need it.

---

## 🛑 The Problem

Claude Pro and Max subscribers share a **5-hour rolling rate limit window** across Claude Code, Cowork, and claude.ai. When you start an intensive coding session, you burn through your allocation quickly and are forced to wait 2-3 hours for the window to reset.

## 🟢 The Solution

**warmup** starts your rate limit window _before_ you wake up by sending a tiny invisible message (~10 tokens) through Claude Code at a scheduled time. 

By the time you sit down to work, the window is perfectly timed to expire exactly when you need it, granting you a **100% fresh allocation** right in the middle of your workday.

```
✖ Without warmup:
  10:00 AM → You start working, window starts
  12:00 PM → Rate limited! Must wait until 3:00 PM

✔ With Smart warmup (2-hour exhaustion):
   7:00 AM → warmup sends invisible "ping"
  10:00 AM → You start working using the active window.
  12:00 PM → You exhaust your limits. BUT the 7:00 AM window ends right now!
  12:00 PM → Window resets instantly! Full capacity continues.
```
*You just saved 3 hours of waiting.*

---

## ⚡ Install

```bash
npm install -g @mohitkumawat/warmup-cli
```

**Prerequisites:** [Claude Code](https://code.claude.com) must be installed and authenticated.

## 🧠 Smart Setup

We don't ask you to do modulo-math to figure out your 5-hour window. `warmup` uses a **Smart Scheduler**.

```bash
warmup setup
```

Just tell it:
1. **When you start working** (e.g., 9:00 AM)
2. **How quickly you exhaust your limits** (e.g., 1-2 hours)

`warmup` automatically calculates the **exact optimal pre-warm time** to ensure your rate limit resets exactly the minute you run out of messages. 

That's it. The OS scheduler installs it in the background. You'll never touch it again.

## 🛡️ Bulletproof Boot-Recovery

**What if my computer is off or asleep at the scheduled pre-warm time?**

`warmup` handles this automatically using native OS features. If your laptop was closed at your 5:00 AM pre-warm time, the pre-warm fires **immediately upon waking your machine** (e.g., at 8:00 AM). 

It has built-in deduplication guards, so it will *never* double-fire or accidentally consume a second rate-limit window, even if you restart your computer 10 times a day.

Supported universally:
- **macOS:** `launchd` with `RunAtLoad`
- **Linux:** `systemd` user timers with `Persistent=true`
- **Windows:** Task Scheduler with `StartWhenAvailable`

## 🛠️ Commands

| Command | Description |
|---------|-------------|
| `warmup setup` | Smart interactive setup wizard |
| `warmup status` | Show schedule and live window progress bar |
| `warmup test` | Fire a pre-warm right now |
| `warmup update` | Change your schedule / re-run the smart wizard |
| `warmup pause` | Pause the daily schedule |
| `warmup resume` | Resume the daily schedule |
| `warmup uninstall` | Remove the background task |


## ❓ FAQ

**Is this ToS-compliant?** 
Yes. The request goes strictly through the official Claude Code CLI using your local authenticated session. We never extract, store, or proxy your OAuth token. This is functionally identical to you typing a message into the CLI.

**Does this work for claude.ai web chat?**
Yes! The subscription rate limit pool is shared across claude.ai, Claude Code, and Cowork. Pre-warming through the CLI grants you limits on the web interface too.

**What if I travel to a different timezone?**
Run `warmup update`. Your new timezone is auto-detected.

## 🗑️ Uninstall

```bash
warmup uninstall             # removes the OS background task
npm uninstall -g warmup-cli  # removes the package
```

---
**License:** MIT
**Author:** Mohit
