# CLAUDE.md

Guidance for Claude Code working in **homeassistant-fe-doorbell**. Read this before
changing anything — the conventions here are firm and several of them exist to work
around real Home Assistant / Reolink limitations.

## What this project is

A reusable Home Assistant package that turns a **Reolink video doorbell (and other
Reolink cameras) behind a Reolink NVR/hub** into a **two-way intercom** you drive from a
Lovelace dashboard. Author: David Shaw (GitHub `ds2000`). License: MIT. Repo:
<https://github.com/ds2000/homeassistant-fe-doorbell>.

It is a sibling to the author's `homeassistant-fe-tesla` card and shares its conventions:
one self-contained card, distributed as a HACS plugin, **zero runtime dependencies**.

Screenshots: _TODO._

### The hard problem it solves (the selling point)

Reolink cameras behind an NVR speak only Reolink's proprietary **"Baichuan"** protocol —
not RTSP/ONVIF for two-way audio — so Home Assistant's `reolink` integration **cannot do
doorbell talk**. The fix is [Neolink](https://github.com/QuantumEntangledAndy/neolink), an
open-source Baichuan bridge. A bug blocked battery doorbells: the Reolink Video Doorbell
advertises **two `<audioStreamMode>` values** in its TalkAbility response, and stock
Neolink's parser rejected the duplicate field and reported "camera does not support talk".
This repo **bundles a patched Neolink** (fix submitted upstream as
[QuantumEntangledAndy/neolink#415](https://github.com/QuantumEntangledAndy/neolink/pull/415))
that accepts multiple `audioStreamMode` entries. Talk is relayed **through the NVR channel**
(control-plane Baichuan), and the NVR wakes the sleeping battery doorbell for the talk session.

## Architecture / data flow

```
Lovelace doorbell-card  ──calls──>  HA scripts / shell_command / media upload
      │                                   │
      │ (quick reply: copy phrase WAV)    │ (custom msg: tts_say.py -> HA Cloud TTS mp3)
      ▼                                   ▼
 /config/addons/talk_queue   and   /media/doorbell   (shared folders)
      │
      ▼  watched by the add-on's talk-daemon (run.sh)
 neolink talk doorbell  ──Baichuan──>  Reolink NVR (mediaPort 9000, channel_id)  ──>  doorbell speaker
```

Every path ends with an audio file landing in a watched folder; the add-on daemon pads it
with silence and relays it through Neolink. Keep that invariant in mind for any change.

## Firm conventions (do not break)

1. **Single self-contained card.** The whole frontend is one file, `src/doorbell-card.js`,
   built/copied to `dist/doorbell-card.js` and the repo-root `doorbell-card.js`. No build
   step beyond a copy. Do not split it into modules or introduce a bundler.
2. **Zero runtime dependencies.** The card uses shadow DOM and plain DOM APIs. Do not add
   `lit`, `lit-element`, or any npm runtime dep. `package.json` intentionally has no
   `dependencies`.
3. **NO external font CDNs.** Use **system font stacks** only. Never add a `<link>` to Google
   Fonts or any other font CDN — it breaks offline/LAN-only HA installs and leaks requests.
4. **Configurable via YAML.** Everything the card touches (entities, replies, theme) is a
   Lovelace config option with a sensible default. Never hardcode an `entity_id` the user
   can't override.
5. **Follow `hass.themes.darkMode`.** The card follows Home Assistant's own light/dark mode
   (not the OS), overridable with `theme: light|dark`. See `src/doorbell-card.js` around the
   theme resolution: `this._cfg.theme === "dark" || (theme !== "light" && hass.themes.darkMode)`.
   Don't read `prefers-color-scheme`.

## Components and where they live

### 1. Card — `src/doorbell-card.js` → `dist/doorbell-card.js` + `doorbell-card.js`
Custom element **`doorbell-card`** (used as `type: custom:doorbell-card`), registered via
`customElements.define("doorbell-card", …)`. Renders: title, live camera (refreshes the
camera `entity_picture` every **2500ms** via `setInterval`; tap opens more-info), a status
row (battery %, visitor, asleep/awake), a prominent **HOLD-TO-TALK** recorder (records mic
audio, uploads, plays at the door; pulses while recording), a 2-column **quick-replies** grid,
a **custom message** text field + Speak it, and a **settings** row with the language selector.

Services / endpoints it calls:
- `script.doorbell_say_*`
- `siren.toggle`
- `input_select.select_option`, `input_text.set_value`
- `shell_command.doorbell_play_upload` (with `{ fn }`)
- POST recordings to `/api/media_source/local_source/upload`
  (`media_content_id: media-source://media_source/local/doorbell`).

Config options (all optional; defaults shown):

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
theme: auto        # auto | light | dark
replies:           # defaults to 6 built-ins if omitted
  - { name: "...", icon: "<mdi SVG path>", service: "script.doorbell_say_brb", target: {}, accent: "#..." }
```

Recommended dashboard: a **Panel** (single-card) view.

### 2. HA package — `homeassistant/packages/doorbell_talk.yaml`
Defines `input_select.doorbell_language` (English/Dutch/German/French/Spanish),
`input_text.doorbell_custom_message`, `input_boolean.doorbell_snooze`, three
`shell_command`s, and the quick-reply scripts (`doorbell_say_brb/porch/help/moment/no_thanks/custom`).

- `doorbell_say_file` — `cp` a phrase WAV from `/config/sounds/doorbell/{{ lang }}/{{ name }}.wav`
  into the talk queue.
- `doorbell_say_custom` — runs `python3 /config/tts_say.py`.
- `doorbell_play_upload` — `mv` an uploaded file into the talk queue.

Install: copy to `<config>/packages/`, enable packages
(`homeassistant: packages: !include_dir_named packages`), then **RESTART HA** (a reload is not
enough — `shell_command` and `input_*` helpers need a full restart).

> **`shell_command` `{{ var }}`-only rule (critical gotcha).** HA `shell_command` templates
> support **only simple `{{ var }}` substitution**. A `{% set %}` / lookup *inside* a
> `shell_command` raises `UndefinedError`. So the language → folder-code lookup
> (`English→en`, `Dutch→nl`, …) is done in the **script's `data:`**, which is passed to the
> command as `{{ lang }}`. When editing these commands, keep all logic in the script data and
> leave the `shell_command` string as plain `{{ name }}` / `{{ lang }}` / `{{ fn }}`
> placeholders.

### 3. Add-on — `addon/`
Files: `config.yaml`, `Dockerfile`, `run.sh`, `tts_say.py`, `neolink.toml.example`. A Home
Assistant add-on, slug **`neolink_doorbell`**, mapping `config:rw` and `media:rw`
(arch `aarch64` + `amd64`).

- **`Dockerfile`** is multi-stage. Stage 1 builds patched Neolink from the fork branch
  `fix-371-talkability-audiostreammode` (`github.com/nythtech-nl/neolink`); stage 2 is the
  runtime (`quantumentangledandy/neolink:latest` + `python3`) and copies the built binary in.
  Once #415 merges, stage 1 can be deleted and the binary taken from the official image.
- **`run.sh`** is the **talk-daemon (v4)**. It watches `/config/addons/talk_queue` and
  `/media/doorbell`; for each audio file it **prepends ~3s of silence** (gst-launch `concat`
  with `audiotestsrc wave=silence` — **`wave=silence` is required**; the default waveform is a
  beep), then runs `neolink talk doorbell -c /config/addons/neolink.toml -f <file> -v 2.0`
  (`-v 2.0` sets playback loudness), then deletes the file. The silence pad matters because
  the talk session needs ~2s to open the camera speaker, so short clips get clipped without
  it. Don't remove the pad.
- The user must create `/config/addons/neolink.toml` from `neolink.toml.example` (NVR
  `IP:mediaPort`, `channel_id`, Reolink credentials).
- **The talk backchannel is exclusive** — while the add-on talks, the Reolink app can't talk
  through that camera. Mention this where relevant; don't try to "fix" it.

### 4. Cloud TTS — `addon/tts_say.py` (installed at `/config/tts_say.py`)
Runs in HA core (which has `python3`). Reads `input_text.doorbell_custom_message` +
`input_select.doorbell_language`, calls HA Cloud TTS (`tts.home_assistant_cloud`) with the
matching locale (`en-GB`/`nl-NL`/`de-DE`/`fr-FR`/`es-ES`), and downloads the mp3 into the
queue. Needs a long-lived token at `/config/.ha_token` (chmod 600). Requires **Home Assistant
Cloud (Nabu Casa)** or another TTS engine (set `TTS_ENGINE`).

### 5. Phrases — `homeassistant/phrases.json` + `scripts/generate-phrases.sh`
5 phrases × 5 languages. The script renders them to
`/config/sounds/doorbell/<lang>/<key>.wav` via HA Cloud TTS (cross-platform: bash + curl +
jq; optional `HA_SSH` to scp to the host). Keys: `brb`, `porch`, `help`, `moment`,
`no_thanks` — these **must match** the script names in the HA package.

## Repo layout

```
doorbell-card.js, dist/doorbell-card.js, src/doorbell-card.js   # the card (src is source of truth)
hacs.json, repository.json, package.json, LICENSE, CHANGELOG.md, .gitignore
addon/{config.yaml,Dockerfile,run.sh,tts_say.py,neolink.toml.example}
homeassistant/{packages/doorbell_talk.yaml, phrases.json, sounds/ (generated, gitignored)}
scripts/generate-phrases.sh
docs/INSTALL.md
.github/workflows/release.yml
```

`hacs.json` points HACS at the root `doorbell-card.js`; `repository.json` is the add-on
repository manifest. Generated audio (`homeassistant/sounds/**`, `.ha_token`, `.env`,
`secrets.yaml`) is gitignored — never commit it.

## Prerequisites

HA OS / Supervised (for add-ons), the `reolink` integration configured (supplies the
camera/battery/visitor/sleep entities and the NVR credentials), HA Cloud (Nabu Casa) for TTS,
HACS for the card, a Reolink NVR/hub with a doorbell on a known channel, and SSH access to the
HA host to drop `tts_say.py`, `neolink.toml`, and `/config/.ha_token`.

## Install order (see `docs/INSTALL.md`)

1. Add the HACS card resource `/local/doorbell-card.js` as a **JavaScript module**.
2. Copy the HA package, enable packages, **restart HA**.
3. Generate phrases (`scripts/generate-phrases.sh`).
4. Install the add-on (add this repo as an add-on repository, or build locally); create
   `neolink.toml`.
5. Drop `tts_say.py` + `/config/.ha_token`.
6. Create a Panel dashboard with one `custom:doorbell-card`.
7. Reload the app.

## Release process

Driven by `.github/workflows/release.yml`, triggered on tags matching `v*`:

1. Bump the version in `package.json` (and `addon/config.yaml`), update `CHANGELOG.md`.
2. Ensure `dist/doorbell-card.js` and the root `doorbell-card.js` match `src/doorbell-card.js`.
3. Tag and push: `git tag v0.1.0 && git push origin v0.1.0`.

The workflow then: `node --check dist/doorbell-card.js` (syntax), verifies the tag matches
`package.json` version (`v$TAG == package.json version`, else it fails), and creates a GitHub
release with generated notes, attaching `dist/doorbell-card.js`.

Current version: **0.1.0** (initial release).

## Working notes for Claude

- Edit the card in `src/doorbell-card.js`, then sync `dist/` and root copies — the release
  CI checks `dist/`, and HACS ships the root file.
- Keep functions small and the card dependency-free; prefer plain DOM over abstractions.
- When touching `shell_command`s, obey the `{{ var }}`-only rule above.
- When touching the talk-daemon, preserve the silence pad and the queue-then-delete flow.
- Bump `CHANGELOG.md` and both card copies as part of any user-facing change.
