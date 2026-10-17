# LUMA prototype

A self-contained web prototype of the LUMA migraine system, built on molten-brain's baked brain meshes.
Every number in it is simulated (`js/sim-data.js`).

The story runs in seven acts: daily check-in, tracking task (eye tracker, motion sensor, voice note), personal profile, then a stimulation session (before, vibration, after, results).
The 3D brain shows the device pathway for three possible placements (side of neck, ear, back of neck), the visual pathway and the migraine pain pathway, all labelled as an educational illustration rather than a brain scan.

## Run

```
cd luma && python3 -m http.server 8080
```

Then open http://localhost:8080.
Arrow keys move between acts, space pauses autoplay, and `?act=4` jumps straight to an act.

## Layout

- `js/acts.js`: the story script, one async function per act.
- `js/brain.js`, `js/anatomy.js`: brain regions, pathways and tap-to-explain text.
- `js/head.js`: eye tracker, wearable and the head frame they mount on.
- `js/sim-data.js`: simulated participant, sensors, tuner and results (swap this for real data).
- `js/ui/`: check-in, live HUD, dashboard, pathway panel, results.
- `data/meshes/`, `vendor/three/`: copied from the molten-brain viewer so the folder runs on its own.
