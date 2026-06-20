/* Doorbell Card — self-contained Lovelace card for the front-door intercom.
   Renders camera, status, hold-to-talk, quick replies, custom TTS and language
   settings in one shadow-DOM element. Calls existing HA services/scripts. */
(function () {
  // ZERO runtime deps (per fe-tesla conventions): no CDN fonts — refined system stacks.
  const SERIF = "'Iowan Old Style','Palatino Linotype','Palatino','Georgia',serif";
  const SANS = "system-ui,-apple-system,'Segoe UI','Helvetica Neue',sans-serif";

  // Languages drive the selector (shown in native names) and map each option to a
  // phrase code + TTS locale. The `value` must match an option in your HA
  // input_select.doorbell_language. Reorder / translate / extend freely.
  const LANGUAGES = [
    { value: "English", label: "English",    code: "en", locale: "en-GB" },
    { value: "Dutch",   label: "Nederlands", code: "nl", locale: "nl-NL" },
    { value: "German",  label: "Deutsch",    code: "de", locale: "de-DE" },
    { value: "French",  label: "Français",   code: "fr", locale: "fr-FR" },
    { value: "Spanish", label: "Español",    code: "es", locale: "es-ES" },
  ];

  // Quick replies. A reply with `phrases` is spoken via Cloud TTS in the selected
  // language (edit the text to customise — no audio files needed). A reply with
  // `service` calls that service instead (e.g. the siren, or a pre-baked
  // script.doorbell_say_* if you prefer instant playback). Override `replies`
  // wholesale in the card config to define your own.
  const REPLIES = [
    { name: "Be right there", icon: "M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M11,7V12.41L15.29,16.71L16.71,15.29L13,11.59V7H11Z",
      phrases: { en: "I'll be right there.", nl: "Ik kom er zo aan.", de: "Ich komme sofort.", fr: "J'arrive tout de suite.", es: "Ahora mismo voy." } },
    { name: "Garden house", icon: "M12,3L2,12H5V20H19V12H22L12,3M12,7.7C14.1,7.7 15.8,9.4 15.8,11.5C15.8,14.5 12,18 12,18C12,18 8.2,14.5 8.2,11.5C8.2,9.4 9.9,7.7 12,7.7Z",
      phrases: { en: "Leave it in the garden house please.", nl: "Zet het alstublieft in het tuinhuis.", de: "Stellen Sie es bitte ins Gartenhaus.", fr: "Laissez-le dans l'abri de jardin, s'il vous plaît.", es: "Déjelo en la caseta del jardín, por favor." } },
    { name: "Can I help", icon: "M9,22A1,1 0 0,1 8,21V18H4A2,2 0 0,1 2,16V4C2,2.89 2.9,2 4,2H20A2,2 0 0,1 22,4V16A2,2 0 0,1 20,18H13.9L10.2,21.71C10,21.9 9.75,22 9.5,22V22H9M12.19,5.5C11.3,5.5 10.59,5.68 10.05,6.04C9.5,6.4 9.22,7 9.27,7.69H11.24C11.24,7.41 11.34,7.2 11.5,7.06C11.7,6.92 11.92,6.85 12.19,6.85C12.5,6.85 12.77,6.93 12.95,7.11C13.13,7.28 13.22,7.5 13.22,7.8C13.22,8.08 13.14,8.33 13,8.54C12.83,8.76 12.62,8.94 12.36,9.08C11.84,9.4 11.5,9.68 11.31,9.92C11.11,10.16 11,10.5 11,11H13C13,10.72 13.05,10.5 13.16,10.33C13.27,10.16 13.5,9.97 13.81,9.77C14.34,9.5 14.76,9.17 15.07,8.78C15.38,8.39 15.53,7.97 15.53,7.5C15.53,6.83 15.22,6.4 14.6,5.95C14,5.65 13.18,5.5 12.19,5.5M11,12V14H13V12H11Z",
      phrases: { en: "Hello, can I help you?", nl: "Hallo, kan ik u helpen?", de: "Hallo, kann ich Ihnen helfen?", fr: "Bonjour, puis-je vous aider ?", es: "Hola, ¿puedo ayudarle?" } },
    { name: "One moment", icon: "M6,2V8H6V8L10,12L6,16V16H6V22H18V16H18V16L14,12L18,8V8H18V2H6M16,16.5V20H8V16.5L12,12.5L16,16.5M12,11.5L8,7.5V4H16V7.5L12,11.5Z",
      phrases: { en: "One moment please.", nl: "Een moment alstublieft.", de: "Einen Moment bitte.", fr: "Un instant, s'il vous plaît.", es: "Un momento, por favor." } },
    { name: "No thanks", icon: "M12,2C17.53,2 22,6.47 22,12C22,17.53 17.53,22 12,22C6.47,22 2,17.53 2,12C2,6.47 6.47,2 12,2M15.59,7L12,10.59L8.41,7L7,8.41L10.59,12L7,15.59L8.41,17L12,13.41L15.59,17L17,15.59L13.41,12L17,8.41L15.59,7Z",
      phrases: { en: "No thank you, we're not interested.", nl: "Nee bedankt, wij hebben geen interesse.", de: "Nein danke, wir haben kein Interesse.", fr: "Non merci, nous ne sommes pas intéressés.", es: "No, gracias, no estamos interesados." } },
  ];

  // Fallback icon for replies added in the editor without one (a chat bubble).
  const DEF_ICON = "M12,3C6.5,3 2,6.58 2,11C2,12.96 2.83,14.74 4.21,16.07C3.71,17.13 2.84,17.94 1.86,18.27C2.97,18.5 4.16,18.5 5.21,18C6.34,18.71 7.95,19 12,19C17.5,19 22,15.42 22,11C22,6.58 17.5,3 12,3Z";

  const DEF = {
    camera: "camera.reolink_video_doorbell_fluent",
    battery: "sensor.reolink_video_doorbell_battery",
    visitor: "binary_sensor.reolink_video_doorbell_visitor",
    sleep: "binary_sensor.reolink_video_doorbell_sleep_status",
    snooze: "input_boolean.doorbell_snooze",
    language: "input_select.doorbell_language",
    message: "input_text.doorbell_custom_message",
    siren: "siren.reolink_video_doorbell_siren",
    languages: LANGUAGES,
    replies: REPLIES,
  };

  class DoorbellCard extends HTMLElement {
    setConfig(c) { this._cfg = Object.assign({}, DEF, c || {}); }
    getCardSize() { return 12; }

    set hass(hass) {
      this._hass = hass;
      if (!this._root) this._render();
      this._update();
    }

    connectedCallback() {
      this._timer = setInterval(() => this._refreshCam(), 2500);
    }
    disconnectedCallback() {
      if (this._timer) clearInterval(this._timer);
    }

    _svc(domain, service, data) {
      if (this._hass) this._hass.callService(domain, service, data || {});
    }
    _state(id) { return this._hass && this._hass.states[id]; }

    // The active language: card config `default_language` wins, else the
    // input_select state, else the first configured language.
    _activeLang() {
      const langs = this._cfg.languages || [];
      const pref = this._cfg.default_language;
      if (pref) { const l = langs.find((x) => x.value === pref); if (l) return l; }
      const cur = this._state(this._cfg.language);
      return langs.find((l) => l.value === (cur && cur.state)) || langs[0] || { value: "English", code: "en" };
    }

    // Speak arbitrary text in the active language. Forces input_select to the
    // active language FIRST so the TTS locale can't drift, then sets the message
    // and triggers the Cloud-TTS script (tts_say.py reads both).
    _speak(text) {
      if (!text) return;
      const lang = this._activeLang();
      this._svc("input_select", "select_option", { entity_id: this._cfg.language, option: lang.value });
      this._svc("input_text", "set_value", { entity_id: this._cfg.message, value: text });
      setTimeout(() => this._svc("script", "doorbell_say_custom"), 450);
    }

    // Run a quick reply: a service-based reply calls its service; a phrase-based
    // reply is spoken via Cloud TTS in the active language.
    _reply(b) {
      if (!b) return;
      if (b.service) {
        const [d, s] = b.service.split(".");
        this._svc(d, s, b.target ? { entity_id: b.target } : {});
        return;
      }
      const lang = this._activeLang();
      this._speak((b.phrases && (b.phrases[lang.code] || b.phrases.en)) || b.name || "");
    }

    _render() {
      const r = this.attachShadow({ mode: "open" });
      this._root = r;
      const c = this._cfg;
      const hasReplies = Array.isArray(c.replies) && c.replies.length;
      const replyHtml = hasReplies
        ? c.replies.map((b, i) => `
        <button class="reply" data-i="${i}">
          <svg viewBox="0 0 24 24"><path d="${b.icon || DEF_ICON}"/></svg>
          <span>${b.name}</span>
        </button>`).join("")
        : `<div class="qempty">No quick replies yet — add them in the card settings (edit dashboard → this card).</div>`;

      r.innerHTML = `
      <style>
        :host{ --bg:#EAE3D6; --card:#F6F0E5; --bd:#E7DDCB; --tx:#322E27; --sec:#8C8473;
               --green:#6E8B72; --green-soft:rgba(110,139,114,.10); --green-ring:rgba(110,139,114,.16);
               --clay:#B0764F; display:block; }
        :host(.dark){ --bg:#20231F; --card:#282C26; --bd:#363B33; --tx:#ECE6DA; --sec:#9A9384;
               --green:#8AA88E; --green-soft:rgba(138,168,142,.12); --green-ring:rgba(138,168,142,.18); --clay:#C28E63; }
        *{box-sizing:border-box;margin:0;padding:0;font-family:${SANS}}
        .wrap{max-width:480px;margin:0 auto;padding:6px 14px 26px;color:var(--tx)}
        .title{font-family:${SERIF};font-weight:600;font-size:27px;letter-spacing:-.01em;padding:8px 2px 1px}
        .sub{color:var(--sec);font-size:14px;padding:0 2px 14px}
        .cam{position:relative;height:230px;border-radius:20px;overflow:hidden;background:#2c302a;box-shadow:0 8px 26px rgba(40,36,29,.16);cursor:pointer}
        .cam img{width:100%;height:100%;object-fit:cover;display:block}
        .cam .pill{position:absolute;top:12px;left:12px;display:flex;align-items:center;gap:6px;background:rgba(20,18,15,.42);backdrop-filter:blur(4px);color:#fff;font-size:11px;font-weight:600;letter-spacing:.08em;padding:5px 10px;border-radius:9px}
        .cam .dot{width:7px;height:7px;border-radius:50%;background:#e06b6b;box-shadow:0 0 0 0 rgba(224,107,107,.6);animation:liv 1.8s infinite}
        @keyframes liv{0%{box-shadow:0 0 0 0 rgba(224,107,107,.55)}70%{box-shadow:0 0 0 7px rgba(224,107,107,0)}100%{box-shadow:0 0 0 0 rgba(224,107,107,0)}}
        .status{display:flex;gap:18px;justify-content:center;padding:13px 0 4px;color:var(--sec);font-size:13px}
        .status .s{display:flex;align-items:center;gap:6px}
        .status svg{width:17px;height:17px;fill:var(--green)}
        .status .s.warn svg{fill:var(--clay)}
        .actions{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-top:16px}
        .act{height:60px;border:1px solid var(--bd);border-radius:15px;background:var(--green-soft);display:flex;align-items:center;justify-content:center;gap:9px;cursor:pointer;color:var(--tx);font-weight:600;font-size:15px;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;transition:background .15s,border-color .15s}
        .act:active{background:var(--green-ring)}
        .act>svg{width:20px;height:20px;fill:var(--green)}
        .act .chev{width:14px;height:14px;fill:var(--sec);transition:transform .2s}
        .act.open .chev{transform:rotate(180deg)}
        .act .mic{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--green-ring);transition:all .2s}
        .act .mic svg{width:17px;height:17px;fill:var(--green)}
        .act.talk.rec{background:rgba(176,118,79,.14);border-color:rgba(176,118,79,.4)}
        .act.talk.rec .mic{background:rgba(176,118,79,.25);animation:pul 1.4s infinite}
        .act.talk.rec .mic svg{fill:var(--clay)}
        @keyframes pul{0%{box-shadow:0 0 0 0 rgba(176,118,79,.45)}70%{box-shadow:0 0 0 13px rgba(176,118,79,0)}100%{box-shadow:0 0 0 0 rgba(176,118,79,0)}}
        .thint{text-align:center;color:var(--sec);font-size:12px;min-height:15px;padding-top:8px}
        .qrpanel{overflow:hidden;max-height:0;transition:max-height .26s ease}
        .qrpanel.open{max-height:540px;margin-top:11px}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}
        .reply{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:16px 8px;display:flex;flex-direction:column;align-items:center;gap:9px;cursor:pointer;color:var(--tx);transition:transform .08s,background .15s}
        .reply:active{transform:scale(.97);background:var(--green-soft)}
        .reply svg{width:26px;height:26px;fill:none;stroke:var(--green);stroke-width:1.4}
        .reply span{font-weight:500;font-size:15px;text-align:center}
        .qempty{grid-column:1/-1;text-align:center;color:var(--sec);font-size:13px;padding:14px 10px;line-height:1.5}
        .lbl{text-transform:uppercase;letter-spacing:.17em;font-size:11px;font-weight:600;color:var(--sec);padding:22px 2px 11px}
        .msg{display:flex;gap:9px;align-items:stretch}
        .msg input{flex:1;background:var(--green-soft);border:1px solid var(--bd);border-radius:14px;padding:0 15px;color:var(--tx);font-size:15px;outline:none}
        .msg input::placeholder{color:var(--sec)}
        .msg .send{width:54px;border:1px solid var(--bd);border-radius:14px;background:var(--card);display:flex;align-items:center;justify-content:center;cursor:pointer}
        .msg .send svg{width:23px;height:23px;fill:var(--green)}
        .msg .send:active{background:var(--green-soft)}
        .siren{width:100%;height:52px;margin-top:16px;border:1px solid var(--bd);border-radius:15px;background:var(--card);display:flex;align-items:center;justify-content:center;gap:9px;cursor:pointer;color:var(--tx);font-weight:600;font-size:15px;transition:background .15s}
        .siren svg{width:20px;height:20px;fill:var(--clay)}
        .siren:active{background:rgba(176,118,79,.12)}
      </style>
      <div class="wrap">
        <div class="title">Front Door</div>
        <div class="sub">Speak to whoever is at the door</div>
        <div class="cam" id="cam"><img id="camimg" alt=""/>
          <div class="pill"><span class="dot"></span>LIVE</div></div>
        <div class="status" id="status"></div>
        <div class="actions">
          <button class="act" id="qrBtn">
            <svg viewBox="0 0 24 24"><path d="M9,22A1,1 0 0,1 8,21V18H4A2,2 0 0,1 2,16V4C2,2.89 2.9,2 4,2H20A2,2 0 0,1 22,4V16A2,2 0 0,1 20,18H13.9L10.2,21.71C10,21.9 9.75,22 9.5,22H9Z"/></svg>
            <span>Quick reply</span>
            <svg class="chev" viewBox="0 0 24 24"><path d="M7,10L12,15L17,10H7Z"/></svg>
          </button>
          <button class="act talk" id="talk">
            <span class="mic"><svg viewBox="0 0 24 24"><path d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"/></svg></span>
            <span>Hold to talk</span>
          </button>
        </div>
        <div class="thint" id="talkstatus">Hold the talk button and speak — your voice plays at the door</div>
        <div class="qrpanel" id="qrPanel"><div class="grid" id="replies">${replyHtml}</div></div>
        <div class="lbl">Custom message</div>
        <div class="msg">
          <input id="msg" type="text" placeholder="Type a message…"/>
          <div class="send" id="send"><svg viewBox="0 0 24 24"><path d="M2,21L23,12L2,3V10L17,12L2,14V21Z"/></svg></div>
        </div>
        <button class="siren" id="siren">
          <svg viewBox="0 0 24 24"><path d="M12,2A7,7 0 0,1 19,9V16L21,18V19H3V18L5,16V9A7,7 0 0,1 12,2M12,4A5,5 0 0,0 7,9V17H17V9A5,5 0 0,0 12,4M14,21A2,2 0 0,1 12,23A2,2 0 0,1 10,21H14Z"/></svg>
          <span>Sound siren</span>
        </button>
      </div>`;

      // ----- interactions -----
      r.getElementById("cam").addEventListener("click", () => {
        const ev = new Event("hass-more-info", { bubbles: true, composed: true });
        ev.detail = { entityId: this._cfg.camera };
        this.dispatchEvent(ev);
      });
      const qrBtn = r.getElementById("qrBtn"), qrPanel = r.getElementById("qrPanel");
      qrBtn.addEventListener("click", () => { qrBtn.classList.toggle("open"); qrPanel.classList.toggle("open"); });
      qrPanel.querySelectorAll(".reply").forEach((el) => {
        el.addEventListener("click", () => {
          this._reply(this._cfg.replies[+el.dataset.i]);
          qrBtn.classList.remove("open"); qrPanel.classList.remove("open");
        });
      });
      r.getElementById("siren").addEventListener("click", () => this._svc("siren", "toggle", { entity_id: this._cfg.siren }));
      const msg = r.getElementById("msg");
      r.getElementById("send").addEventListener("click", () => {
        const v = msg.value.trim(); if (!v) return;
        this._speak(v);
      });
      this._initTalk(r.getElementById("talk"), r.getElementById("talkstatus"));
      this._refreshCam();
    }

    _initTalk(btn, status) {
      let mr, chunks = [], mime;
      const pick = () => { for (const m of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"]) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m; return ""; };
      // getUserMedia only works in a secure context (HTTPS, or localhost).
      const micOk = window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
      if (!micOk) status.textContent = "Talk needs a secure connection — open Home Assistant over HTTPS (your Nabu Casa URL).";
      const start = async (e) => {
        e.preventDefault(); if (mr && mr.state === "recording") return;
        if (!micOk) { status.textContent = "Talk needs HTTPS. Open HA via your Nabu Casa (remote) URL, then allow the microphone."; return; }
        try {
          const st = await navigator.mediaDevices.getUserMedia({ audio: true });
          mime = pick(); chunks = []; mr = new MediaRecorder(st, mime ? { mimeType: mime } : undefined);
          mr.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
          mr.onstop = () => { st.getTracks().forEach((t) => t.stop()); this._send(new Blob(chunks, { type: mime || "audio/webm" }), status); };
          mr.start(); btn.classList.add("rec"); status.textContent = "Listening… release to send";
        } catch (err) {
          status.textContent = err && err.name === "NotAllowedError"
            ? "Microphone permission denied — allow mic access for Home Assistant in your device settings."
            : "Microphone unavailable: " + ((err && err.message) || err);
        }
      };
      const stop = (e) => { if (e) e.preventDefault(); if (mr && mr.state !== "inactive") { mr.stop(); btn.classList.remove("rec"); status.textContent = "Sending…"; } };
      btn.addEventListener("pointerdown", start);
      btn.addEventListener("pointerup", stop);
      btn.addEventListener("pointerleave", stop);
      btn.addEventListener("pointercancel", stop);
    }

    async _send(blob, status) {
      try {
        const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
        const fn = "rec_" + Date.now() + "." + ext;
        const fd = new FormData();
        fd.append("media_content_id", "media-source://media_source/local/doorbell");
        fd.append("file", new File([blob], fn, { type: blob.type }));
        const res = await fetch("/api/media_source/local_source/upload", { method: "POST", headers: { Authorization: "Bearer " + this._hass.auth.data.access_token }, body: fd });
        if (!res.ok) throw new Error("upload " + res.status);
        const j = await res.json(); const id = (j.media_content_id || "").split("/").pop() || fn;
        await this._hass.callService("shell_command", "doorbell_play_upload", { fn: id });
        status.textContent = "Sent — plays at the door shortly";
      } catch (err) { status.textContent = "Send failed: " + err.message; }
    }

    _refreshCam() {
      const cam = this._state(this._cfg.camera);
      const img = this._root && this._root.getElementById("camimg");
      if (cam && cam.attributes.entity_picture && img) {
        img.src = cam.attributes.entity_picture + "&_=" + Date.now();
      }
    }

    _update() {
      if (!this._root) return;
      // Follow Home Assistant's own light/dark (not the OS), unless pinned via config.theme.
      const dark = this._cfg.theme === "dark" ||
        (this._cfg.theme !== "light" && this._hass && this._hass.themes && this._hass.themes.darkMode);
      this.classList.toggle("dark", !!dark);
      const r = this._root, c = this._cfg, ic = (p) => `<svg viewBox="0 0 24 24"><path d="${p}"/></svg>`;
      const bat = this._state(c.battery), vis = this._state(c.visitor), slp = this._state(c.sleep), snz = this._state(c.snooze);
      const items = [];
      if (bat) items.push(`<div class="s">${ic("M16,20H8V6H16M16.67,4H15V2H9V4H7.33A1.33,1.33 0 0,0 6,5.33V20.67C6,21.4 6.6,22 7.33,22H16.67A1.33,1.33 0 0,0 18,20.67V5.33C18,4.6 17.4,4 16.67,4Z")}<span>${bat.state}%</span></div>`);
      if (vis) items.push(`<div class="s${vis.state === "on" ? " warn" : ""}">${ic("M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z")}<span>${vis.state === "on" ? "At door" : "Clear"}</span></div>`);
      if (slp) items.push(`<div class="s">${ic("M18.73,18C15.4,21.69 9.71,22 6,18.64C2.33,15.31 2.04,9.62 5.37,5.93C6.9,4.25 9,3.2 11.27,3C7.96,6.7 8.27,12.39 11.96,15.71C13.5,17.11 15.5,17.92 17.61,18C18,18 18.36,18 18.73,18Z")}<span>${slp.state === "on" ? "Asleep" : "Awake"}</span></div>`);
      r.getElementById("status").innerHTML = items.join("");

      // Active language is chosen in the card config/editor (default_language),
      // not on the card face. Keep the HA input_select in sync so the spoken
      // TTS locale matches.
      const dl = c.default_language, li = this._state(c.language);
      if (dl && li && li.state !== dl && (li.attributes.options || []).includes(dl)) {
        this._svc("input_select", "select_option", { entity_id: c.language, option: dl });
      }
      const m = this._state(c.message), inp = r.getElementById("msg");
      if (m && inp && document.activeElement !== inp && inp.value !== m.state && m.state) inp.value = m.state;
    }
  }

  // ── Visual editor — map custom entity names from the dashboard UI ──────────
  const FIELDS = [
    ["camera", "Camera entity"], ["battery", "Battery sensor"], ["visitor", "Visitor sensor"],
    ["sleep", "Sleep sensor"], ["snooze", "Snooze toggle"], ["language", "Language input_select"],
    ["message", "Custom message input_text"], ["siren", "Siren entity"],
  ];

  const esc = (s) => (s || "").replace(/"/g, "&quot;");

  class DoorbellCardEditor extends HTMLElement {
    setConfig(cfg) {
      this._cfg = Object.assign({}, cfg);
      // Build ONCE. Do NOT re-render on echoed config updates — rebuilding the
      // reply inputs on every keystroke is what stole focus on mobile. After the
      // initial build the editor is the source of truth; add/remove and language
      // changes re-render explicitly.
      if (!this._built) {
        this._replies = JSON.parse(JSON.stringify(this._cfg.replies || REPLIES));
        this._build();
      }
    }
    set hass(h) { this._hass = h; }

    // Phrase code for the currently-chosen default language (spoken-text column).
    _code() { const l = LANGUAGES.find((x) => x.value === this._cfg.default_language); return (l && l.code) || "en"; }

    _build() {
      this._built = true;
      this.innerHTML = `
        <style>
          .ed{display:flex;flex-direction:column;gap:12px;padding:8px 2px}
          .row{display:flex;flex-direction:column;gap:4px}
          .ed label{font-size:12px;font-weight:600;color:var(--secondary-text-color)}
          .ed input,.ed select{width:100%;padding:9px 11px;border-radius:8px;font:inherit;
            border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color)}
          .hint{font-size:12px;color:var(--secondary-text-color);padding:2px}
          .sec{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--secondary-text-color);padding-top:10px}
          .rep{display:flex;gap:8px;align-items:center;margin-bottom:8px}
          .rep input{width:auto}
          .rep .rname{flex:0 0 36%}
          .rep .rsay{flex:1}
          .rep .del{flex:0 0 36px;height:38px;border:1px solid var(--divider-color);border-radius:8px;background:transparent;color:var(--secondary-text-color);cursor:pointer}
          .add{align-self:flex-start;padding:9px 14px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);cursor:pointer;font:inherit}
        </style>
        <div class="ed">
          ${FIELDS.map(([k, lbl]) => `<div class="row"><label>${lbl}</label><input data-k="${k}" type="text" spellcheck="false"></div>`).join("")}
          <div class="row"><label>Default language</label><select data-k="default_language">
            <option value="">Use input_select default</option>
            ${LANGUAGES.map((l) => `<option value="${l.value}">${l.label}</option>`).join("")}
          </select></div>
          <div class="row"><label>Theme</label><select data-k="theme">
            <option value="auto">Auto (follow Home Assistant)</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select></div>
          <div class="sec">Quick replies</div>
          <div class="hint" id="rephint"></div>
          <div id="reps"></div>
          <button class="add" id="addrep" type="button">+ Add reply</button>
        </div>`;
      this.querySelectorAll("input[data-k],select[data-k]").forEach((el) => {
        const h = () => { this._emit(); if (el.dataset.k === "default_language") this._renderReplies(); };
        el.addEventListener("input", h);
        el.addEventListener("change", h);
      });
      this.querySelector("#addrep").addEventListener("click", () => {
        this._replies.push({ name: "New reply", phrases: { [this._code()]: "" } });
        this._renderReplies(); this._emitReplies();
      });
      this._fill();
      this._renderReplies();
    }
    _fill() {
      this.querySelectorAll("input[data-k],select[data-k]").forEach((el) => {
        const k = el.dataset.k;
        if (k === "theme") el.value = this._cfg.theme || "auto";
        else el.value = this._cfg[k] !== undefined ? this._cfg[k] : (DEF[k] || "");
      });
    }
    _renderReplies() {
      const code = this._code();
      const label = (LANGUAGES.find((l) => l.code === code) || { label: "English" }).label;
      const hint = this.querySelector("#rephint");
      if (hint) hint.textContent = `Label is the button text; spoken text is read aloud (${label}). Other languages are kept — edit them in YAML.`;
      const wrap = this.querySelector("#reps");
      wrap.innerHTML = this._replies.map((b, i) => `
        <div class="rep">
          <input class="rname" data-i="${i}" placeholder="Label" value="${esc(b.name)}">
          <input class="rsay" data-i="${i}" placeholder="What is spoken" value="${esc(b.phrases && b.phrases[code])}">
          <button class="del" data-i="${i}" type="button" title="Remove">✕</button>
        </div>`).join("");
      wrap.querySelectorAll(".rname").forEach((el) => el.addEventListener("input", () => { this._replies[+el.dataset.i].name = el.value; this._emitReplies(); }));
      wrap.querySelectorAll(".rsay").forEach((el) => el.addEventListener("input", () => {
        const b = this._replies[+el.dataset.i]; b.phrases = b.phrases || {}; b.phrases[code] = el.value; delete b.service; delete b.target;
        this._emitReplies();
      }));
      wrap.querySelectorAll(".del").forEach((el) => el.addEventListener("click", () => { this._replies.splice(+el.dataset.i, 1); this._renderReplies(); this._emitReplies(); }));
    }
    _emit() {
      const cfg = Object.assign({}, this._cfg);
      this.querySelectorAll("input[data-k],select[data-k]").forEach((el) => {
        const k = el.dataset.k, v = (el.value || "").trim();
        if (k === "theme") { if (v && v !== "auto") cfg.theme = v; else delete cfg.theme; }
        else if (v) cfg[k] = v; else delete cfg[k];
      });
      this._cfg = cfg; this._fire();
    }
    _emitReplies() { this._cfg = Object.assign({}, this._cfg, { replies: this._replies }); this._fire(); }
    _fire() { this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._cfg }, bubbles: true, composed: true })); }
  }
  customElements.define("doorbell-card-editor", DoorbellCardEditor);

  DoorbellCard.getConfigElement = () => document.createElement("doorbell-card-editor");
  DoorbellCard.getStubConfig = () => ({ type: "custom:doorbell-card" });

  customElements.define("doorbell-card", DoorbellCard);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: "doorbell-card", name: "Doorbell Card", description: "Front-door intercom: camera, talk, quick replies, TTS.", preview: true, documentationURL: "https://github.com/ds2000/homeassistant-fe-doorbell" });
})();
