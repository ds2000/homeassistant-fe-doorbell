# Doorbell Card &middot; homeassistant-fe-doorbell

Talk to a **Reolink video doorbell that lives behind a Reolink NVR/hub** straight from a Home Assistant dashboard. This repo turns that doorbell — which Home Assistant's `reolink` integration can see but *cannot speak through* — into a two-way intercom: a single self-contained Lovelace card gives you a live camera view, hold-to-talk, multilingual quick replies, and custom text-to-speech, all played out at the door.

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=ds2000&repository=homeassistant-fe-doorbell&category=plugin)

> Screenshots: TODO.

---

## Why this is hard (and what it solves)

Reolink cameras behind an NVR don't expose RTSP/ONVIF two-way audio — they speak only Reolink's proprietary **Baichuan** control protocol. That's why Home Assistant's `reolink` integration can read the battery, visitor and sleep state but can **not** do doorbell *talk*.

The fix is **[Neolink](https://github.com/QuantumEntangledAndy/neolink)**, an open-source Baichuan bridge — but a bug stopped it working with battery doorbells. The Reolink Video Doorbell advertises **two** `<audioStreamMode>` values in its `TalkAbility` response, and stock Neolink's parser rejected the duplicate field and reported *"camera does not support talk."* This project bundles a **patched Neolink** that accepts multiple `audioStreamMode` entries (submitted upstream as **[QuantumEntangledAndy/neolink#415](https://github.com/QuantumEntangledAndy/neolink/pull/415)**, fixing issue #371).

Talk is relayed **through the NVR channel** over control-plane Baichuan, and the NVR wakes the sleeping battery doorbell so audio actually reaches the speaker.

---

## Features

- **One self-contained card** — `custom:doorbell-card`. Shadow DOM, zero runtime dependencies, no external fonts (system font stacks).
- **Live camera** — refreshes the camera entity picture every ~2.5s; tap to open more-info.
- **Status row** — battery %, visitor detected, and asleep / awake state at a glance.
- **Hold-to-talk** — records mic audio, uploads it, and plays it at the door; pulses while recording.
- **Quick replies** — a 2-column grid of one-tap phrases (defaults to 6 built-ins, fully configurable).
- **Custom message TTS** — type anything and have it spoken at the door via Home Assistant Cloud.
- **Multilingual** — English, Dutch, German, French, Spanish for both quick replies and custom TTS.
- **Theme-aware** — follows HA's own light/dark mode automatically (override with `theme:`).
- **Battery-doorbell-ready** — bundled patched Neolink handles the dual-`audioStreamMode` doorbell.

---

## How it works

```
 Lovelace doorbell-card  ──calls──>  HA scripts / shell_command / media upload
       │                                   │
       │ (quick reply: copy phrase WAV)    │ (custom msg: tts_say.py → HA Cloud TTS mp3)
       ▼                                   ▼
  /config/addons/talk_queue   and    /media/doorbell      (shared folders)
       │
       ▼  watched by the add-on's talk-daemon (run.sh)
  neolink talk doorbell  ──Baichuan──>  Reolink NVR (mediaPort 9000, channel_id)  ──>  doorbell speaker
```

Each audio file is padded with ~3s of leading silence before it is sent — the talk session needs ~2s to open the camera speaker, so without the pad short clips get clipped at the start. The daemon runs `neolink talk doorbell -c neolink.toml -f <file> -v 2.0` (the `-v 2.0` flag sets playback loudness; edit it in `run.sh`).

> The talk backchannel is **exclusive**: while the add-on is talking, the Reolink app can't talk through that camera.

---

## Components

Everything ships in this repo:

| Component | Path | Role |
|---|---|---|
| **Card** | `doorbell-card.js`, `dist/doorbell-card.js`, `src/doorbell-card.js` | The `custom:doorbell-card` Lovelace element. |
| **HA package** | `homeassistant/packages/doorbell_talk.yaml` | Helpers (`input_select`/`input_text`/`input_boolean`), three `shell_command`s, and the quick-reply scripts. |
| **Add-on** | `addon/` | The Neolink talk daemon. Multi-stage Dockerfile builds the patched Neolink; `run.sh` watches the queue and plays audio. |
| **Cloud TTS** | `addon/tts_say.py` → `/config/tts_say.py` | Speaks the custom message in the selected language via HA Cloud TTS. |
| **Phrases** | `homeassistant/phrases.json` + `scripts/generate-phrases.sh` | Renders the 5 quick-reply phrases × 5 languages to `/config/sounds/doorbell/<lang>/<key>.wav`. |

**Gotcha worth knowing:** HA `shell_command` templates only support simple `{{ var }}` substitution. The language → folder lookup is done in the **script's** `data:`, never inline in the command — a `{% set %}` inside a `shell_command` raises `UndefinedError`.

---

## Configuration

Add the card to a dashboard (a **Panel / single-card view** is recommended). Every option is optional; the defaults below match a Reolink Video Doorbell behind an NVR with the package installed.

```yaml
type: custom:doorbell-card
camera: camera.reolink_video_doorbell_fluent
battery: sensor.reolink_video_doorbell_battery
visitor: binary_sensor.reolink_video_doorbell_visitor
sleep: binary_sensor.reolink_video_doorbell_sleep_status
snooze: input_boolean.doorbell_snooze
language: input_select.doorbell_language
message: input_text.doorbell_custom_message
siren: siren.reolink_video_doorbell_siren
theme: auto          # auto | light | dark
# Optional. Omit to use the 6 built-in replies below.
replies:
  - name: Be right there
    icon: "M12,2A10,10 0 0,0 2,12 ..."   # mdi SVG path data
    service: script.doorbell_say_brb
  - name: Garden house
    icon: "M12,3L2,12H5V20 ..."
    service: script.doorbell_say_porch
  - name: Can I help
    icon: "M9,22A1,1 0 0,1 8,21 ..."
    service: script.doorbell_say_help
  - name: One moment
    icon: "M6,2V8H6V8L10,12 ..."
    service: script.doorbell_say_moment
  - name: No thanks
    icon: "M12,2C17.53,2 22,6.47 ..."
    service: script.doorbell_say_no_thanks
  - name: Siren
    icon: "M12,2A7,7 0 0,1 19,9 ..."
    service: siren.toggle
    target: siren.reolink_video_doorbell_siren
    accent: true
```

**Reply options:** `name` (label), `icon` (mdi SVG **path** string), `service` (`domain.service` to call on tap), optional `target` (entity id passed as the call target), optional `accent: true` (highlights the button).

| Option | Default | Notes |
|---|---|---|
| `camera` | `camera.reolink_video_doorbell_fluent` | Live image; tap opens more-info. |
| `battery` | `sensor.reolink_video_doorbell_battery` | Shown in the status row. |
| `visitor` | `binary_sensor.reolink_video_doorbell_visitor` | Visitor-present indicator. |
| `sleep` | `binary_sensor.reolink_video_doorbell_sleep_status` | Asleep / awake. |
| `snooze` | `input_boolean.doorbell_snooze` | Optional snooze toggle. |
| `language` | `input_select.doorbell_language` | Drives quick-reply + TTS locale. |
| `message` | `input_text.doorbell_custom_message` | Custom-message text field. |
| `siren` | `siren.reolink_video_doorbell_siren` | Used by the built-in Siren reply. |
| `theme` | `auto` | `auto` follows HA dark mode; pin with `light`/`dark`. |
| `replies` | 6 built-ins | Be right there, Garden house, Can I help, One moment, No thanks, Siren. |

---

## Install (summary)

**Prerequisites:** Home Assistant OS / Supervised (for add-ons), the **Reolink integration** configured (supplies the camera/battery/visitor/sleep entities and NVR credentials), **Home Assistant Cloud (Nabu Casa)** for TTS, **HACS** for the card, a Reolink NVR/hub with the doorbell on a known channel, and SSH access to the HA host (to drop `tts_say.py`, `neolink.toml`, and `/config/.ha_token`).

1. **Card** — install via HACS (button above), or add `/local/doorbell-card.js` as a JavaScript-module dashboard resource.
2. **Package** — copy `homeassistant/packages/doorbell_talk.yaml` to `<config>/packages/`, enable packages (`homeassistant: packages: !include_dir_named packages`), and **restart HA** (a reload is not enough for `shell_command` + `input_*`).
3. **Phrases** — run `scripts/generate-phrases.sh` to render the quick-reply WAVs.
4. **Add-on** — add this repo as an add-on repository (or build locally) and create `<config>/addons/neolink.toml` from `addon/neolink.toml.example` (NVR `IP:mediaPort`, `channel_id`, Reolink credentials).
5. **TTS bridge** — drop `tts_say.py` at `/config/tts_say.py` and a long-lived token at `/config/.ha_token` (`chmod 600`).
6. **Dashboard** — create a Panel view with one `custom:doorbell-card`.
7. Reload the app.

Full step-by-step instructions: **[docs/INSTALL.md](docs/INSTALL.md)**.

---

## Credits

- **[Neolink](https://github.com/QuantumEntangledAndy/neolink)** by QuantumEntangledAndy — the open-source Baichuan bridge that makes any of this possible.
- The bundled TalkAbility fix for dual-`audioStreamMode` battery doorbells, submitted upstream as **[QuantumEntangledAndy/neolink#415](https://github.com/QuantumEntangledAndy/neolink/pull/415)** (resolving issue #371).
- Sibling project to [homeassistant-fe-tesla](https://github.com/ds2000) — same conventions: a self-contained card, HACS plugin, zero runtime dependencies.

Built by **David Shaw** ([ds2000](https://github.com/ds2000)).

## License

[MIT](LICENSE) © David Shaw.
