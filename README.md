# Pulse Foundry

Pulse Foundry is an offline-first percussion instrument, drum machine, compact sound-design studio, and rhythm trainer built for phones. It is a client-only PWA: synthesis, sequencing, exercise scoring, and persistence all run locally in the browser.

## Run it locally

Requires a current Node.js release and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Audio starts after the first pad or transport gesture, as required by mobile browsers.

Useful commands:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run check
npm run start
```

`npm run check` runs type checking, linting, tests, and a production build.

## Playing the instrument

The 4×4 pad grid is home. Pads sound on pointer-down and support simultaneous touches. On desktop, use:

```text
1 2 3 4
Q W E R
A S D F
Z X C V
```

Space toggles the global transport.

## Visual system and waveform pads

The interface follows `style.md` and the supplied reference captures: turquoise for selection and interaction, burnt orange for accents, flat bordered surfaces, and the same light/dark colour tokens, typography, and corner sizes. The theme follows the system when the app opens; the header toggle switches it for the current session.

The 4×4 pads remain square at phone and desktop sizes. Each pad contains a waveform generated with `OfflineAudioContext` through the same subtractive, FM, or additive voice and effects graph used for playback. Preview rendering is queued and cached separately from live audio. Synth edits, preset assignments, and pad tuning invalidate the corresponding preview. Noise-based previews represent the patch rather than the exact random samples of every subsequent hit. Live and sequencer hits illuminate the pad and animate its waveform playhead; reduced-motion settings disable that movement.

Shared tokens and controls live in `app/globals.css`; feature styles are separated under `src/styles/`. Sequencer velocity has redundant visual cues: soft hits use a dashed border and ring, normal hits a turquoise dot and half fill, and accents an orange dot, full fill, and heavier border.

The screens form one spatial workspace:

- Swipe left on Pads to pull the Drum Machine in from the right; swipe right to return.
- Swipe right on Pads to pull the Synth in from the left; swipe left to return.
- Swipe down on Pads for Exercises; swipe up to return.
- Swipe up on Pads for the Song Mode placeholder; swipe down to return.

Navigation is swipe-only. Swipe across the app header or a screen heading, away from the screen edge. On desktop, click-drag across the header. Interactive controls lock navigation gestures so playing pads, painting steps, scrolling a synth panel, and moving synth controls do not change screens. There are no back buttons or directional navigation controls.

The transport belongs to the application, not the Drum Machine screen. Start a pattern, return to Pads, perform over it, and edit its sounds without stopping playback.

The labelled **Metronome** control works independently of sequence playback. It shares the BPM, follows the current pattern's meter, accents beat one, and displays beat indicators against the audio clock. Swing affects drum steps, not the reference click. Stopping or pausing the sequence leaves the metronome running; turn its own control off to silence it. Recording is armed with **Record pads** in the Drum Machine.

## Sound design

All 50 factory percussion sounds are parameter presets for three reusable Web Audio engines:

- Subtractive: dual oscillators, noise, pitch/amplitude/filter envelopes, multimode filter, two LFOs, and modulation.
- FM: four operators, per-operator envelopes, ratios, fine tuning and feedback, plus six algorithms.
- Additive: multiple editable partials, independent decay/detune, spectral tilt, spread, and inharmonicity.

The compact effects stage provides drive, bit crushing, compression, delay, and reverb routing. Factory sounds and kits are deeply frozen. Editing a factory sound creates a temporary session override until **Save as new** or **Duplicate** is chosen, so factory content is never overwritten.

The sound-design workspace takes its visual organization from modular software synthesizers such as Pigments: source selection, a rendered output waveform, an explicit signal path, detailed engine modules, envelope curves, and a modulation-source strip. This is not a Pigments emulation. Each pad uses **one active engine**, not three layers. Switching engines keeps the inactive patches as editable drafts; switching back recalls them. Saved custom presets include those drafts.

Subtractive oscillators have waveform displays; the FM diagrams and audio graph share the same algorithm definitions; additive partial bars are directly editable. The output preview runs through the real voice/effects graph and refreshes after edits. Noise and random modulation mean the preview represents the patch rather than an identical sample for every hit. Changes are heard on the next hit, including hits from an already-running sequence.

The modulation matrix accepts LFO, envelope, velocity and random-per-trigger routes, with engine-dependent destinations. FM operator tuning and full ADSR controls expand within each operator. Effect Mix is dry/wet for drive, amplitude-quantizing bit crush, and compression; delay/reverb use shared sends with a Color low-pass control. Pad naming, tuning, mute, ordering, and kit/backup tools are available in **Synthesizer → Library**.

## Drum Machine and training

The look-ahead scheduler places events on the Web Audio clock instead of relying on timer callbacks for note timing. Patterns support 1–4 bars, adjustable tempo and swing, loop playback, metronome, undo/redo, bar duplication, live editing, and per-step velocity, accent, probability, and microtiming. Pad hits can be overdubbed into the active loop with quantization enabled or disabled.

The rhythm library includes fundamentals, grooves, odd meters, compound meters, Latin/Afro-Cuban concepts, and polyrhythms. Exercises are definitions interpreted by one generic training engine—not individual hard-coded screens. Starting an exercise configures the real shared kit, rhythm, BPM, metronome, and transport, then sends the player to the real pad surface. Scoring reports timing error, consistency, early/late bias, misses, extras, and incorrect pads. Exercise attempts remain local.

## Offline installation

Build and serve the production application over HTTPS (localhost is also treated as secure):

```bash
npm run build
npm run start
```

On Android Chrome, open the browser menu and choose **Install app** or **Add to Home screen**. The manifest launches Pulse Foundry standalone. The production postbuild script injects every bundled JavaScript, CSS, and font asset into the service worker's precache and creates a content-derived cache revision. Installation completes only after the shell and bundles are cached, independently of the browser's HTTP cache. Launch the installed app once while online; subsequent sessions, synth presets, and locally stored user content work without a connection. Use `npm run build` (including its postbuild step) before deploying.

If a new release appears stale, close all installed/browser windows for the app and reopen it so the service worker can activate the latest cache.

## Persistence and data portability

IndexedDB stores custom sounds, kits, patterns, exercise attempts, the current session, tempo, swing, and last area. **Synthesizer → Library → Kit & backup** exposes JSON export/import. Exported data contains only user-owned and session records; factory libraries stay in the application bundle.

No backend, account, analytics service, or network audio asset is required.

## Architecture

```text
src/
  audio/          Web Audio graph and subtractive/FM/additive voices
  model/          Serializable domain models and immutable clone helpers
  persistence/    IndexedDB stores and JSON import/export
  presets/        Factory sounds, kits, and rhythm definitions
  state/           Shared app state and application-level transport ownership
  training/        Exercise generation, validation, progression, and scoring
  transport/       Look-ahead scheduler, sequencing, swing, and quantization
  ui/              Pads, Synth, Drum Machine, Exercises, Song placeholder
public/
  manifest.webmanifest
  sw.js
  icon-192.png
  icon-512.png
tests/
  core.test.ts
```

`AudioEngine` is UI-independent and keeps one protected master graph. `TransportService` is created once by the application provider, so routing between screens cannot interrupt playback. UI state resolves sound IDs against immutable factory presets, user presets, and temporary overrides in that order.

## PWA/offline release checklist

1. Run `npm run check`.
2. Start the production server with `npm run start`.
3. Confirm `/manifest.webmanifest`, `/sw.js`, `/icon-192.png`, and `/icon-512.png` return successfully.
4. In browser developer tools, confirm the service worker is activated and the manifest is installable.
5. Load the app once, enable offline mode, reload, and verify pads, presets, and saved data.
6. On a touch device, verify multitouch, step painting, control gesture locks, and spatial navigation.

The current Song Mode is intentionally only an architectural placeholder.
