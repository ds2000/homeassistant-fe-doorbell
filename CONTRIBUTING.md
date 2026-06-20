# Contributing

Thanks for helping improve **homeassistant-fe-doorbell** — the reusable Home
Assistant package that turns a Reolink video doorbell (behind a Reolink NVR/hub)
into a two-way intercom you drive from a Lovelace dashboard.

This guide covers the card. For the backend pieces (HA package, Neolink add-on,
Cloud TTS bridge, phrase generator) see [`docs/INSTALL.md`](docs/INSTALL.md) and
the inline comments in each component.

> Screenshots: _TODO_.

## Repo layout

```
doorbell-card.js              # root copy served by HACS (/local/doorbell-card.js)
dist/doorbell-card.js         # THE card — release artifact, syntax-checked in CI
src/doorbell-card.js          # working copy / source of truth for edits
hacs.json                     # HACS plugin manifest (filename: doorbell-card.js)
repository.json               # HA add-on repository manifest
package.json                  # version source of truth (must match the git tag)
CHANGELOG.md                  # Keep a Changelog format
LICENSE                       # MIT
.gitignore
addon/                        # Neolink talk add-on
  config.yaml                 #   slug neolink_doorbell, maps config:rw + media:rw
  Dockerfile                  #   multi-stage: builds patched Neolink, then runtime
  run.sh                      #   talk-daemon v4 — watches the queue, pads silence, talks
  tts_say.py                  #   installed to /config/tts_say.py — HA Cloud TTS bridge
  neolink.toml.example        #   template for /config/addons/neolink.toml
homeassistant/
  packages/doorbell_talk.yaml #   input_*, shell_command, quick-reply scripts
  phrases.json                #   5 phrases × 5 languages
  sounds/                     #   generated WAVs (gitignored)
scripts/generate-phrases.sh   # renders phrases.json to /config/sounds via HA Cloud TTS
docs/INSTALL.md               # end-to-end install order
.github/workflows/release.yml # tag-driven GitHub release
```

## The three copies of the card

`doorbell-card.js` lives in three places — **and they must stay byte-identical**:

| Path | Why it exists |
|---|---|
| `dist/doorbell-card.js` | The release artifact. CI syntax-checks it and attaches it to the GitHub release. This is "the file". |
| `doorbell-card.js` (repo root) | What HACS serves, per `hacs.json` (`"filename": "doorbell-card.js"`). |
| `src/doorbell-card.js` | The working/source copy you edit. |

When you change the card, sync all three before committing:

```bash
cp src/doorbell-card.js dist/doorbell-card.js
cp src/doorbell-card.js doorbell-card.js
```

## Editing the card

The card is **plain JavaScript with no build step** — what you write is what
ships. There is no bundler, no TypeScript, no transpile. Edit the file directly.

Hard rules (these are the whole point of the card; do not regress them):

- **Zero runtime dependencies.** No npm packages, no CDN imports, no Lit, no
  helpers fetched at runtime. The card is a single IIFE registering a
  `customElements.define("doorbell-card", …)` element.
- **No external fonts.** Use the system font stacks already defined at the top
  of the file (`SANS` / `SERIF`). Never add a Google Fonts `@import` or a
  `<link>` to a CDN.
- **Self-contained.** Everything (styles, markup, behaviour) lives inside the
  one file and renders into the element's **shadow DOM**.
- **Configurable.** Every entity and label is overridable via card config; ship
  sensible defaults (the `DEF` object) so a bare `type: custom:doorbell-card`
  still works.
- **Theme-aware.** Follow Home Assistant's light/dark mode automatically via
  `hass.themes.darkMode`; honour the `theme: auto | light | dark` config
  override. Don't hardcode a single colour scheme.

Quick syntax check (same check CI runs):

```bash
node --check dist/doorbell-card.js
```

## Testing against a live Home Assistant

There's no headless harness — the card talks to real HA services, so test it on
a running instance:

1. Copy your edited card into HA's web root:

   ```bash
   scp src/doorbell-card.js root@<ha-host>:/config/www/doorbell-card.js
   ```

   (Served at `/local/doorbell-card.js`.)

2. **Bump the resource cache-buster.** Browsers and HA cache the module
   aggressively, so bump the `?v=` query on the dashboard resource each time:

   *Settings → Dashboards → ⋮ → Resources →* edit the
   `/local/doorbell-card.js` entry and change `?v=1` to `?v=2`, etc. Then hard-
   reload the dashboard (and Ctrl/Cmd+Shift+R the companion app if you use it).

3. Exercise the card end to end: live camera refresh, status row (battery /
   visitor / asleep-awake), **hold-to-talk**, the quick-reply grid, the custom-
   message field + Speak it, and the language selector. Verify it renders
   correctly in **both** light and dark themes.

The card calls real services — `script.doorbell_say_*`, `siren.toggle`,
`input_select.select_option`, `input_text.set_value`,
`shell_command.doorbell_play_upload`, and a POST to
`/api/media_source/local_source/upload`. The HA package and add-on must be
installed for talk/replies to actually reach the door; see `docs/INSTALL.md`.

## Coding conventions

- **Plain JS, single file, IIFE.** No transpile step; match the existing style
  (small methods, template-literal markup, mdi SVG path strings for icons).
- **Self-contained + configurable + theme-following** — as above. Treat those
  three as acceptance criteria for any card change.
- Keep the system font stacks; don't introduce external assets of any kind.
- Comments only where intent is non-obvious; keep them short.
- This card is a sibling of the author's `homeassistant-fe-tesla` card and
  follows the same conventions — when in doubt, mirror that card's style.

For the backend YAML/Python, note the documented gotcha: HA `shell_command`
templates only support simple `{{ var }}` substitution. The language→folder
lookup must happen in the **script's** `data:`, not inline in the command — a
`{% set %}` inside a `shell_command` raises `UndefinedError`.

## Release process

Releases are tag-driven. `.github/workflows/release.yml` runs on any `v*` tag,
syntax-checks `dist/doorbell-card.js`, **verifies the tag matches
`package.json`'s `version`**, and publishes a GitHub release with the card
attached.

1. Land your change and sync all three card copies (see above).
2. Bump `version` in `package.json` (Semantic Versioning).
3. Update `CHANGELOG.md`: move items out of `[Unreleased]` into a new
   `## [X.Y.Z] - YYYY-MM-DD` section and update the compare/tag links at the
   bottom (Keep a Changelog format).
4. Commit, then tag and push — the tag **must** be `vX.Y.Z` and match
   `package.json` exactly, or the workflow fails the version check:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

5. CI creates the GitHub release. HACS picks it up from the tag and the root
   `doorbell-card.js`.

## License

By contributing you agree your contributions are licensed under the project's
[MIT License](LICENSE).
