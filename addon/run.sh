#!/bin/sh
DIRS="/config/addons/talk_queue /media/doorbell"
for d in $DIRS; do mkdir -p "$d" 2>/dev/null; done
echo "talk-daemon v4: watching $DIRS"
play_file() {
  f="$1"; echo "PLAY $f -> doorbell"
  pf="/tmp/padded.wav"; rm -f "$pf"
  if gst-launch-1.0 -q -e \
       audiotestsrc wave=silence num-buffers=150 samplesperbuffer=320 ! audio/x-raw,format=S16LE,rate=16000,channels=1,layout=interleaved ! queue ! concat name=c ! wavenc ! filesink location="$pf" \
       uridecodebin uri="file://$f" ! audioconvert ! audioresample ! audio/x-raw,format=S16LE,rate=16000,channels=1,layout=interleaved ! queue ! c. 2>/tmp/gst.err; then
    play="$pf"
  else
    echo "  (pad failed); raw"; play="$f"
  fi
  neolink talk doorbell -c /config/addons/neolink.toml -f "$play" -v 2.0 2>&1 | grep -aiE "filesrc|error|does not|Connected and logged" | tail -2
  rm -f "$f" "$pf"; echo "DONE $f"
}
while true; do
  for d in $DIRS; do
    for f in "$d"/*.wav "$d"/*.mp3 "$d"/*.aiff "$d"/*.webm "$d"/*.ogg "$d"/*.m4a "$d"/*.aac; do
      [ -e "$f" ] || continue
      play_file "$f"
    done
  done
  sleep 1
done
