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

Entity names, the default language, and the theme can also be set from the
card's **visual editor** (no YAML needed) — the same way the fe-tesla card maps
entities. The built-in quick replies are spoken via Home Assistant Cloud TTS, so
generating phrase WAVs is **optional** (only needed for the pre-baked
`script.doorbell_say_*` path).

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
default_language: English   # optional — spoken language (or set it in the editor)
theme: auto                 # auto | light | dark
# Optional. Omit to use the built-in replies. A reply with `phrases` is spoken
# via Cloud TTS in the selected language; a reply with `service` calls that
# service instead.
replies:
  - name: Be right there        # button label
    phrases:                    # what is spoken, per language
      en: "I'll be right there."
      nl: "Ik kom er zo aan."
      de: "Ich komme sofort."
      fr: "J'arrive tout de suite."
      es: "Ahora mismo voy."
  - name: Garden house
    phrases:
      en: "Please put the parcel in the garden house."
  # …add as many as you like. icon: optional mdi SVG path (defaults to a chat bubble).
```

**Reply options:** `name` (the **button label**) and optional `icon` (mdi SVG **path** string; defaults to a chat bubble), then **either** `phrases` (a map of language-code → **spoken text** — the easy way to customise what the door says) **or** `service` (`domain.service` to call on tap, with optional `target` entity id). The **siren** is its own dedicated button (set by the `siren:` entity), not a reply. You can edit each reply's label and spoken text — and add or remove replies — from the card's **visual editor**.

**Languages** are defined by the `languages` option (defaults to English, Dutch, German, French, Spanish), each mapping a label to a phrase code and TTS locale; `default_language` picks the active one.

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
