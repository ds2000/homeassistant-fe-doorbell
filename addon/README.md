# Neolink Doorbell Talk add-on

A Home Assistant add-on that speaks audio to a **Reolink video doorbell behind a Reolink NVR/hub**. It runs a small **talk-daemon** that watches two queue folders and, for every audio file that lands there, opens a talk session and plays it out of the doorbell's speaker — then deletes the file.

This is the audio engine behind the [`homeassistant-fe-doorbell`](https://github.com/ds2000/homeassistant-fe-doorbell) package. The Lovelace card and the HA package drop files into the queue; this add-on turns them into sound at the door.

> Screenshots: TODO.

## Why this add-on exists

Reolink cameras behind an NVR speak only Reolink's proprietary **Baichuan** protocol — not RTSP/ONVIF — for two-way audio. Home Assistant's `reolink` integration therefore cannot do doorbell *talk*. The fix is [**Neolink**](https://github.com/QuantumEntangledAndy/neolink), an open-source Baichuan bridge.

One catch: the Reolink **Video Doorbell** advertises **two** `<audioStreamMode>` values in its `TalkAbility` response, and stock Neolink's parser rejects the duplicate field and reports *"camera does not support talk"*. This add-on bundles a **patched Neolink** that accepts multiple `audioStreamMode` entries (fix submitted upstream as [QuantumEntangledAndy/neolink#415](https://github.com/QuantumEntangledAndy/neolink/pull/415)).

Talk is relayed **through the NVR channel** over the control-plane Baichuan connection. For a battery doorbell, the NVR wakes the sleeping camera so it can play the clip.

## What it does

```
/config/addons/talk_queue   ─┐
                             ├─►  talk-daemon (run.sh)  ─►  neolink talk doorbell  ─Baichuan─►  NVR (mediaPort)  ─►  doorbell speaker
/media/doorbell             ─┘                                  -c neolink.toml
```

- Watches `/config/addons/talk_queue` and `/media/doorbell` for audio files (`.wav .mp3 .aiff .webm .ogg .m4a .aac`).
- For each file it **prepends ~3 s of silence** (see below), runs `neolink talk doorbell -c /config/addons/neolink.toml -f <file> -v 2.0` (the `-v 2.0` flag sets playback loudness — edit it in `run.sh`), then deletes the file.
- Loops once per second; files are processed oldest-first per folder.

### The silence pad (why it's required)

A Reolink talk session needs roughly **2 seconds** to wake the camera and open the speaker. Without padding, the start of a short clip is clipped — the doorbell misses the first word. So `run.sh` builds a padded file first using GStreamer:

```sh
gst-launch-1.0 ... audiotestsrc wave=silence ... ! concat ... ! wavenc ! filesink
```

`wave=silence` is **mandatory** — GStreamer's `audiotestsrc` default waveform is a *beep*, not silence, so omitting it would prepend a tone instead of dead air. If padding fails for any reason, the daemon falls back to playing the raw file.

### Exclusive backchannel (caveat)

The Reolink talk backchannel is **exclusive**. While this add-on is talking through the doorbell, the **Reolink mobile app cannot talk** through that same camera, and vice-versa. Quick clips finish fast, so this is rarely felt — but don't expect two talk sessions at once.

## Install

You need Home Assistant **OS** or **Supervised** (add-ons aren't available on Container/Core installs), an `aarch64` or `amd64` host, and the **Reolink integration** already configured (it supplies the camera entities and the NVR credentials you'll reuse below).

The add-on is **self-contained** — its talk-daemon (`run.sh`) is baked into the image. You do **not** copy any script to the host. The only file you create by hand is `/config/addons/neolink.toml` (below).

### Option A — add as an add-on repository (recommended)

1. In Home Assistant: **Settings → Add-ons → Add-on Store → ⋮ (top-right) → Repositories**.
2. Add: `https://github.com/ds2000/homeassistant-fe-doorbell`
3. Find **"Neolink Doorbell Talk"** in the store, click **Install**, then **Start**.

### Option B — build locally

Copy the `addon/` folder into a directory under your HA config's `addons/` share (e.g. `/addons/neolink_doorbell/`), then **Settings → Add-ons → Add-on Store → ⋮ → Check for updates** so the local add-on appears. Install and start it from there.

> **First build is heavy.** Stage 1 compiles patched Neolink from source (Rust + GStreamer). On low-spec or low-disk hosts where the on-device image build is too heavy, cross-compile the `neolink` binary on a beefier machine with [`scripts/build-neolink.sh`](../scripts/build-neolink.sh), then swap it into the build context (replace stage 1's build with `COPY neolink /usr/local/bin/neolink`) — see the note in the [Dockerfile](Dockerfile).

## Create `neolink.toml`

The add-on does **not** ship a Neolink config — you must create one. Copy [`neolink.toml.example`](neolink.toml.example) to **`/config/addons/neolink.toml`** and fill in your NVR details:

```toml
bind = "0.0.0.0"

[[cameras]]
name = "doorbell"               # must stay "doorbell" — run.sh calls `neolink talk doorbell`
username = "REOLINK_USERNAME"   # your Reolink account credentials (same as the HA reolink integration)
password = "REOLINK_PASSWORD"
address  = "192.168.1.100:9000" # NVR/hub IP : mediaPort (GetNetPort → mediaPort, usually 9000)
channel_id = 3                  # the doorbell's 0-based channel on the NVR
```

- **`address`** = your NVR/hub IP and its **media port** (Reolink's `GetNetPort` → `mediaPort`, usually `9000`).
- **`channel_id`** = the doorbell's channel on the NVR (0-based; check the Reolink app or the NVR's channel list).
- For a **standalone** doorbell (not behind an NVR), use the camera's own IP and omit `channel_id`, or use `uid` for a battery camera.

Drop the file over SSH/Samba, then **restart the add-on** so it's picked up.

## How it fits the rest of the project

This add-on is one of several pieces in `homeassistant-fe-doorbell`:

| Piece | Role | Talks to this add-on by… |
|---|---|---|
| **Lovelace card** (`custom:doorbell-card`) | UI: hold-to-talk, quick replies, custom message | triggers HA scripts / uploads that land in the queue |
| **HA package** (`packages/doorbell_talk.yaml`) | `shell_command`s + scripts that copy/move audio into `/config/addons/talk_queue` and `/media/doorbell` | **this folder is what the daemon watches** |
| **Cloud TTS** (`tts_say.py`, installed at `/config/tts_say.py`) | renders the custom message via HA Cloud TTS to an mp3 in the queue | drops a file in the queue |
| **This add-on** | plays every queued file out of the doorbell | — |

So the contract is simple: **anything that writes a supported audio file into `/config/addons/talk_queue` (or `/media/doorbell`) gets spoken at the door.** The card and package are the producers; this add-on is the consumer.

`tts_say.py` ships in this folder for convenience but runs in **HA core** (which has `python3`), not inside the add-on — it needs a long-lived token at `/config/.ha_token` (`chmod 600`) and, for the default engine (`tts.home_assistant_cloud`), Home Assistant Cloud (Nabu Casa). To use a different engine, either set the `TTS_ENGINE` env var **or** change the default in `/config/tts_say.py`.

For full end-to-end setup (card resource, package, phrases, dashboard), see the repo's [`docs/INSTALL.md`](../docs/INSTALL.md).

## Configuration reference

The add-on itself takes **no options** in its config schema. All behaviour comes from:

- `config.yaml` — slug `neolink_doorbell`; maps `config:rw` and `media:rw` so the daemon can read both queues and delete processed files.
- `/config/addons/neolink.toml` — your NVR connection (above).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Log says *"does not support talk"* | Running stock Neolink, not the patched build | Confirm the add-on built from this image (patch #415); rebuild if you swapped in a prebuilt binary. |
| First word of clips is cut off | Silence pad didn't apply | Check `/tmp/gst.err` in the add-on; ensure GStreamer is present and `wave=silence` is intact. |
| Nothing plays | Files never reach the queue, or wrong `channel_id` | Verify files land in `/config/addons/talk_queue`; confirm `address` (IP:mediaPort) and `channel_id`. |
| App can't talk while add-on runs | Exclusive backchannel | Expected — only one talk session per camera at a time. |
| Add-on won't connect | Bad credentials / unreachable NVR | Re-check Reolink username/password and that the NVR IP:mediaPort is reachable from HA. |

## License

MIT — see [`LICENSE`](../LICENSE). Author: David Shaw ([ds2000](https://github.com/ds2000)). Bundles a patched build of [Neolink](https://github.com/QuantumEntangledAndy/neolink) (also MIT).
