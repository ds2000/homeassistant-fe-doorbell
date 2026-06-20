import json, urllib.request, time, os
TOKEN=open('/config/.ha_token').read().strip()
BASE='http://localhost:8123'
# Override with the TTS_ENGINE env var, or edit this default. Requires Home
# Assistant Cloud (Nabu Casa) for the default engine.
ENGINE=os.environ.get('TTS_ENGINE','tts.home_assistant_cloud')
def api(path, data=None):
    req=urllib.request.Request(BASE+path,
        data=json.dumps(data).encode() if data is not None else None,
        headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'},
        method='POST' if data is not None else 'GET')
    return urllib.request.urlopen(req, timeout=25).read()
msg=json.loads(api('/api/states/input_text.doorbell_custom_message'))['state']
if not msg or not msg.strip():
    raise SystemExit(0)
langname=json.loads(api('/api/states/input_select.doorbell_language'))['state']
loc={'English':'en-GB','Dutch':'nl-NL','German':'de-DE','French':'fr-FR','Spanish':'es-ES'}.get(langname,'en-GB')
r=json.loads(api('/api/tts_get_url',{'engine_id':ENGINE,'message':msg,'language':loc}))
audio=urllib.request.urlopen(r['url'], timeout=25).read()
open('/config/addons/talk_queue/custom_%d.mp3'%int(time.time()),'wb').write(audio)
print('queued tts:', loc, len(audio), 'bytes')
