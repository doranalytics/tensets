# Body model and rendering

`public/body.glb` is the existing Ten Sets asset, introduced in commit
`c5b2a75f8a8ff09360dbe8cc954c16e042c1d27d` on August 13, 2026.
It is unchanged in the September 2026 UI update.

The original project build record describes a generated écorché reference
image converted to a GLB using Higgsfield's image-to-3D workflow. Its embedded
metadata names `Khronos glTF Blender I/O v4.3.47`; this describes the export
pipeline, not a new local Blender editing session. No external artist model
was downloaded or licensed for this update, and Blender was not used locally.
The repository does not contain a separate third-party license for this
existing generated asset. Do not label it as a CC0 model or a medical atlas.

SHA-256: `3dabc62f47247bc0495038d673a2c9378772d45eecb60cc445a705c0a5d46478`

The updated viewer keeps the original 18 muscle labels and raycast face map,
while blending their colors over narrow surface neighborhoods. The complete
body is opaque, lit as a neutral sculpture, and fitted by an orthographic
camera. Weekly work changes the heat map; it no longer changes body size.
The existing alternate figure setting retains its existing proportion change;
it is not a newly sourced separate female anatomical model.

Rendering uses the existing Three.js dependency. Front/back presets, pointer
rotation, hover labels and a native muscle chooser expose the same muscle-log
navigation. The renderer stops requesting frames when stationary or hidden,
retains its last rendered canvas, and respects reduced-motion preferences.
A failed GLB/WebGL load exposes a retry and leaves the muscle chooser usable.

Run `node scripts/verify-regions.mjs` to check that all 18 regions remain
bilateral, pickable, and oriented as expected. This is a presentation check,
not a clinical validation of the generated anatomy.
