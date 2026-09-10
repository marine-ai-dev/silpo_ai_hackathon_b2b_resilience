# ElevenLabs Instructions — Silpo B2B Complete Video Pitch

**Important:** ElevenLabs was **not** used in this session. No audio has been generated. `audio/` is empty. This file is a step-by-step guide for doing that yourself.

## 1. What to reference
- `narration-script-uk.md` — human-readable text, grouped by the 4 parts (Introduction / Main page / Portal / Closing).
- `narration-timeline.csv` — 20 rows, one per narrated scene, with exact `start_time`/`end_time` on the **final** video timeline, plus `section` and `page_url` for context.
- You do not upload the video itself to ElevenLabs — only the text. The video (`silpo-b2b-complete-demo-clean.mp4`) is what you combine the generated audio with afterward.

## 2. Voice and language
- Language: **Ukrainian**.
- Voice: professional, confident **female** voice, official/corporate tone (not casual).
- Model: "Eleven Multilingual v2" (or newer) — handles Ukrainian well, including "Сільпо" and "B2B" pronunciation notes below.

## 3. Splitting the text into scenes
Generate **one clip per row** of `narration-timeline.csv` (20 total) — do not generate the whole script as one block, since each clip must be placed independently at its own timecode.

| scene_id | section | start_time | end_time | narration_text |
|---|---|---|---|---|
| intro_slide1 | introduction | 0.00 | 6.90 | Регулярне забезпечення офісу – це більше, ніж повторення попереднього замовлення. |
| ... | | | | (see the full CSV for all 20 rows) |

## 4. Where to place each segment
Place each clip's **start** at its `start_time` on the final video's timeline. Every line was written to finish speaking with buffer before its scene's `end_time` (see `duration_seconds` vs. word count in the CSV) — don't stretch clips to fill the full window. If a generated clip runs longer than `(end_time - start_time)`, regenerate with a slightly faster delivery rather than cutting it off.

## 5. Exact timecodes
Use `narration-timeline.csv` / `narration-timeline.json` directly — every timecode is already computed against the **final crossfaded** video (`silpo-b2b-complete-demo-clean.mp4`, 187.97s), not the raw source clips. `click-events.json` additionally has `source_clip`/`source_start`/`source_end` if you ever need to trace a scene back to its original recording.

## 6. Exporting audio
MP3 (44.1kHz, 128–192kbps) for narration is fine; WAV if you plan further processing before mixing.

## 7. Naming the audio files
Name each clip exactly as listed in `narration-timeline.csv`'s `audio_filename` column, e.g. `intro_slide1.mp3`, `main_hero.mp3`, `portal_procurement.mp3`, `closing_card.mp3` — 20 files total. Save into `hackathon-video-package/audio/`.

## 8. Checking synchronization
1. Play the full timeline once, start to finish (187.97s / 3:07.97).
2. Confirm each line finishes *before* the scene changes.
3. Pay attention around the 3 transition points (~26.3s, ~55.9–56.4s, ~176.4–176.9s) — these are 0.5s crossfades between parts; avoid having narration still speaking exactly as a crossfade starts.
4. Watch `closing_card` (176.87s–187.97s, 11.1s) — it carries the longest line (26 words) at the tightest pace (~141 wpm); if the voice reads slower, this is the one most likely to run over.

## 9. Assembling the final narrated video
**iMovie / DaVinci Resolve** (recommended for 20 clips):
1. Import `silpo-b2b-complete-demo-clean.mp4` as the base video.
2. Import all 20 `audio/*.mp3` files.
3. Drag each onto the audio track, snapping its start to the matching `start_time` from `narration-timeline.csv`.
4. Export 1080p, 30fps, H.264.

**ffmpeg** (scriptable, for a one-shot batch): build one `filter_complex` with an `adelay=<start_time*1000>|<start_time*1000>` per clip, mixed with `amix`, then mux onto the video with `-c:v copy -c:a aac`. With 20 clips this is easiest generated programmatically (e.g. a short Python script reading `narration-timeline.csv` and building the ffmpeg command) rather than typed by hand.

## 10. Captioned version
The same audio placement works identically on `silpo-b2b-complete-demo-with-captions.mp4` if you want narration + burned-in captions together.
