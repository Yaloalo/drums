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

The 4×4 pads remain square at phone and desktop sizes. Each pad contains a waveform generated with `OfflineAudioContext` through the same two-engine voice and effects graph used for playback. Preview rendering is queued and cached separately from live audio. Synth edits, preset assignments, and pad tuning invalidate the corresponding preview. Noise-based previews represent the patch rather than the exact random samples of every subsequent hit. Live and sequencer hits illuminate the pad and animate its waveform playhead; reduced-motion settings disable that movement.

Shared tokens and controls live in `app/globals.css`; feature styles are separated under `src/styles/`. Sequencer velocity has redundant visual cues: soft hits use a dashed border and ring, normal hits a turquoise dot and half fill, and accents an orange dot, full fill, and heavier border.

The screens form one spatial workspace:

- Swipe left on Pads to pull the Drum Machine in from the right; swipe right to return.
- Swipe right on Pads to pull the Synth in from the left; swipe left to return.
- Swipe down on Pads for Exercises; swipe up to return.
- Swipe up on Pads for the Song Mode placeholder; swipe down to return.

Navigation is swipe-only. Swipe across the app header or a screen heading, away from the screen edge. On desktop, click-drag across the header. Interactive controls lock navigation gestures so playing pads, painting steps, scrolling a synth panel, and moving synth controls do not change screens. There are no back buttons or directional navigation controls.

The transport belongs to the application, not the Drum Machine screen. Start a pattern, return to Pads, perform over it, and edit its sounds without stopping playback.

The **metronome** sits in the transport, next to Play and the tempo, on both Pads and the Drum Machine. Its left half switches the click on and off and shows the beat lights; the right half (the time signature, e.g. `4/4`) opens its settings:

- **Time signature**: 1–16 beats over a 2, 4, 8 or 16 note, or one of the common meters (2/4 … 12/8). The time signature is the pattern's bar length, so changing it resizes the drum pattern (each bar keeps its steps from the start; undo restores it).
- **Beats**: tap a beat to cycle accent → click → silent, or use *Every beat*, *Beat 1 only* or *Backbeat*. The choices are kept per beat and persist with the session.

The click works independently of sequence playback, shares the BPM and is scheduled on the audio clock. Swing affects drum steps, not the reference click. Stopping or pausing the sequence leaves the metronome running; turn its own control off to silence it.

## Sound design

The synthesizer follows the visual workflow of Arturia Pigments — two primary engine slots, an independent utility layer, two filters with a series↔parallel blend, an amp and effects — with playable macros and modulation assigned by arming a source and dragging knob rings. It is modelled on that workflow, not an emulation of Pigments.

```text
Engine 1 ─┬─(To filter)─▶ Filter 1 ─┬─(series)──▶ Filter 2 ─┐
          │                         └─(parallel)───────────┼─▶ Amp ─▶ FX inserts ─▶ out
Engine 2 ─┴─(To filter)─────────────────────────▶ Filter 2 ─┘            └─▶ delay / reverb sends
   └── Combine with Engine 1: Layer (+), FM (Engine 2 bends Engine 1's pitch) or Ring (Engine 1 × Engine 2)
Utility ─── oscillator + noise ───▶ Filter 1 / Filter 2 ──┘
                              └──▶ clean direct feed ─────▶ Amp
```

The **Synth** view shows this path as a diagram. Each block is clickable and opens its editor underneath; arrows are weighted by how much signal takes each path, the series/parallel link redraws as the routing changes, and each hit lights the stages in order. On phones the diagram runs top to bottom.

- **Engines**: each slot runs one of three engines — *Analog* (two oscillators + noise), *FM* (four operators, six algorithms) or *Harmonic* (additive partials with tilt, spread and inharmonicity). Every engine has its own amp envelope, pitch sweep, level and *To filter* balance between Filter 1 and Filter 2. Switching a slot's type keeps the edits for each type. Engine 2 is off until you turn it on.
- **Combine**: *Layer* sums both engines; *FM* feeds Engine 2 into Engine 1's oscillator frequencies at audio rate (depth scales with each oscillator's pitch); *Ring* multiplies them, with an amount that blends from dry Engine 1 to fully ringed.
- **Utility**: an always-available oscillator and noise layer with its own envelope, filter balance and clean direct feed. It is useful for sub reinforcement, click/transient layers and air without consuming Engine 2. *Deep 808* and *Chrome Snare* demonstrate the two uses.
- **Filters**: two multimode filters (low-pass, high-pass, band-pass, notch), each with cutoff, resonance, envelope amount and key tracking, plus a shared filter envelope. The response curves are measured from a real `BiquadFilterNode`.
- **Amp**: level, pan and velocity sensitivity, with both engine envelopes drawn on one time axis.
- **FX**: drive, bit crush and compression as an ordered insert chain, then delay and reverb sends with a Color low-pass.

The four **performance macros** stay above the detailed editor, so one gesture can control several destinations. Every factory sound ships with useful Body, Motion, Edge and Space routes chosen for its active engines, filters and effects; macros can be rerouted like any other source.

**Modulation** sources — LFO 1, LFO 2, the filter envelope, Engine 1's envelope, velocity, random-per-hit and the four macros — sit in the strip at the bottom. Pick a source and every knob it can reach gets a dashed orange ring; drag a knob to set that source's depth (up is positive, down negative; double-click clears it). The source panel lists everything it moves, with sliders and an *Add a target* menu for destinations without a knob. Destinations include engine and utility pitch/level, both filters, cross-modulation, harmonic tilt, amp/pan and live drive, delay and reverb amounts. Knobs show small source tags when modulated.

The **output scope** is an oscilloscope line of the rendered patch through the real voice and effects graph: *Wave* shows about six cycles of the pitch, *20 ms*/*100 ms* the attack, *Hit* the whole sound. It starts at the sound's onset. Noise and random modulation mean the preview represents the patch rather than an identical sample for every hit. Changes are heard on the next hit, including hits from an already-running sequence.

The **Pad** and **Preset** menus are searchable: type to filter by name, category, tag or engine, use the arrow keys and Enter. There are 54 factory sounds: 50 single-engine percussion sounds and four two-engine demonstrations — *Layer Snare* (tone + noise through parallel filters), *Knock Kick* (Analog body + FM click), *Ring Clang* (ring modulation) and *Growl Tom* (engine FM). Factory sounds and kits are deeply frozen. Editing a factory sound creates a temporary session override until **Save as new** or **Duplicate** is chosen, so factory content is never overwritten. Presets saved before the two-engine voice are migrated when loaded: the old engine becomes Engine 1, its filter becomes Filter 1 and LFO routings become modulation routes, so they sound the same. Pad naming, tuning, mute, ordering, and kit/backup tools are available in **Synthesizer → Library**.

## Drum Machine and training

The look-ahead scheduler places events on the Web Audio clock instead of relying on timer callbacks for note timing. Patterns support 1–4 bars in any meter set from the metronome, adjustable tempo and swing, loop playback, undo/redo, bar duplication, live editing, and per-step velocity, accent, probability, and microtiming (selecting an active step opens its editor).

Lanes can be folded. A folded lane is a thin strip that shows its hits as ticks and flashes whenever the pad plays, from the sequence or live. When a pattern loads, empty lanes start folded; the chevron on a lane name folds or opens it, and **Fold empty** / **Show all** switch every lane at once.

The rhythm library includes fundamentals, grooves, odd meters, compound meters, Latin/Afro-Cuban concepts, and polyrhythms. The training browser contains 100 exercises across 14 skill areas and five difficulty levels. Search, faceted filters (focus, level, meter, pad count, style, backing, and progress), favourites, progress-aware sorting, and recent/best scores make the library manageable on a phone.

Exercises are definitions interpreted by one generic training engine—not individual hard-coded screens. Each definition carries its meter, tempo range, target pads and notes, instructions, difficulty, style, optional drum-machine backing, and scoring setup. Before starting, choose tempo, duration (30 seconds through 10 minutes or unlimited), compatible backing groove, count-in, click, guide mode, and relaxed/normal/strict timing tolerance. **Listen** demonstrates the target without scoring. **Start practice** configures the real shared kit, rhythm, BPM, metronome, and transport, then sends the player to the real pad surface with notation, instructions, countdown, live timing feedback, and highlighted target pads.

Exercise rhythms are shown as simplified standard drum-set notation rather than a copy of the step sequencer: five staff lines, a percussion clef, low-to-high drum placement, filled drum heads, x-shaped cymbal/hi-hat heads, open-hi-hat marks, bar lines, counts, and stacked simultaneous notes. The first four lessons form a dedicated beginner path from quarter-note hi-hat through subdivisions and the snare backbeat to a complete kick/snare/hi-hat rock beat. Accompaniment is explicit: metronome, drum groove, both, or no backing, with the exact compatible groove selectable below.

The results view reports score and grade, timing accuracy, consistency, early/late bias, misses, extras, wrong pads, streak, per-bar drift, timing distribution, and concise practice advice. Exercise history, best scores, calibration offset, favourites, browser state, and session preferences remain local in IndexedDB.

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
  audio/          Web Audio graph, two-engine voices and waveform/scope rendering
  model/          Serializable domain models, the voice definition and preset migration
  persistence/    IndexedDB stores and JSON import/export
  presets/        Factory sounds, kits, and rhythm definitions
  state/           Shared app state and application-level transport ownership
  training/        Exercise generation, validation, progression, and scoring
  transport/       Look-ahead scheduler, sequencing, swing, and quantization
  ui/              Pads, Synth (flow, engines, modules, modulation), Drum Machine, Exercises, Song placeholder
public/
  manifest.webmanifest
  sw.js
  icon-192.png
  icon-512.png
tests/
  core.test.ts
```

`AudioEngine` is UI-independent and keeps one protected master graph. `src/model/voice.ts` defines the voice shared by the audio graph, the flow diagram and the editors. `TransportService` is created once by the application provider, so routing between screens cannot interrupt playback. UI state resolves sound IDs against immutable factory presets, user presets, and temporary overrides in that order.

## PWA/offline release checklist

1. Run `npm run check`.
2. Start the production server with `npm run start`.
3. Confirm `/manifest.webmanifest`, `/sw.js`, `/icon-192.png`, and `/icon-512.png` return successfully.
4. In browser developer tools, confirm the service worker is activated and the manifest is installable.
5. Load the app once, enable offline mode, reload, and verify pads, presets, and saved data.
6. On a touch device, verify multitouch, step painting, control gesture locks, and spatial navigation.

The current Song Mode is intentionally only an architectural placeholder.
