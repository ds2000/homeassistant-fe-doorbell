# Home Assistant package — `doorbell_talk.yaml`

The Home Assistant side of [homeassistant-fe-doorbell](https://github.com/ds2000/homeassistant-fe-doorbell).
This package defines the helpers, scripts and `shell_command`s that the
`custom:doorbell-card` Lovelace card calls when you talk through a Reolink
doorbell that sits behind a Reolink NVR/hub. It also ships `tts_say.py`, which
turns a typed custom message into speech via Home Assistant Cloud TTS.

> The card and add-on are documented in the [repo root README](../README.md) and
> [`docs/INSTALL.md`](../docs/INSTALL.md). This file covers only what lives under
> `homeassistant/`.

> Screenshots: TODO.

---

## What this package gives you

Copy one file into your config and restart, and you get:

**Helpers (`input_*`)**

| Entity | Type | Purpose |
|---|---|---|
| `input_select.doorbell_language` | select | English / Dutch / German / French / Spanish — picks which phrase folder and TTS locale to use. |
| `input_text.doorbell_custom_message` | text | The free-text message the card speaks via Cloud TTS (max 250 chars). |
| `input_boolean.doorbell_snooze` | toggle | Snooze flag the card reads/writes. |

**Shell commands (`shell_command`)**

| Command | What it runs |
|---|---|
| `doorbell_say_file` | `cp /config/sounds/doorbell/{{ lang }}/{{ name }}.wav /config/addons/talk_queue/{{ name }}.wav` — drops a pre-rendered phrase WAV into the add-on talk queue. |
| `doorbell_say_custom` | `python3 /config/tts_say.py` — renders the typed message to speech and queues it. |
| `doorbell_play_upload` | `mv /media/doorbell/{{ fn }} /config/addons/talk_queue/{{ fn }}` — moves a hold-to-talk recording the card uploaded into the queue. |

**Scripts (`script`)** — these are what the card actually calls:

`doorbell_say_brb`, `doorbell_say_porch`, `doorbell_say_help`,
`doorbell_say_moment`, `doorbell_say_no_thanks`, `doorbell_say_custom`.

Each quick-reply script resolves the selected language name to a folder code
(`English → en`, `Dutch → nl`, `German → de`, `French → fr`, `Spanish → es`,
defaulting to `en`) and then calls the `doorbell_say_file` shell command. The
`doorbell_say_custom` **script** calls the `doorbell_say_custom` **shell command**,
which runs `python3 /config/tts_say.py`.

The talk queue at `/config/addons/talk_queue/` is watched by the add-on's
talk-daemon, which relays each file to the doorbell speaker through the NVR.

---

## Install the package

1. **Copy the file** into your config's `packages/` directory:

   ```text
   homeassistant/packages/doorbell_talk.yaml  →  <config>/packages/doorbell_talk.yaml
   ```

2. **Enable packages** in `configuration.yaml` (if not already enabled):

   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   ```

3. **Restart Home Assistant** — a full restart, not a YAML/quick reload.
   `shell_command` and `input_*` entities are only registered at startup; a
   reload will **not** pick them up. (Settings → System → Restart, or
   Developer Tools → YAML → Restart.)

The entity IDs in the package assume a Reolink Video Doorbell behind a Reolink
NVR (the `reolink` integration). If your entity names differ, edit the IDs in
`doorbell_talk.yaml` to match and point the card's config at them.

---

## Gotcha — `shell_command` only does simple `{{ var }}` substitution

Home Assistant's `shell_command` template engine supports **only** plain
`{{ var }}` value substitution. It does **not** run full Jinja: a `{% set %}`,
dict lookup or filter expression placed inline in the command string raises
`UndefinedError` at call time.

That is why the language→folder lookup lives in the **script's `data:`**, not in
the command. The script computes `lang` with Jinja and passes the finished value
down to `doorbell_say_file`, which only ever sees a bare `{{ lang }}`:

```yaml
script:
  doorbell_say_brb:
    sequence:
      - service: shell_command.doorbell_say_file
        data:
          name: brb
          lang: >-
            {{ {'English':'en','Dutch':'nl','German':'de',
                'French':'fr','Spanish':'es'}[states('input_select.doorbell_language')]
               | default('en') }}
```

If you add languages or replies, do the templating in the script's `data:` and
keep the `shell_command` strings to bare `{{ var }}` placeholders.

---

## Install `tts_say.py` (custom messages via Cloud TTS)

`doorbell_say_custom` runs `python3 /config/tts_say.py`. The script runs inside
HA core (which has `python3`), reads `input_text.doorbell_custom_message` and
`input_select.doorbell_language`, calls Home Assistant Cloud TTS
(`tts.home_assistant_cloud`) with the matching locale
(`en-GB` / `nl-NL` / `de-DE` / `fr-FR` / `es-ES`), and writes the resulting
mp3 into `/config/addons/talk_queue/` for the add-on to play.

**1. Drop the script:**

```text
addon/tts_say.py  →  /config/tts_say.py
```

**2. Create a long-lived access token** in Home Assistant (profile → Security →
Long-lived access tokens) and save it to `/config/.ha_token`, then lock it down:

```bash
# on the HA host
printf '%s' '<your-long-lived-token>' > /config/.ha_token
chmod 600 /config/.ha_token
```

The script reads the token from `/config/.ha_token` and talks to
`http://localhost:8123`. If the custom message is empty it exits quietly
(exit 0) without queuing anything.

**Requirements:** Home Assistant Cloud (Nabu Casa) for the default engine
`tts.home_assistant_cloud`. To use a different engine, either set the `TTS_ENGINE`
env var **or** change the default in `/config/tts_say.py`. The add-on must be
installed so the `/config/addons/talk_queue/` folder exists and is watched.

---

## Generate the quick-reply phrases

The quick replies (`doorbell_say_brb`, etc.) play **pre-rendered WAV files** from
`/config/sounds/doorbell/<lang>/<key>.wav`. Generate them once with
`scripts/generate-phrases.sh`, which renders every phrase in `phrases.json`
(5 phrases × 5 languages) through Cloud TTS.

Phrase keys must match the script names: `brb`, `porch`, `help`, `moment`,
`no_thanks`.

```bash
HA_URL=http://homeassistant.local:8123 \
HA_TOKEN=<long-lived-token> \
HA_SSH="root@homeassistant.local" \
./scripts/generate-phrases.sh
```

- Needs only `bash`, `curl` and `jq` (cross-platform — no macOS `say`).
- `HA_SSH` is **optional**. If set, the rendered files are `scp`'d straight into
  `/config/sounds/doorbell/` on the HA host. If unset, files land in
  `scripts/out/` for you to copy across manually.
- Override the engine with `TTS_ENGINE` if you are not on Nabu Casa.

> **Phrase files must be named `.wav`.** Not because the talk-daemon can't play
> mp3 — it globs `*.mp3` and plays it directly — but because the
> `doorbell_say_file` shell command copies `<key>.wav` by name. So whatever your
> renderer emits, the files under `/config/sounds/doorbell/<lang>/` must end in
> `.wav` (re-encode, or adjust the command's extension to match). The custom
> message path is different: `tts_say.py` queues an `.mp3` on purpose, and the
> daemon plays it straight from the queue.

---

## Files in this directory

```text
homeassistant/
├── packages/doorbell_talk.yaml   # the package (copy to <config>/packages/)
├── phrases.json                  # 5 phrases × 5 languages, source for the renderer
└── sounds/                       # generated phrase output (gitignored)
```

Related files elsewhere in the repo:

- `addon/tts_say.py` — install at `/config/tts_say.py` (needs `/config/.ha_token`).
- `scripts/generate-phrases.sh` — renders `phrases.json` into `/config/sounds/doorbell/`.

---

## Quick checklist

- [ ] `doorbell_talk.yaml` copied to `<config>/packages/`
- [ ] `packages: !include_dir_named packages` enabled in `configuration.yaml`
- [ ] **Full restart** of Home Assistant
- [ ] `tts_say.py` at `/config/tts_say.py`
- [ ] `/config/.ha_token` created and `chmod 600`
- [ ] `generate-phrases.sh` run; WAVs present in `/config/sounds/doorbell/<lang>/`
- [ ] Add-on installed so `/config/addons/talk_queue/` exists

MIT © David Shaw ([ds2000](https://github.com/ds2000))
