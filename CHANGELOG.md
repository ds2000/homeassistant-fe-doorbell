# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.4] - 2026-06-20

### Changed
- **Quick replies fire directly** and no longer drop the phrase into the
  custom-message box (the box is now a pure input, never synced from state).
- **Faster playback** — the talk-daemon poll interval is `1s → 0.2s`, the silence
  pre-roll trimmed (`~3s → ~1.8s`), and the card's pre-speak delay `450ms → 250ms`.

## [0.2.3] - 2026-06-20

### Fixed
- **The visual editor no longer loses focus while typing reply text** (notably on
  mobile). It now builds once and is driven by user input, instead of
  re-rendering the input fields on every echoed config update.

## [0.2.2] - 2026-06-20

### Changed
- **Hold-to-talk now detects an insecure (HTTP) context** and explains that the
  browser blocks the microphone unless Home Assistant is opened over HTTPS (e.g.
  the Nabu Casa remote URL); clearer messages when permission is denied.
- **An empty `replies` list shows a friendly hint** ("add them in the card
  settings") instead of a blank panel, so starting with no quick replies works.

## [0.2.1] - 2026-06-20

### Fixed
- **Custom messages and quick replies now force the active language right before
  speaking**, instead of relying on a load-time sync. This stops the spoken
  language drifting (e.g. a message coming out in French when English was
  selected). The card sets `input_select` to the active language (config
  `default_language`, else the current selection) before each Cloud-TTS call.

## [0.2.0] - 2026-06-20

### Added
- **Customisable, multilingual quick replies.** Each reply carries a per-language
  `phrases` map and is spoken via Home Assistant Cloud TTS in the selected
  language — edit the text in the card config to customise, no audio files
  needed. A reply may instead specify a `service` (e.g. the siren, or a pre-baked
  `script.doorbell_say_*` for instant playback).
- **Visual editor** (`doorbell-card-editor`) — map custom entity names, pick the
  default language and theme, and edit the quick replies (a display **label** and
  the **spoken text** per reply, e.g. "Garden House" → "please put the parcel in
  the garden house"; add/remove replies) all from the dashboard UI — no YAML.
- **`languages` config** — drives the language list in native names (English,
  Nederlands, Deutsch, Français, Español) and maps each to a TTS locale.
- **`default_language` config** — choose the spoken language in the card config;
  the card keeps the `input_select` in sync.

### Changed
- **Reworked the action row** — a **Quick reply** button (which expands the reply
  options) and a **Hold to talk** button now sit side by side; the **siren is its
  own button** below.
- **The language selector is no longer on the card face** — set the language in
  the visual editor / config instead, freeing up dashboard space.
- Default quick replies now use Cloud TTS, so generating phrase WAVs is optional
  (only needed if you switch a reply to the pre-baked `script.doorbell_say_*`
  path for instant playback).

## [0.1.0] - 2026-06-20

Initial release. Talk to a Reolink doorbell behind a Reolink NVR from Home
Assistant — quick replies, multilingual TTS, and hold-to-talk — all driven by a
single self-contained Lovelace card.

### Added
- **`doorbell-card`** — self-contained Lovelace card (shadow DOM, zero runtime
  dependencies, no external fonts). Live camera, status row, prominent
  hold-to-talk recorder, quick-reply grid, custom-message TTS field, and a
  language selector. Follows Home Assistant's light/dark theme automatically.
- **Home Assistant package** (`homeassistant/packages/doorbell_talk.yaml`) —
  `input_select` language picker, `input_text` custom message, snooze helper,
  three `shell_command`s and the quick-reply scripts.
- **Neolink talk add-on** (`addon/`) — watches a queue folder and plays audio to
  the doorbell over Baichuan. Bundles a patched Neolink that fixes the
  TalkAbility parsing bug (upstream
  [QuantumEntangledAndy/neolink#415](https://github.com/QuantumEntangledAndy/neolink/pull/415))
  so battery doorbells with dual `audioStreamMode` work.
- **Cloud TTS bridge** (`addon/tts_say.py`) — speaks the custom message in the
  selected language via Home Assistant Cloud.
- **Phrase generator** (`scripts/generate-phrases.sh` + `homeassistant/phrases.json`)
  — renders the quick-reply phrases for all languages via HA Cloud TTS.
- HACS plugin manifest, add-on repository manifest, MIT license, and a
  GitHub Actions release workflow.

[Unreleased]: https://github.com/ds2000/homeassistant-fe-doorbell/compare/v0.2.4...HEAD
[0.2.4]: https://github.com/ds2000/homeassistant-fe-doorbell/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/ds2000/homeassistant-fe-doorbell/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/ds2000/homeassistant-fe-doorbell/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/ds2000/homeassistant-fe-doorbell/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/ds2000/homeassistant-fe-doorbell/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ds2000/homeassistant-fe-doorbell/releases/tag/v0.1.0
