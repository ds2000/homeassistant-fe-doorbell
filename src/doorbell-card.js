/* Doorbell Card — self-contained Lovelace card for the front-door intercom.
   Camera (tap to listen, unmuted), status, hold-to-talk, quick replies, custom
   TTS, and a per-user settings gear (replies + language, stored per user so any
   household member can customise without admin rights). Zero runtime deps. */
(function () {
  const SERIF = "'Iowan Old Style','Palatino Linotype','Palatino','Georgia',serif";
  const SANS = "system-ui,-apple-system,'Segoe UI','Helvetica Neue',sans-serif";
  const esc = (s) => (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const UD_KEY = "doorbell_card";

  const LANGUAGES = [
    { value: "English", label: "English", code: "en", locale: "en-GB" },
    { value: "Dutch", label: "Nederlands", code: "nl", locale: "nl-NL" },
    { value: "German", label: "Deutsch", code: "de", locale: "de-DE" },
    { value: "French", label: "Français", code: "fr", locale: "fr-FR" },
    { value: "Spanish", label: "Español", code: "es", locale: "es-ES" },
  ];

  const REPLIES = [
    { name: "Be right there", phrases: { en: "I'll be right there.", nl: "Ik kom er zo aan.", de: "Ich komme sofort.", fr: "J'arrive tout de suite.", es: "Ahora mismo voy." } },
    { name: "One moment", phrases: { en: "One moment please.", nl: "Een moment alstublieft.", de: "Einen Moment bitte.", fr: "Un instant, s'il vous plaît.", es: "Un momento, por favor." } },
    { name: "Can I help", phrases: { en: "Hello, can I help you?", nl: "Hallo, kan ik u helpen?", de: "Hallo, kann ich Ihnen helfen?", fr: "Bonjour, puis-je vous aider ?", es: "Hola, ¿puedo ayudarle?" } },
    { name: "No thanks", phrases: { en: "No thank you, we're not interested.", nl: "Nee bedankt, wij hebben geen interesse.", de: "Nein danke, wir haben kein Interesse.", fr: "Non merci, nous ne sommes pas intéressés.", es: "No, gracias, no estamos interesados." } },
  ];

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
      const first = !this._hass;
      this._hass = hass;
      if (!this._root) this._render();
      this._update();
      if (first && hass.connection) this._loadUserData();
    }

    connectedCallback() { this._timer = setInterval(() => this._refreshCam(), 2500); }
    disconnectedCallback() { if (this._timer) clearInterval(this._timer); this._stopLive(); }

    _svc(d, s, data) { if (this._hass) this._hass.callService(d, s, data || {}); }
    _state(id) { return this._hass && this._hass.states[id]; }

    // ── per-user storage (works for non-admins; each user has their own) ──────
    async _loadUserData() {
      try {
        const r = await this._hass.connection.sendMessagePromise({ type: "frontend/get_user_data", key: UD_KEY });
        this._ud = (r && r.value) || {};
      } catch (e) { this._ud = {}; }
      this._paintReplies();
      this._paintSettings();
    }
    _saveUserData() {
      if (this._hass && this._hass.connection)
        this._hass.connection.sendMessagePromise({ type: "frontend/set_user_data", key: UD_KEY, value: this._ud || {} }).catch(() => {});
    }

    _activeReplies() {
      const u = this._ud && this._ud.replies;
      if (Array.isArray(u)) return u;
      return Array.isArray(this._cfg.replies) ? this._cfg.replies : REPLIES;
    }
    _activeLang() {
      const langs = this._cfg.languages || LANGUAGES;
      const pref = (this._ud && this._ud.language) || this._cfg.default_language || (this._state(this._cfg.language) || {}).state;
      return langs.find((l) => l.value === pref) || langs[0] || { value: "English", code: "en" };
    }

    // ── speak ─────────────────────────────────────────────────────────────────
    _speak(text) {
      if (!text) return;
      const lang = this._activeLang();
      this._svc("input_select", "select_option", { entity_id: this._cfg.language, option: lang.value });
      this._svc("input_text", "set_value", { entity_id: this._cfg.message, value: text });
      setTimeout(() => this._svc("script", "doorbell_say_custom"), 250);
    }
    _reply(b) {
      if (!b) return;
      if (b.service) { const [d, s] = b.service.split("."); this._svc(d, s, b.target ? { entity_id: b.target } : {}); return; }
      const lang = this._activeLang();
      this._speak((b.phrases && (b.phrases[lang.code] || b.phrases.en)) || b.name || "");
    }

    // ── live listen (unmuted) ──────────────────────────────────────────────────
    async _toggleLive() {
      if (this._live) { this._stopLive(); return; }
      try {
        const r = await this._hass.connection.sendMessagePromise({ type: "camera/stream", entity_id: this._cfg.camera, format: "hls" });
        const cam = this._root.getElementById("cam");
        let v = this._root.getElementById("camvid");
        if (!v) {
          v = document.createElement("video");
          v.id = "camvid"; v.autoplay = true; v.controls = false; v.playsInline = true;
          v.setAttribute("playsinline", ""); v.setAttribute("webkit-playsinline", "");
          v.style.cssText = "width:100%;height:100%;object-fit:cover;display:block";
          cam.insertBefore(v, cam.firstChild);
        }
        v.muted = false; v.volume = 1; v.src = r.url;
        await v.play().catch(() => {});
        this._root.getElementById("camimg").style.display = "none";
        this._live = true; this._setPill(true);
      } catch (e) { this._setPill(false, "no audio"); }
    }
    _stopLive() {
      if (!this._root) return;
      const v = this._root.getElementById("camvid");
      if (v) { try { v.pause(); v.removeAttribute("src"); v.load(); } catch (e) {} }
      const img = this._root.getElementById("camimg"); if (img) img.style.display = "";
      this._live = false; this._setPill(false);
    }
    _setPill(listening, msg) {
      const p = this._root && this._root.getElementById("pilltxt");
      if (p) p.textContent = msg ? msg : listening ? "LISTENING" : "LIVE";
      const d = this._root && this._root.getElementById("pilldot");
      if (d) d.style.background = listening ? "#6E8B72" : "#e06b6b";
    }

    _render() {
      const r = this.attachShadow({ mode: "open" });
      this._root = r;
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
        .cam .dot{width:7px;height:7px;border-radius:50%;background:#e06b6b}
        .cam .spk{position:absolute;bottom:12px;right:12px;width:34px;height:34px;border-radius:50%;background:rgba(20,18,15,.42);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center}
        .cam .spk svg{width:18px;height:18px;fill:#fff}
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
        .panel{overflow:hidden;max-height:0;transition:max-height .26s ease}
        .panel.open{max-height:1400px;margin-top:11px}
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
        .gear{width:100%;height:48px;margin-top:11px;border:1px solid transparent;border-radius:15px;background:transparent;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;color:var(--sec);font-weight:600;font-size:14px}
        .gear:active{background:var(--green-soft)}
        .gear svg{width:18px;height:18px;fill:var(--sec)}
        .gear .chev{width:13px;height:13px;transition:transform .2s}
        .gear.open .chev{transform:rotate(180deg)}
        .setbox{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:6px 14px 16px}
        .setsel{width:100%;padding:11px 13px;border-radius:11px;font:inherit;border:1px solid var(--bd);background:var(--green-soft);color:var(--tx)}
        .rep{display:flex;gap:8px;align-items:center;margin-bottom:9px}
        .rep input{padding:10px 12px;border-radius:10px;border:1px solid var(--bd);background:var(--green-soft);color:var(--tx);font:inherit;outline:none}
        .rep .rnm{flex:0 0 34%}
        .rep .rsy{flex:1}
        .rep .del{flex:0 0 38px;height:40px;border:1px solid var(--bd);border-radius:10px;background:transparent;color:var(--sec);cursor:pointer;font-size:16px}
        .add{margin-top:2px;padding:9px 15px;border:1px solid var(--bd);border-radius:10px;background:var(--green-soft);color:var(--tx);cursor:pointer;font:inherit;font-weight:600}
        .sethint{color:var(--sec);font-size:12px;padding-top:10px}
      </style>
      <div class="wrap">
        <div class="title">Front Door</div>
        <div class="sub">Tap the camera to listen · hold to talk back</div>
        <div class="cam" id="cam"><img id="camimg" alt=""/>
          <div class="pill"><span class="dot" id="pilldot"></span><span id="pilltxt">LIVE</span></div>
          <div class="spk"><svg viewBox="0 0 24 24"><path d="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z"/></svg></div>
        </div>
        <div class="status" id="status"></div>
        <div class="actions">
          <button class="act" id="qrBtn">
            <svg viewBox="0 0 24 24"><path d="M9,22A1,1 0 0,1 8,21V18H4A2,2 0 0,1 2,16V4C2,2.89 2.9,2 4,2H20A2,2 0 0,1 22,4V16A2,2 0 0,1 20,18H13.9L10.2,21.71C10,21.9 9.75,22 9.5,22H9Z"/></svg>
            <span>Quick reply</span><svg class="chev" viewBox="0 0 24 24"><path d="M7,10L12,15L17,10H7Z"/></svg>
          </button>
          <button class="act talk" id="talk">
            <span class="mic"><svg viewBox="0 0 24 24"><path d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"/></svg></span>
            <span>Hold to talk</span>
          </button>
        </div>
        <div class="thint" id="talkstatus">Hold the talk button and speak — your voice plays at the door</div>
        <div class="panel" id="qrPanel"><div class="grid" id="replies"></div></div>
        <div class="lbl">Custom message</div>
        <div class="msg">
          <input id="msg" type="text" placeholder="Type a message…"/>
          <div class="send" id="send"><svg viewBox="0 0 24 24"><path d="M2,21L23,12L2,3V10L17,12L2,14V21Z"/></svg></div>
        </div>
        <button class="siren" id="siren">
          <svg viewBox="0 0 24 24"><path d="M12,2A7,7 0 0,1 19,9V16L21,18V19H3V18L5,16V9A7,7 0 0,1 12,2M12,4A5,5 0 0,0 7,9V17H17V9A5,5 0 0,0 12,4M14,21A2,2 0 0,1 12,23A2,2 0 0,1 10,21H14Z"/></svg>
          <span>Sound siren</span>
        </button>
        <button class="gear" id="gearBtn">
          <svg viewBox="0 0 24 24"><path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z"/></svg>
          <span>Settings</span><svg class="chev" viewBox="0 0 24 24"><path d="M7,10L12,15L17,10H7Z"/></svg>
        </button>
        <div class="panel" id="setPanel"><div class="setbox">
          <div class="lbl">Language</div>
          <select class="setsel" id="setLang">${(this._cfg.languages || LANGUAGES).map((l) => `<option value="${esc(l.value)}">${esc(l.label)}</option>`).join("")}</select>
          <div class="lbl">Your quick replies</div>
          <div id="setReps"></div>
          <button class="add" id="setAdd" type="button">+ Add reply</button>
          <div class="sethint">Saved just for you — other users keep their own.</div>
        </div></div>
      </div>`;

      r.getElementById("cam").addEventListener("click", () => this._toggleLive());
      const qrBtn = r.getElementById("qrBtn"), qrPanel = r.getElementById("qrPanel");
      qrBtn.addEventListener("click", () => { qrBtn.classList.toggle("open"); qrPanel.classList.toggle("open"); });
      r.getElementById("siren").addEventListener("click", () => this._svc("siren", "toggle", { entity_id: this._cfg.siren }));
      const msg = r.getElementById("msg");
      r.getElementById("send").addEventListener("click", () => { const v = msg.value.trim(); if (v) { this._speak(v); msg.value = ""; } });
      const gearBtn = r.getElementById("gearBtn"), setPanel = r.getElementById("setPanel");
      gearBtn.addEventListener("click", () => { gearBtn.classList.toggle("open"); setPanel.classList.toggle("open"); this._paintSettings(); });
      const setLang = r.getElementById("setLang");
      setLang.addEventListener("change", () => {
        this._ud = this._ud || {}; this._ud.language = setLang.value; this._saveUserData();
        this._paintReplies(); this._paintSettings();
      });
      r.getElementById("setAdd").addEventListener("click", () => {
        const reps = this._ensureUserReplies(); reps.push({ name: "New reply", phrases: { [this._activeLang().code]: "" } });
        this._saveUserData(); this._paintSettings(); this._paintReplies();
      });
      this._initTalk(r.getElementById("talk"), r.getElementById("talkstatus"));
      this._paintReplies();
      this._refreshCam();
    }

    _paintReplies() {
      if (!this._root) return;
      const grid = this._root.getElementById("replies");
      const reps = this._activeReplies();
      grid.innerHTML = reps.length
        ? reps.map((b, i) => `<button class="reply" data-i="${i}"><svg viewBox="0 0 24 24"><path d="${b.icon || DEF_ICON}"/></svg><span>${esc(b.name)}</span></button>`).join("")
        : `<div class="qempty">No quick replies yet — add them with the Settings gear below.</div>`;
      grid.querySelectorAll(".reply").forEach((el) => el.addEventListener("click", () => {
        this._reply(this._activeReplies()[+el.dataset.i]);
        this._root.getElementById("qrBtn").classList.remove("open");
        this._root.getElementById("qrPanel").classList.remove("open");
      }));
    }

    _ensureUserReplies() {
      this._ud = this._ud || {};
      if (!Array.isArray(this._ud.replies)) this._ud.replies = JSON.parse(JSON.stringify(this._activeReplies()));
      return this._ud.replies;
    }

    _paintSettings() {
      if (!this._root) return;
      const setLang = this._root.getElementById("setLang");
      if (setLang) setLang.value = this._activeLang().value;
      const wrap = this._root.getElementById("setReps");
      if (!wrap) return;
      const code = this._activeLang().code;
      const reps = (this._ud && Array.isArray(this._ud.replies)) ? this._ud.replies : this._activeReplies();
      wrap.innerHTML = reps.map((b, i) => `
        <div class="rep">
          <input class="rnm" data-i="${i}" placeholder="Label" value="${esc(b.name)}">
          <input class="rsy" data-i="${i}" placeholder="What is spoken" value="${esc(b.phrases && b.phrases[code])}">
          <button class="del" data-i="${i}" type="button" title="Remove">✕</button>
        </div>`).join("");
      wrap.querySelectorAll(".rnm").forEach((el) => el.addEventListener("input", () => {
        const reps2 = this._ensureUserReplies(); reps2[+el.dataset.i].name = el.value; this._saveUserData(); this._paintReplies();
      }));
      wrap.querySelectorAll(".rsy").forEach((el) => el.addEventListener("input", () => {
        const reps2 = this._ensureUserReplies(); const b = reps2[+el.dataset.i];
        b.phrases = b.phrases || {}; b.phrases[code] = el.value; delete b.service; delete b.target;
        this._saveUserData(); this._paintReplies();
      }));
      wrap.querySelectorAll(".del").forEach((el) => el.addEventListener("click", () => {
        const reps2 = this._ensureUserReplies(); reps2.splice(+el.dataset.i, 1); this._saveUserData(); this._paintSettings(); this._paintReplies();
      }));
    }

    _initTalk(btn, status) {
      let mr, chunks = [], mime;
      const pick = () => { for (const m of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"]) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m; return ""; };
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
      if (this._live) return;
      const cam = this._state(this._cfg.camera);
      const img = this._root && this._root.getElementById("camimg");
      if (cam && cam.attributes.entity_picture && img) img.src = cam.attributes.entity_picture + "&_=" + Date.now();
    }

    _update() {
      if (!this._root) return;
      const dark = this._cfg.theme === "dark" || (this._cfg.theme !== "light" && this._hass && this._hass.themes && this._hass.themes.darkMode);
      this.classList.toggle("dark", !!dark);
      const r = this._root, c = this._cfg, ic = (p) => `<svg viewBox="0 0 24 24"><path d="${p}"/></svg>`;
      const bat = this._state(c.battery), vis = this._state(c.visitor), slp = this._state(c.sleep);
      const items = [];
      if (bat) items.push(`<div class="s">${ic("M16,20H8V6H16M16.67,4H15V2H9V4H7.33A1.33,1.33 0 0,0 6,5.33V20.67C6,21.4 6.6,22 7.33,22H16.67A1.33,1.33 0 0,0 18,20.67V5.33C18,4.6 17.4,4 16.67,4Z")}<span>${bat.state}%</span></div>`);
      if (vis) items.push(`<div class="s${vis.state === "on" ? " warn" : ""}">${ic("M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z")}<span>${vis.state === "on" ? "At door" : "Clear"}</span></div>`);
      if (slp) items.push(`<div class="s">${ic("M18.73,18C15.4,21.69 9.71,22 6,18.64C2.33,15.31 2.04,9.62 5.37,5.93C6.9,4.25 9,3.2 11.27,3C7.96,6.7 8.27,12.39 11.96,15.71C13.5,17.11 15.5,17.92 17.61,18C18,18 18.36,18 18.73,18Z")}<span>${slp.state === "on" ? "Asleep" : "Awake"}</span></div>`);
      r.getElementById("status").innerHTML = items.join("");
    }
  }

  // ── Admin visual editor (sets the dashboard defaults; per-user gear overrides) ─
  const FIELDS = [
    ["camera", "Camera entity"], ["battery", "Battery sensor"], ["visitor", "Visitor sensor"],
    ["sleep", "Sleep sensor"], ["snooze", "Snooze toggle"], ["language", "Language input_select"],
    ["message", "Custom message input_text"], ["siren", "Siren entity"],
  ];
  class DoorbellCardEditor extends HTMLElement {
    setConfig(cfg) { this._cfg = Object.assign({}, cfg); if (!this._built) this._build(); }
    set hass(h) { this._hass = h; }
    _build() {
      this._built = true;
      this.innerHTML = `
        <style>
          .ed{display:flex;flex-direction:column;gap:12px;padding:8px 2px}
          .row{display:flex;flex-direction:column;gap:4px}
          .ed label{font-size:12px;font-weight:600;color:var(--secondary-text-color)}
          .ed input,.ed select{width:100%;padding:9px 11px;border-radius:8px;font:inherit;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color)}
          .hint{font-size:12px;color:var(--secondary-text-color);padding:2px}
        </style>
        <div class="ed">
          ${FIELDS.map(([k, lbl]) => `<div class="row"><label>${lbl}</label><input data-k="${k}" type="text" spellcheck="false"></div>`).join("")}
          <div class="row"><label>Default language</label><select data-k="default_language">
            <option value="">Use input_select default</option>
            ${LANGUAGES.map((l) => `<option value="${l.value}">${l.label}</option>`).join("")}
          </select></div>
          <div class="row"><label>Theme</label><select data-k="theme">
            <option value="auto">Auto (follow Home Assistant)</option><option value="light">Light</option><option value="dark">Dark</option>
          </select></div>
          <div class="hint">Default quick replies are set in YAML. Each user can add/override their own from the card's Settings gear.</div>
        </div>`;
      this.querySelectorAll("input[data-k],select[data-k]").forEach((el) => { const h = () => this._emit(); el.addEventListener("input", h); el.addEventListener("change", h); });
      this._fill();
    }
    _fill() {
      this.querySelectorAll("input[data-k],select[data-k]").forEach((el) => {
        const k = el.dataset.k;
        if (k === "theme") el.value = this._cfg.theme || "auto";
        else el.value = this._cfg[k] !== undefined ? this._cfg[k] : (DEF[k] || "");
      });
    }
    _emit() {
      const cfg = Object.assign({}, this._cfg);
      this.querySelectorAll("input[data-k],select[data-k]").forEach((el) => {
        const k = el.dataset.k, v = (el.value || "").trim();
        if (k === "theme" || k === "default_language") { if (v) cfg[k] = v; else delete cfg[k]; }
        else if (v) cfg[k] = v; else delete cfg[k];
      });
      this._cfg = cfg;
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: cfg }, bubbles: true, composed: true }));
    }
  }
  customElements.define("doorbell-card-editor", DoorbellCardEditor);

  DoorbellCard.getConfigElement = () => document.createElement("doorbell-card-editor");
  DoorbellCard.getStubConfig = () => ({ type: "custom:doorbell-card" });

  customElements.define("doorbell-card", DoorbellCard);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: "doorbell-card", name: "Doorbell Card", description: "Front-door intercom: listen, talk, quick replies, TTS.", preview: true, documentationURL: "https://github.com/ds2000/homeassistant-fe-doorbell" });
})();
