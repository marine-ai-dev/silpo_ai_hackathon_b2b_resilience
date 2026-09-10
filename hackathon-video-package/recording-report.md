# Recording Report — Silpo B2B Complete Video Pitch

## 0. Narration (ElevenLabs) — added after initial recording
All 20 narration clips were generated in ElevenLabs (voice: **Evelina — "Confident and Calm Storyteller"**, a professional Ukrainian female voice) directly through the ElevenLabs web app, downloaded, and named per `narration-timeline.csv`'s `audio_filename` column into `audio/`. One line (`closing_card`) was regenerated shorter to fit its window. All 20 clips were mixed onto the video via `ffmpeg` `adelay`+`amix`.

## 0b. Re-cut to remove dead air (per explicit follow-up request)
The first narrated cut kept each scene at its original planned screen-time (built for a ~3-minute pacing target before narration existed), so once real narration was placed, several scenes had the line finish and then sit in silence for multiple seconds before the next scene began — reported as feeling like "stop-and-go" rather than continuous speech. Fixed by re-cutting the underlying video: for every narrated scene, its on-screen hold was **trimmed down to `audio_duration + 0.6s`** (measured from the actual generated clip, not estimated) directly from the original recordings, then all scenes were re-concatenated in order and the 3 part-transition crossfades were rebuilt with the same 0.5s fade. Silence gaps between lines dropped from **5–9.8 seconds** to **0.5–1.4 seconds** (verified with `ffmpeg silencedetect`) — the one exception is the "Run AI Procurement Plan" button-click beat (~2.9s, intentionally silent — it's a UI action, not a narration gap). This shortened the video considerably (187.97s → 127.17s) as a direct consequence of cutting the dead time; narration content and its meaning are unchanged, only the video's hold-time around it. `click-events.json`, `narration-timeline.csv/json`, `narration-script-uk.md`, and `subtitles-uk.srt` were all regenerated from this new tighter timeline — none of the timing values described below in §1–§15 reflect the discarded first cut.

## 1. Recorded URLs
Both required URLs are present in the final, single MP4:
- Main app (Part 2, "main presentation"): `https://silpo-b2b-resilience-production.up.railway.app/` — 18.63s–43.60s of the final timeline (header/dashboard/consumption-alerts/AI-Forecast/Budget-Optimization tabs), plus a brief revisit at 111.69s–117.48s for the ESG/recycling card (Resilience tab — the portal itself has no ESG UI).
- B2B Portal (Part 3, "portal demo" — the primary interactive demo): `https://silpo-b2b-resilience-production.up.railway.app/portal/` — 43.60s–111.69s, the full flow, plus it's revisited immediately after the ESG cut (117.48s–118.48s) and is the last live-app content before the closing title card.

## 2. Commit / branch
- Branch: `main`, commit `52997e11b8ca603762a99965981aef7c0d160154`.
- No application code was changed. One live demo-data action was taken earlier (before this recording session) on the deployed DreamGift Atelier office's power schedule and a weekly-procurement run was triggered on Kyiv HQ (both via the app's own existing, already-tested endpoints) so the main page's AI Forecast / Budget Optimization tabs and the portal's resilience risk level had real data to show instead of empty states.

## 3. Demo mode
`SILPO_MODE=mock` throughout (confirmed via `/api/meta/silpo-mode`). No checkout/payment was triggered anywhere in the recording — the flow stops at mock cart preparation, gated behind human approval (`cartPreparationService`).

## 4. Actual final video duration
**127.17 seconds (2:07.17)** — shorter than the original 2:45–3:20 target because the dead-air removal (§0b) cut ~61s of silent hold-time; this was an explicit, deliberate trade-off requested after the fact (continuous narration over hitting the original runtime target). Same duration for `silpo-b2b-complete-demo-clean.mp4`, `-narrated.mp4`, and `-with-captions.mp4`.

## 5. Resolution, FPS, codec
1920×1080, 30fps, H.264 (`yuv420p`, `+faststart`), no audio stream. Verified via `ffprobe` on both final files.

## 6. Number of scenes
20 narrated scenes across 4 parts (4 intro title cards, 4 main-page beats, 11 portal-demo beats, 1 closing card), plus one silent 1.69s "trigger click" beat with no narration (the "Run AI Procurement Plan" button press).

## 7. Capabilities/features shown
- **Introduction (4 title cards, generated locally, Silpo tokens):** product name + tagline, Problem, Solution, "MCP-powered orchestration: Дані → агенти → рішення → human approval."
- **Main page:** header/branding, dashboard stats, consumption alerts, **AI Forecast Reasoning (DemandAgent)** tab with real per-item rationale text, **Budget Optimization (BudgetPolicyAgent)** tab with real audit trail (category caps, proportional trim, "awaiting human approval").
- **Portal (primary demo, ~120s):** profile (DreamGift Atelier, 40 employees), power situation (MANUAL source, real entered outage window), office risk / stock gap (readiness shortfalls), triggering "Run AI Procurement Plan," live agent timeline (Demand → Procurement → Budget & Policy → Resilience → Human), Silpo cart recommendation (6 items, ₴5,694.40, MOCK badge), budget decision explanation, delivery timing, resilient branch logistics ("normal branch" — honest no-match reporting), human approval click → mock cart prepared (never a real order), then a brief cut to the main app's ESG/battery-recycling card, then back to the portal.
- **Closing title card:** positioning statement + "Прогнозовані закупівлі. Стійка логістика. Контроль людини." + explicit "Created by Maryna Antonevych" credit line.
- **Persistent watermark:** "Created by Maryna Antonevych," bottom-right, white ~72% opacity with a subtle shadow, present across all 4 parts (burned in once, in one ffmpeg pass over the whole concatenated video, so its position never drifts).

## 8. MCP functions actually shown
Because the recording ran in `SILPO_MODE=mock`, **no live Silpo MCP tool calls happened during this recording** — this report will not claim otherwise. What's genuinely shown:
- The narration and the "MCP-powered orchestration" title card describe MCP's real, confirmed role in this project (standardized agent access to catalog/delivery/cart operations) — grounded in the actual implementation and prior live-MCP verification done earlier in this project (`docs/b2b-resilience/LIVE_MCP_VERIFICATION.md`), not invented for this video.
- On screen, every product/price/cart element visible is labeled `MOCK` (mock-mode client), truthfully, exactly as the running app labels it — the video does not claim these are live MCP results.
- No fabricated MCP capability is asserted anywhere in the narration or on-screen text.

## 9. Was the previous recording reused, or was everything re-recorded?
**Everything was re-recorded from scratch.** The previous session's video only covered the portal in isolation and did not include the main page, an introduction, transitions, or a closing card — it did not satisfy this task's requirements, so none of its source material was reused. This is a fully new 4-part recording (`source-clips/01-introduction.mp4` … `04-closing.mp4`), each clip captured live via Playwright against the same URLs, then normalized (same resolution/fps/pixel format/codec) and assembled with crossfades.

## 10. Technical & visual QA results
- **Black frames:** none detected (`ffmpeg blackdetect`, both final files).
- **Runtime errors:** 0 `pageerror` events across all 4 recording sessions.
- **Transitions:** 3 crossfades (0.5s each, plain fade — no zoom/glitch/rotation), verified by extracting a mid-transition frame at each of the 3 boundaries; each shows a clean blend between real content on both sides, no black flash.
- **First/last frame:** manually inspected. First frame is the intro title card mid-fade-in (a deliberate 400ms CSS fade, not a loading glitch); last frame is the completed closing card with both the persistent watermark and the explicit closing credit line, both readable and non-overlapping.
- **Blank lead-in trimming:** each of the 4 raw clips had a brief (0.25–0.9s) pre-paint blank frame at its very start (normal Playwright video-recording behavior); each was trimmed by finding its actual content-start point and verifying the trimmed clip's own frame 0 directly (not just probing the untrimmed source).
- **Address bar / browser chrome / terminal / DevTools:** never shown — Playwright's video recording captures only the page viewport, and the one URL "transition" (main page → portal) was a direct `page.goto()` navigation, never a typed address bar.
- **Captions:** Cyrillic renders correctly in `silpo-b2b-complete-demo-with-captions.mp4`; caption band placed low with safe margins, doesn't cover key numbers/buttons in the frames checked.
- **codec_name/width/height/r_frame_rate:** `h264`/`1920`/`1080`/`30/1` confirmed via `ffprobe` on both final MP4s.

## 11. Do the timecodes match the final MP4?
Yes. Real monotonic per-scene timestamps were captured *during* the actual recording (not estimated), then mathematically mapped into the final crossfaded timeline using the exact trim offsets and crossfade-transition math applied at concat time (documented row-by-row in `edit-decision-list.csv`). `click-events.json`, `narration-timeline.csv/json`, and `subtitles-uk.srt` are all built from this final mapping, not from the raw per-clip recordings.

## 12. Narration status
**Done.** All 20 clips generated in ElevenLabs (Evelina voice), saved to `audio/*.mp3`, and mixed onto the video — see §0.

## 13. File for manual editing (if further changes are wanted)
`silpo-b2b-complete-demo-clean.mp4` (silent) if narration needs to be redone or replaced; `silpo-b2b-complete-demo-narrated.mp4` (narration, no captions) if only captions need adjusting; the individual `source-clips/*.mp4` if a specific part needs to be re-cut independently. `audio/*.mp3` are kept individually in case one line needs to be swapped without re-mixing everything.

## 14. What's left for a human to do
1. Watch/listen to `silpo-b2b-complete-demo-with-captions.mp4` (or the narrated-only version) start to finish and confirm the pacing feels right — automated checks confirmed every line fits its window, but final judgment on delivery/tone is a human call.
2. Optional: review the 3 crossfade points with narration playing — a 0.5s fade may feel slightly quick with voice present.
3. Decide which of the three video files (clean / narrated / captioned) is the one to submit.

## 15. Full list of files created
```
hackathon-video-package/
├── silpo-b2b-complete-demo-clean.mp4          (127.17s, 1920x1080, H.264, 30fps, silent, watermarked)
├── silpo-b2b-complete-demo-narrated.mp4       (same + ElevenLabs Ukrainian narration, no captions)
├── silpo-b2b-complete-demo-with-captions.mp4  (same + narration + burned-in Ukrainian subtitles)
├── source-clips/                (RAW recordings — pre dead-air-trim; edit-decision-list.csv maps
│   ├── 01-introduction.mp4       each final scene back to its exact source_start/source_end here)
│   ├── 02-main-presentation.mp4
│   ├── 03-portal-demo.mp4
│   └── 04-closing.mp4
├── narration-script-uk.md
├── narration-timeline.csv
├── narration-timeline.json
├── subtitles-uk.srt
├── edit-decision-list.csv
├── click-events.json
├── recording-report.md          (this file)
├── elevenlabs-instructions.md
├── screenshots/                 (17 PNGs, 01–17)
└── audio/                       (20 MP3 narration clips, one per scene_id)
```
