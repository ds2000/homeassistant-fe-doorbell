# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/ds2000/homeassistant-fe-doorbell/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ds2000/homeassistant-fe-doorbell/releases/tag/v0.1.0
