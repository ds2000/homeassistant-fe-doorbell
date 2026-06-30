class DoorbellRecordCard extends HTMLElement {
  setConfig(c){ this._c=c||{}; }
  set hass(h){ this._h=h; if(!this._built) this._build(); }
  _build(){
    this._built=true;
    this.innerHTML=`<ha-card><style>
      @keyframes dbpulse{0%{box-shadow:0 0 0 0 rgba(176,118,79,.35)}70%{box-shadow:0 0 0 22px rgba(176,118,79,0)}100%{box-shadow:0 0 0 0 rgba(176,118,79,0)}}
      .db-rec #ring{background:rgba(176,118,79,.18)!important;animation:dbpulse 1.4s infinite}
      .db-rec #ring ha-icon{color:var(--accent-color)!important}
    </style>
    <div id="wrap" style="padding:6px">
      <div id="b" style="cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;display:flex;flex-direction:column;align-items:center;gap:12px;padding:30px 16px;border-radius:14px;background:rgba(110,139,114,.09);transition:background .15s">
        <div id="ring" style="width:84px;height:84px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(110,139,114,.15);transition:all .2s">
          <ha-icon icon="mdi:microphone-outline" style="--mdc-icon-size:44px;color:var(--primary-color)"></ha-icon>
        </div>
        <span id="l" style="font-weight:600;font-size:18px;letter-spacing:-.01em;color:var(--primary-text-color)">Hold to talk</span>
        <span id="s" style="color:var(--secondary-text-color);font-size:13px;min-height:16px;text-align:center">Speak live to the door</span>
      </div>
    </div></ha-card>`;
    const wrap=this.querySelector('#wrap'),b=this.querySelector('#b'),l=this.querySelector('#l'),s=this.querySelector('#s');
    let mr,chunks=[],mime;
    const pick=()=>{for(const m of ['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg'])if(window.MediaRecorder&&MediaRecorder.isTypeSupported(m))return m;return '';};
    const start=async(e)=>{e.preventDefault();if(mr&&mr.state==='recording')return;try{
      const st=await navigator.mediaDevices.getUserMedia({audio:true});
      mime=pick();chunks=[];mr=new MediaRecorder(st,mime?{mimeType:mime}:undefined);
      mr.ondataavailable=ev=>{if(ev.data&&ev.data.size)chunks.push(ev.data);};
      mr.onstop=()=>{st.getTracks().forEach(t=>t.stop());this._send(new Blob(chunks,{type:mime||'audio/webm'}),s);};
      mr.start();wrap.classList.add('db-rec');l.textContent='Release to send';s.textContent='Listening…';
    }catch(err){s.textContent='Microphone blocked — open in Safari';}};
    const stop=(e)=>{if(e)e.preventDefault();if(mr&&mr.state!=='inactive'){mr.stop();wrap.classList.remove('db-rec');l.textContent='Hold to talk';s.textContent='Sending…';}};
    b.addEventListener('pointerdown',start);b.addEventListener('pointerup',stop);b.addEventListener('pointerleave',stop);b.addEventListener('pointercancel',stop);
  }
  async _send(blob,s){try{
    const ext=blob.type.includes('mp4')?'m4a':blob.type.includes('ogg')?'ogg':'webm';
    const fn='rec_'+Date.now()+'.'+ext;
    const fd=new FormData();
    fd.append('media_content_id','media-source://media_source/local/doorbell');
    fd.append('file',new File([blob],fn,{type:blob.type}));
    const res=await fetch('/api/media_source/local_source/upload',{method:'POST',headers:{Authorization:'Bearer '+this._h.auth.data.access_token},body:fd});
    if(!res.ok)throw new Error('upload '+res.status);
    const j=await res.json();const id=(j.media_content_id||'').split('/').pop()||fn;
    await this._h.callService('shell_command','doorbell_play_upload',{fn:id});
    s.textContent='Sent — plays at the door shortly';
  }catch(err){s.textContent='Send failed: '+err.message;}}
  getCardSize(){return 3;}
}
customElements.define('doorbell-record-card',DoorbellRecordCard);
