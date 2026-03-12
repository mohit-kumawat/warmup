<div align="center">

# ☕ warmup

**Pre-warm your Claude rate limits while you sleep.**<br>
*One command. Zero daily effort. Full Claude capacity when you need it.*

[![npm version](https://img.shields.io/npm/v/@mohitkumawat/warmup-cli.svg?style=for-the-badge&color=6C5CE7)](https://www.npmjs.com/package/@mohitkumawat/warmup-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge&color=00B894)](https://opensource.org/licenses/MIT)

</div>

---

## 🛑 The Problem

Claude Pro and Max subscribers share a **5-hour rolling rate limit window** across Claude Code, Cowork, and claude.ai. When you start an intensive coding session, you burn through your allocation quickly and are forced to wait 2-3 hours for the window to reset.

## 🟢 The Solution

**`warmup`** starts your rate limit window _before_ you wake up by scheduling one tiny Claude Code ping (~10 tokens) at the exact right time.

By the time you sit down to work, the window is perfectly timed to expire exactly when you need it, granting you a **100% fresh allocation** right in the middle of your workday.

> **Without warmup:**
> 10:00 AM → You start working, window starts.
> 12:00 PM → Rate limited! Must wait until 3:00 PM.
> 
> **With warmup (2-hour exhaustion):**
>  7:00 AM → warmup sends one tiny ping (window starts).
> 10:00 AM → You start working using the active window.
> 12:00 PM → You exhaust your limits, BUT the 7:00 AM window ends right now!
> 12:00 PM → Window resets instantly. Full capacity continues.

*You just saved 3 hours of waiting.*

---

## ⚡ Install

```bash
npm install -g @mohitkumawat/warmup-cli
```
*Prerequisites: [Claude Code](https://code.claude.com) must be installed and authenticated.*

## 🚀 Quick Start

```bash
warmup
```

Fresh installs open a **guided onboarding wizard**. 

### 🔍 What happens
* Shows the exact background command (`claude -p ping --max-turns 1`) transparently.
* Asks about your typical work schedule.
* Shows a detailed geometric preview of the scheduled timeline before explicitly asking for confirmation.
* Stores config and logs purely locally in `~/.warmup/`.

### 🛡 What DOES NOT happen
* Setup does **not** send a live Claude request or burn any limits.
* `warmup` does **not** proxy your session, extract tokens, or phone home to any backend api.

---

## 🧠 Smart Setup

We don't ask you to do modulo-math to figure out your 5-hour window. `warmup` asks you two plain-English questions:
1. **When do you start working?** (e.g., 9:00 AM)
2. **How quickly do you exhaust limits?** (e.g., 1-2 hours)

It then automatically calculates the **exact optimal pre-warm time** to ensure your rate limit resets exactly the minute you run out of messages.

## 🛡️ Bulletproof Boot-Recovery

**What if my computer is off or asleep at the scheduled pre-warm time?**

`warmup` handles this automatically using native OS features. If your laptop was closed at your 5:00 AM pre-warm time, the pre-warm fires **immediately upon waking your machine** (e.g., at 8:00 AM). 

It has built-in deduplication guards: it will *never* double-fire or accidentally consume a second rate-limit window, even if you restart your computer 10 times a day.

* **macOS:** `launchd` via `RunAtLoad`
* **Linux:** `systemd` timers via `Persistent=true`
* **Windows:** `schtasks` via `StartWhenAvailable`

---

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

---

## ❓ FAQ

<details>
<summary><b>Is this ToS-compliant?</b></summary>
<br>
Yes. The request goes strictly through the official Claude Code CLI using your local authenticated session. We never extract, store, or proxy your OAuth token. This is functionally identical to you typing a message into the CLI yourself.
</details>

<details>
<summary><b>Does this work for claude.ai web chat?</b></summary>
<br>
Yes! The subscription rate limit pool is shared across claude.ai, Claude Code, and Cowork. Pre-warming through the CLI grants you limits on the web interface too.
</details>

<details>
<summary><b>What if I travel to a different timezone?</b></summary>
<br>
Run `warmup update`. Your new timezone is auto-detected.
</details>

---

<div align="center">
  <sub>Built with ❤️ by Mohit. MIT License.</sub>
</div>
