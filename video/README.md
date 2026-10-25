# Fixie demo video

The video opens with the recorded demo, then plays a montage that explains the app. The montage has a title, how it works, the guardrails, and a closing card with the price and phone number.

## Workflow

1. Put the raw screen recordings in `video/footage/`. This folder is gitignored.
2. Start `claude` in `video/footage/` and ask the `video-use` skill to cut the takes into one clean demo. For example, ask it to remove dead air and fillers and to add captions. It writes `video/footage/edit/final.mp4`. You need an ElevenLabs key in `/root/Developer/video-use/.env` for transcription.
3. Copy the cut to `video/public/demo.mp4`. The composition reads the clip length from the file. Until the file exists, a placeholder card fills the slot.
4. Run `npm run dev` in `video/` to preview in Remotion Studio. Edit the montage text and timing in `src/FixieVideo.tsx`.
5. Run `npm run render` to write `out/fixie.mp4`.

## Claude tooling

- The `video-use` skill is at `~/.claude/skills/video-use`. It cuts real footage: it transcribes, removes fillers, grades color, and burns in subtitles.
- The `remotion@remotion` plugin provides the Remotion skills, such as composition, captions, transitions, and render.
- The `hyperframes@hyperframes` plugin provides HyperFrames, the HTML-to-video engine behind Claude Motion. Use it for one-off motion graphics and overlays.
