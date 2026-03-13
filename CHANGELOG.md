# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.14] - 2026-03-13

### Added
- **Dry-Run Mode:** Added `--dry-run` to `warmup test` to simulate pre-warms without consuming rate limit capacity.
- **Improved Aliases:** Added `stop` as an alias for the `pause` command for better UX intuition.

### Changed
- **Professional Post-Install:** Removed aggressive TTY/automatic setup from the global install process. Setup is now manual and non-intrusive.
- **Improved Test Feedback:** Refined test command animations and added clear status indicators.

### Fixed
- **NPM Install Hang:** Resolved the issue where global installations would hang during the background setup prompt.

## [1.2.13] - 2026-03-12

### Fixed

- Replaced broken NPM downloads badge with GitHub stars badge in README for better reliability.

## [1.2.0] - 2026-03-12

### Added

- **UI Transparency Onboarding:** Running `warmup` naked now defaults to a guided first-run onboarding wizard.
- **Trust Checks:** Setup now explicitly renders the *exact scheduled command* in a branded box before confirming installation.
- **Width-Aware Rendering:** Output is now dynamically responsive to terminal width, powered by `string-width`.
- **Install Preview Table:** Setup and Update flows now output a shared schedule preview and exact system impact summary before committing OS tasks.
- **Stacked Summaries:** The post-setup timeline has been replaced by structured `Key: Value` detail rows for cleaner parsing.

## [1.1.2] - 2026-03-12

### Fixed

- Rebuilt distribution to use scoped `@mohitkumawat/warmup-cli` namespace instead of generic name.
- Corrected smart scheduling modulo math in README examples.

## [1.0.0] - 2026-03-12

### Initial

- **Smart Scheduling Engine:** Ask for Work Start Time and Exhaustion Rate to calculate precise modulo offsets.
- **OS-Native Integration:** Full integration across macOS (`launchd`), Linux (`systemd` / `@reboot`), and Windows (`schtasks`).
- **Bulletproof Boot Recovery:** Guard `_execute-warmup` to skip duplicate bounds or out-of-window launches.
- **Robust Timezone Parsing:** Swapped fragile `toLocaleString` for `Intl.DateTimeFormat.formatToParts`.
- Cross-platform CLI testing suite.
