# Install Guide — homeassistant-fe-doorbell

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/integration)

Turn a Reolink video doorbell (or any Reolink camera) that lives **behind a Reolink
NVR/hub** into a two-way intercom you drive from a Lovelace dashboard — quick
replies, multilingual cloud TTS, and hold-to-talk — all from one self-contained card.

> **Why this is hard (the short version):** Reolink cameras behind an NVR speak only
> Reolink's proprietary *Baichuan* protocol, not RTSP/ONVIF for two-way audio, so the
> stock Home Assistant `reolink` integration cannot do doorbell talk. This project
> bridges talk through [Neolink](https://github.com/QuantumEntangledAndy/neolink). A
> bug stopped that working on battery doorbells: the Reolink Video Doorbell advertises
> **two** `<audioStreamMode>` values in its TalkAbility response, and stock Neolink's
> parser rejected the duplicate and reported *"camera does not support talk"*. This
> repo bundles a **patched Neolink** (fix submitted upstream as
> [QuantumEntangledAndy/neolink#415](https://github.com/QuantumEntangledAndy/neolink/pull/415))
> that accepts multiple `audioStreamMode` entries. Talk is relayed **through the NVR
> channel**, and the NVR wakes the sleeping battery doorbell to play it.

> _Screenshots: TODO._

---

## Prerequisites

Before you start, make sure you have:

- **Home Assistant OS or Supervised** — required so you can install add-ons.
- **The Reolink integration configured** in Home Assistant. This gives you the
  `camera`, `battery`, `visitor` and `sleep` entities the card uses, and it supplies
  the same NVR/Reolink credentials Neolink needs.
- **A Reolink NVR/hub** with the doorbell on a known channel (you'll need the NVR IP,
  its media port — usually `9000` — and the doorbell's channel id).
- **Home Assistant Cloud (Nabu Casa)** for TTS — or another TTS engine you can point
  at via `TTS_ENGINE`.
- **[HACS](https://hacs.xyz/)** installed, for the dashboard card.
- **SSH access to the Home Assistant host**, so you can drop `tts_say.py`,
  `neolink.toml`, and `/config/.ha_token` into `/config`.

---

## Install order at a glance

1. [Install the card via HACS](#1-install-the-card-via-hacs) and register the Lovelace resource.
2. [Copy the Home Assistant package, enable packages, restart HA](#2-install-the-home-assistant-package).
3. [Generate the quick-reply phrase files](#3-generate-the-quick-reply-phrases).
4. [Install the add-on and create `neolink.toml`](#4-install-the-neolink-talk-add-on).
5. [Drop `tts_say.py` and create `/config/.ha_token`](#5-install-the-cloud-tts-bridge).
6. [Create a Panel dashboard with one `custom:doorbell-card`](#6-create-the-dashboard).
7. [Reload the app](#7-reload-the-app).

Follow them **in this order** — the card needs the package's scripts to exist, and the
package's scripts call the add-on and the TTS bridge.

---

## 1. Install the card via HACS

The card is `doorbell-card.js`, served by Home Assistant at `/local/doorbell-card.js`.

1. In Home Assistant open **HACS → menu (⋮ top-right) → Custom repositories**.
2. Add the repository:
   - **Repository:** `https://github.com/ds2000/homeassistant-fe-doorbell`
   - **Category / Type:** `Dashboard` (Lovelace)
3. Find **Doorbell Card** in HACS, open it and click **Download**.
4. Register it as a Lovelace resource. **Settings → Dashboards → menu (⋮) →
   Resources → Add resource**, then enter:
   - **URL:** `/local/doorbell-card.js`
   - **Resource type:** `JavaScript module`

> If you don't use HACS, copy `doorbell-card.js` from this repo into
> `/config/www/doorbell-card.js` (creating `/config/www/` if needed) and add the same
> `/local/doorbell-card.js` resource manually.

After adding the resource, hard-refresh your browser (the card won't appear in the card
picker until the resource loads).

---

## 2. Install the Home Assistant package

The package `homeassistant/packages/doorbell_talk.yaml` defines the helpers, the three
`shell_command`s, and the quick-reply scripts the card calls.

1. Copy the package to your config:

   ```
   homeassistant/packages/doorbell_talk.yaml  →  /config/packages/doorbell_talk.yaml
   ```

2. Enable packages in `configuration.yaml` (add this if you don't already have a
   `packages:` line):

   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   ```

3. **Restart Home Assistant** — a full restart, **not** a YAML/quick reload.
   `shell_command` and the `input_*` helpers are only registered at startup.

   _Settings → System → Restart → Restart Home Assistant._

### What the package gives you

- `input_select.doorbell_language` — English / Dutch / German / French / Spanish.
- `input_text.doorbell_custom_message` — the free-text field the card writes to.
- `input_boolean.doorbell_snooze` — snooze helper.
- `shell_command.doorbell_say_file` — copies a pre-rendered phrase WAV into the talk queue.
- `shell_command.doorbell_say_custom` — runs `python3 /config/tts_say.py`.
- `shell_command.doorbell_play_upload` — moves an uploaded recording into the talk queue.
- `script.doorbell_say_brb / porch / help / moment / no_thanks / custom` — the quick replies.

> **Gotcha — keep `shell_command` templates simple.** HA `shell_command` strings only
> support plain `{{ var }}` substitution. A `{% set %}` block (or any Jinja statement)
> inside a `shell_command` raises `UndefinedError`. That's why the language → folder
> lookup (`English → en`, `Dutch → nl`, …) is computed in each **script's `data:`** and
> passed in as `lang`, not done inline in the command. Keep it that way if you edit it.

---

## 3. Generate the quick-reply phrases

The quick replies play pre-rendered WAV files from
`/config/sounds/doorbell/<lang>/<key>.wav` (keys: `brb`, `porch`, `help`, `moment`,
`no_thanks`). Generate them once with the bundled script — it renders all five phrases
in all five languages via Home Assistant Cloud TTS. It only needs `bash`, `curl` and
`jq`.

From a checkout of this repo:

```bash
HA_URL=http://homeassistant.local:8123 \
HA_TOKEN=<long-lived-token> \
HA_SSH="root@homeassistant.local" \
./scripts/generate-phrases.sh
```

- `HA_TOKEN` — a Home Assistant long-lived access token (Profile → Security → Long-lived
  access tokens → Create token).
- `HA_SSH` — **optional**. If set, the rendered files are `scp`'d straight to
  `/config/sounds/doorbell/` on the host. If omitted, files are written to `./out/` and
  you copy them to `/config/sounds/doorbell/` yourself.
- `TTS_ENGINE` — **optional**, defaults to `tts.home_assistant_cloud`. Set it if you use a
  different engine.

When this finishes you should have, on the host:

```
/config/sounds/doorbell/en/brb.wav   (… porch, help, moment, no_thanks)
/config/sounds/doorbell/nl/…
/config/sounds/doorbell/de/…
/config/sounds/doorbell/fr/…
/config/sounds/doorbell/es/…
```

> Phrase text lives in `homeassistant/phrases.json` — edit it there and re-run the
> script to change wording or add a language.

---

## 4. Install the Neolink talk add-on

The add-on (`addon/`) runs the patched Neolink and a "talk-daemon" that watches the
queue folders and plays each audio file to the doorbell.

### 4a. Add and install the add-on

Pick one path:

**Option A — add this repo as an add-on repository (recommended).**

1. **Settings → Add-ons → Add-on Store → menu (⋮) → Repositories.**
2. Add `https://github.com/ds2000/homeassistant-fe-doorbell`.
3. Find **Neolink Doorbell Talk** in the store and click **Install**.

**Option B — build locally.** Copy the `addon/` folder into `/addons/neolink_doorbell/`
on the host (so Supervisor sees it as a local add-on), then install it from the
**Local add-ons** section. The Dockerfile is multi-stage and compiles the patched
Neolink from source (fork branch `fix-371-talkability-audiostreammode`), so the first
build is slow and disk-hungry — build on a capable host if you can.

The add-on (slug `neolink_doorbell`) maps `config:rw` and `media:rw` so it can read and
clear the talk queue and the media drop folder.

The add-on is **self-contained**: its talk-daemon (`run.sh`) is baked into the image, so
you do **not** copy any script to the host. The daemon watches **`/config/addons/talk_queue`**
and **`/media/doorbell`**, and for each audio file it prepends ~3 seconds of **silence**
(via `gst-launch` `audiotestsrc wave=silence`) before running
`neolink talk doorbell -c /config/addons/neolink.toml -f <file> -v 2.0`, then deletes the
file. (`-v 2.0` sets the playback volume; edit it in `run.sh` if you need it louder or
quieter.)

> **Why the silence pad matters.** The talk session needs roughly two seconds to open
> the camera speaker, so without padding the first words of a short clip get clipped.
> And it must be `wave=silence` — `audiotestsrc`'s default waveform is a **beep**, so
> the wrong setting prepends a tone to every message.

### 4b. Create `neolink.toml`

Copy the example and fill in your NVR details:

```
addon/neolink.toml.example  →  /config/addons/neolink.toml
```

Edit `/config/addons/neolink.toml`:

```toml
bind = "0.0.0.0"

[[cameras]]
name = "doorbell"
username = "REOLINK_USERNAME"
password = "REOLINK_PASSWORD"
address = "192.168.1.100:9000"   # NVR/hub IP : mediaPort (GetNetPort → mediaPort, usually 9000)
channel_id = 3                   # the doorbell's 0-based channel on the NVR
```

- `address` — your **NVR/hub** IP and its **media port** (usually `9000`).
- `channel_id` — the doorbell's channel on the NVR (0-based; check the Reolink app or
  the NVR channel list).
- `username` / `password` — your Reolink account credentials (the same ones the HA
  `reolink` integration uses).

> For a **standalone** doorbell (not behind an NVR), point `address` at the camera IP and
> omit `channel_id`, or use `uid` for a battery camera.

### 4c. Start the add-on

Start it and watch the log. On success you'll see
`talk-daemon v4: watching /config/addons/talk_queue /media/doorbell`. Enable **Start on
boot** and **Watchdog** if you want it always running.

> **Talk is exclusive.** While the add-on holds the talk backchannel, the **Reolink app
> cannot talk** through that camera, and vice-versa. Close the Reolink app's talk view
> before testing here.

---

## 5. Install the Cloud TTS bridge

`addon/tts_say.py` runs inside **HA core** (which has `python3`) and powers the card's
**custom message** field: it reads `input_text.doorbell_custom_message` +
`input_select.doorbell_language`, calls Home Assistant Cloud TTS
(`tts.home_assistant_cloud`) with the matching locale
(`en-GB` / `nl-NL` / `de-DE` / `fr-FR` / `es-ES`), and drops the resulting MP3 into the
talk queue.

1. Copy the script:

   ```
   addon/tts_say.py  →  /config/tts_say.py
   ```

   (This matches `shell_command.doorbell_say_custom: "python3 /config/tts_say.py"`.)

2. Create the token file it reads. The script authenticates to the local HA API with a
   long-lived token at `/config/.ha_token`. Create one (Profile → Security → Long-lived
   access tokens → Create token), then on the host:

   ```bash
   printf '%s' '<long-lived-token>' > /config/.ha_token
   chmod 600 /config/.ha_token
   ```

   > `chmod 600` keeps the token readable only by the owner. Don't add a trailing
   > newline — the script strips whitespace, but keep it clean.

> Requires **Home Assistant Cloud (Nabu Casa)** for the default engine
> (`tts.home_assistant_cloud`). To use a different TTS engine, either set the `TTS_ENGINE`
> env var on the add-on **or** change the default in `/config/tts_say.py`.

---

## 6. Create the dashboard

The card is happiest as a single full-width card in a **Panel** view.

1. **Settings → Dashboards** → open (or create) a dashboard → **Edit → Add view**.
2. Set the view's **type** to **Panel (1 card)**.
3. **Add card → search for "Doorbell"** (or **Manual** card) and paste a config:

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
   ```

   Every option is optional and the defaults above are sensible — at minimum set
   `camera` (and the other entity ids if yours differ). Leave `theme: auto` to follow
   Home Assistant's light/dark mode automatically.

### Custom quick replies (optional)

The card ships with six built-in quick replies. To override them, add a `replies:`
list. Each entry is `{ name, icon (an mdi SVG path), service, target?, accent? }`:

```yaml
type: custom:doorbell-card
camera: camera.reolink_video_doorbell_fluent
replies:
  - name: Be right there
    icon: M13,3A9,9...        # mdi SVG path data
    service: script.doorbell_say_brb
  - name: One moment
    icon: M12,2A10...
    service: script.doorbell_say_moment
    accent: true
```

The card calls `script.doorbell_say_*`, `siren.toggle`,
`input_select.select_option`, `input_text.set_value`,
`shell_command.doorbell_play_upload`, and POSTs hold-to-talk recordings to
`/api/media_source/local_source/upload`.

---

## 7. Reload the app

Hard-refresh the Home Assistant web app (or fully close and reopen the companion app) so
the new card resource and dashboard load cleanly. Then test:

- Tap the live image → opens more-info for the camera.
- Tap a **quick reply** → you should hear it at the door within a few seconds.
- Type a **custom message → Speak it** → Cloud TTS renders and plays it.
- **Hold to talk** → records, uploads, and plays your voice at the door.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| A **beep** plays before every message instead of silence | The silence pad is using the wrong `audiotestsrc` waveform (the default is a tone) | Ensure the pad uses **`wave=silence`** in `run.sh` (it does by default — don't change it). |
| Add-on log says **"camera does not support talk"** / "does not support" | Stock Neolink can't parse the doorbell's dual `<audioStreamMode>` | Make sure you're running this add-on's **patched Neolink** (fork branch `fix-371-talkability-audiostreammode`, upstream PR #415) — not a stock Neolink image. |
| `shell_command` fails with **`UndefinedError`** | A Jinja `{% set %}`/statement was put inside a `shell_command` (only `{{ var }}` substitution is supported) | Move the logic into the **script's `data:`** and pass the result in as a simple variable; keep the command to plain `{{ var }}`. |
| Talk works from the Reolink app but **not** from the card (or vice-versa) | The talk backchannel is **exclusive** | Close the Reolink app's talk view; only one talker per camera at a time. |
| First word of a quick reply is cut off, or a battery doorbell takes a moment | Battery doorbells are **asleep**; the NVR needs to wake them and the talk session needs ~2s to open the speaker | Expect roughly a **~5s wake delay** on battery doorbells. The ~3s silence pad covers the speaker-open gap; if clips still clip, increase the pad length in `run.sh`. |
| Nothing plays and the queue file just sits there | Add-on not running, or queue path wrong | Confirm the add-on is started; check the add-on log for `talk-daemon v4: watching …`. |
| Custom message does nothing | Missing token, no Nabu Casa, or wrong engine | Confirm `/config/.ha_token` exists (`chmod 600`), Home Assistant Cloud is active, and `tts.home_assistant_cloud` (or your `TTS_ENGINE`) is available. |
| Card doesn't appear in the picker | Lovelace resource missing or stale | Re-check the resource: URL `/local/doorbell-card.js`, type **JavaScript module**, then hard-refresh the browser. |

---

## License

MIT — see [LICENSE](../LICENSE). Author: David Shaw ([@ds2000](https://github.com/ds2000)).
