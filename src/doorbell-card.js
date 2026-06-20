/* Doorbell Card — self-contained Lovelace card for the front-door intercom.
   Renders camera, status, hold-to-talk, quick replies, custom TTS and language
   settings in one shadow-DOM element. Calls existing HA services/scripts. */
(function () {
  // ZERO runtime deps (per fe-tesla conventions): no CDN fonts — refined system stacks.
  const SERIF = "'Iowan Old Style','Palatino Linotype','Palatino','Georgia',serif";
  const SANS = "system-ui,-apple-system,'Segoe UI','Helvetica Neue',sans-serif";

  const DEF = {
    camera: "camera.reolink_video_doorbell_fluent",
    battery: "sensor.reolink_video_doorbell_battery",
    visitor: "binary_sensor.reolink_video_doorbell_visitor",
    sleep: "binary_sensor.reolink_video_doorbell_sleep_status",
    snooze: "input_boolean.doorbell_snooze",
    language: "input_select.doorbell_language",
    message: "input_text.doorbell_custom_message",
    siren: "siren.reolink_video_doorbell_siren",
    replies: [
      { name: "Be right there", icon: "M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M11,7V12.41L15.29,16.71L16.71,15.29L13,11.59V7H11Z", service: "script.doorbell_say_brb" },
      { name: "Garden house", icon: "M12,3L2,12H5V20H19V12H22L12,3M12,7.7C14.1,7.7 15.8,9.4 15.8,11.5C15.8,14.5 12,18 12,18C12,18 8.2,14.5 8.2,11.5C8.2,9.4 9.9,7.7 12,7.7Z", service: "script.doorbell_say_porch" },
      { name: "Can I help", icon: "M9,22A1,1 0 0,1 8,21V18H4A2,2 0 0,1 2,16V4C2,2.89 2.9,2 4,2H20A2,2 0 0,1 22,4V16A2,2 0 0,1 20,18H13.9L10.2,21.71C10,21.9 9.75,22 9.5,22V22H9M12.19,5.5C11.3,5.5 10.59,5.68 10.05,6.04C9.5,6.4 9.22,7 9.27,7.69H11.24C11.24,7.41 11.34,7.2 11.5,7.06C11.7,6.92 11.92,6.85 12.19,6.85C12.5,6.85 12.77,6.93 12.95,7.11C13.13,7.28 13.22,7.5 13.22,7.8C13.22,8.08 13.14,8.33 13,8.54C12.83,8.76 12.62,8.94 12.36,9.08C11.84,9.4 11.5,9.68 11.31,9.92C11.11,10.16 11,10.5 11,11H13C13,10.72 13.05,10.5 13.16,10.33C13.27,10.16 13.5,9.97 13.81,9.77C14.34,9.5 14.76,9.17 15.07,8.78C15.38,8.39 15.53,7.97 15.53,7.5C15.53,6.83 15.22,6.4 14.6,5.95C14,5.65 13.18,5.5 12.19,5.5M11,12V14H13V12H11Z", service: "script.doorbell_say_help" },
      { name: "One moment", icon: "M6,2V8H6V8L10,12L6,16V16H6V22H18V16H18V16L14,12L18,8V8H18V2H6M16,16.5V20H8V16.5L12,12.5L16,16.5M12,11.5L8,7.5V4H16V7.5L12,11.5Z", service: "script.doorbell_say_moment" },
      { name: "No thanks", icon: "M12,2C17.53,2 22,6.47 22,12C22,17.53 17.53,22 12,22C6.47,22 2,17.53 2,12C2,6.47 6.47,2 12,2M15.59,7L12,10.59L8.41,7L7,8.41L10.59,12L7,15.59L8.41,17L12,13.41L15.59,17L17,15.59L13.41,12L17,8.41L15.59,7Z", service: "script.doorbell_say_no_thanks" },
      { name: "Siren", icon: "M12,2A7,7 0 0,1 19,9V16L21,18V19H3V18L5,16V9A7,7 0 0,1 12,2M12,4A5,5 0 0,0 7,9V17H17V9A5,5 0 0,0 12,4M14,21A2,2 0 0,1 12,23A2,2 0 0,1 10,21H14Z", accent: true, service: "siren.toggle", target: "siren.reolink_video_doorbell_siren" },
    ],
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

    _render() {
      const r = this.attachShadow({ mode: "open" });
      this._root = r;
      const c = this._cfg;
      const replyHtml = c.replies.map((b, i) => `
        <button class="reply${b.accent ? " accent" : ""}" data-i="${i}">
          <svg viewBox="0 0 24 24"><path d="${b.icon}"/></svg>
          <span>${b.name}</span>
        </button>`).join("");

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
        .talk{margin-top:14px;background:var(--card);border:1px solid var(--bd);border-radius:20px;padding:7px}
        .talk .in{display:flex;flex-direction:column;align-items:center;gap:11px;padding:26px 16px;border-radius:15px;background:var(--green-soft);cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;transition:background .15s}
        .talk .ring{width:86px;height:86px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--green-ring);transition:all .2s}
        .talk .ring svg{width:42px;height:42px;fill:var(--green)}
        .talk.rec .ring{background:rgba(176,118,79,.2);animation:pul 1.4s infinite}
        .talk.rec .ring svg{fill:var(--clay)}
        @keyframes pul{0%{box-shadow:0 0 0 0 rgba(176,118,79,.4)}70%{box-shadow:0 0 0 20px rgba(176,118,79,0)}100%{box-shadow:0 0 0 0 rgba(176,118,79,0)}}
        .talk .t1{font-family:${SERIF};font-weight:600;font-size:20px}
        .talk .t2{color:var(--sec);font-size:13px;min-height:16px}
        .lbl{text-transform:uppercase;letter-spacing:.17em;font-size:11px;font-weight:600;color:var(--sec);padding:22px 2px 11px}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}
        .reply{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:17px 8px;display:flex;flex-direction:column;align-items:center;gap:9px;cursor:pointer;color:var(--tx);transition:transform .08s,background .15s}
        .reply:active{transform:scale(.97);background:var(--green-soft)}
        .reply svg{width:27px;height:27px;fill:none;stroke:var(--green);stroke-width:1.4}
        .reply.accent svg{stroke:var(--clay)}
        .reply span{font-weight:500;font-size:15px}
        .msg{display:flex;gap:9px;align-items:stretch}
        .msg input{flex:1;background:var(--green-soft);border:1px solid var(--bd);border-radius:14px;padding:0 15px;color:var(--tx);font-size:15px;outline:none}
        .msg input::placeholder{color:var(--sec)}
        .msg .send{width:54px;border:1px solid var(--bd);border-radius:14px;background:var(--card);display:flex;align-items:center;justify-content:center;cursor:pointer}
        .msg .send svg{width:23px;height:23px;fill:var(--green)}
        .msg .send:active{background:var(--green-soft)}
        .set{margin-top:11px;background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:6px 6px 6px 16px;display:flex;align-items:center;gap:12px}
        .set svg{width:21px;height:21px;fill:var(--green);flex-shrink:0}
        .set .nm{flex:1;font-size:15px}
        .set select{appearance:none;-webkit-appearance:none;background:var(--green-soft);border:1px solid var(--bd);border-radius:11px;padding:9px 34px 9px 14px;color:var(--tx);font-size:14px;font-family:inherit;cursor:pointer;
          background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='%238C8473'><path d='M7,10L12,15L17,10H7Z'/></svg>");background-repeat:no-repeat;background-position:right 8px center}
      </style>
      <div class="wrap">
        <div class="title">Front Door</div>
        <div class="sub">Speak to whoever is at the door</div>
        <div class="cam" id="cam"><img id="camimg" alt=""/>
          <div class="pill"><span class="dot"></span>LIVE</div></div>
        <div class="status" id="status"></div>
        <div class="talk"><div class="in" id="talk">
          <div class="ring"><svg viewBox="0 0 24 24"><path d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"/></svg></div>
          <div class="t1">Hold to talk</div>
          <div class="t2" id="talkstatus">Speak live to the door</div>
        </div></div>
        <div class="lbl">Quick replies</div>
        <div class="grid" id="replies">${replyHtml}</div>
        <div class="lbl">Custom message</div>
        <div class="msg">
          <input id="msg" type="text" placeholder="Type a message…"/>
          <div class="send" id="send"><svg viewBox="0 0 24 24"><path d="M2,21L23,12L2,3V10L17,12L2,14V21Z"/></svg></div>
        </div>
        <div class="lbl">Settings</div>
        <div class="set">
          <svg viewBox="0 0 24 24"><path d="M12.87,15.07L10.33,12.56L10.36,12.53C12.1,10.59 13.34,8.36 14.07,6H17V4H10V2H8V4H1V6H12.17C11.5,7.92 10.44,9.75 9,11.35C8.07,10.32 7.3,9.19 6.69,8H4.69C5.42,9.63 6.42,11.17 7.67,12.56L2.58,17.58L4,19L9,14L12.11,17.11L12.87,15.07M18.5,10H16.5L12,22H14L15.12,19H19.87L21,22H23L18.5,10M15.88,17L17.5,12.67L19.12,17H15.88Z"/></svg>
          <span class="nm">Language</span>
          <select id="lang"></select>
        </div>
      </div>`;

      // ----- interactions -----
      r.getElementById("cam").addEventListener("click", () => {
        const ev = new Event("hass-more-info", { bubbles: true, composed: true });
        ev.detail = { entityId: this._cfg.camera };
        this.dispatchEvent(ev);
      });
      r.getElementById("replies").querySelectorAll(".reply").forEach((el) => {
        el.addEventListener("click", () => {
          const b = this._cfg.replies[+el.dataset.i];
          if (b.target) this._svc(b.service.split(".")[0], b.service.split(".")[1], { entity_id: b.target });
          else this._svc("script", b.service.split(".")[1]);
        });
      });
      const msg = r.getElementById("msg");
      r.getElementById("send").addEventListener("click", () => {
        const v = msg.value.trim(); if (!v) return;
        this._svc("input_text", "set_value", { entity_id: this._cfg.message, value: v });
        setTimeout(() => this._svc("script", "doorbell_say_custom"), 250);
      });
      r.getElementById("lang").addEventListener("change", (e) => {
        this._svc("input_select", "select_option", { entity_id: this._cfg.language, option: e.target.value });
      });
      this._initTalk(r.getElementById("talk"), r.getElementById("talkstatus"));
      this._refreshCam();
    }

    _initTalk(btn, status) {
      let mr, chunks = [], mime;
      const wrap = btn.closest(".talk");
      const pick = () => { for (const m of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"]) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m; return ""; };
      const start = async (e) => {
        e.preventDefault(); if (mr && mr.state === "recording") return;
        try {
          const st = await navigator.mediaDevices.getUserMedia({ audio: true });
          mime = pick(); chunks = []; mr = new MediaRecorder(st, mime ? { mimeType: mime } : undefined);
          mr.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
          mr.onstop = () => { st.getTracks().forEach((t) => t.stop()); this._send(new Blob(chunks, { type: mime || "audio/webm" }), status); };
          mr.start(); wrap.classList.add("rec"); status.textContent = "Listening… release to send";
        } catch (err) { status.textContent = "Microphone blocked — open in Safari"; }
      };
      const stop = (e) => { if (e) e.preventDefault(); if (mr && mr.state !== "inactive") { mr.stop(); wrap.classList.remove("rec"); status.textContent = "Sending…"; } };
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

      const lang = this._state(c.language), sel = r.getElementById("lang");
      if (lang && sel) {
        const opts = (lang.attributes.options || []);
        if (sel.options.length !== opts.length) sel.innerHTML = opts.map((o) => `<option>${o}</option>`).join("");
        if (sel.value !== lang.state) sel.value = lang.state;
      }
      const m = this._state(c.message), inp = r.getElementById("msg");
      if (m && inp && document.activeElement !== inp && inp.value !== m.state && m.state) inp.value = m.state;
    }
  }

  customElements.define("doorbell-card", DoorbellCard);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: "doorbell-card", name: "Doorbell Card", description: "Front-door intercom: camera, talk, quick replies, TTS." });
})();
