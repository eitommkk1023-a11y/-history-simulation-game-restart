# Horse11 leg proportions study

User approved trying15–20% thicker upper front legs/hind thighs and slightly rounder knees/hocks while keeping lower legs thin. Single agent; same prototype branch, main/battle.js/world/old HTML/assets unchanged. This is a comparison preview, no formal integration or provider.

- [x] Tests: generated geometry preserves vertices/indices/skin and unmodified body/hooves, measured upper radii+18% front/+20% hind, thin cannon middle, valid normals/LODs; thick mesh pose grounding across gaits/rear/fall/running collapse.
- [x] leg-proportions.mjs radial deformation around existing bone axes, recompute normals, no added topology. Renderer method updates existing position/normal arrays for primary/3crowd LODs; post-transition pose constraint grounds thick mesh.
- [x] Host default thicker with always-visible top toggle to original; same identity/gait/phase/camera, no reset or duplication, expose preview state. Build11 with module inline. Canonical JSON/GLB/source model remain sealed.
- [x] Browser A/B screenshots and actual pixel difference at fixed pose; all gaits, rearing, running fall/landing/recovery, both UI sizes and5000instances/material slots. Run whole unit suite/shared regressions. Inspect comparison image. Record limits/iOS unmeasured.
- [x] README/report/HTML11/package; coherent prototype commits and remote hash/ref verification; final includes HTML and what to compare. No user approval gate before this authorized preview.

Core2fffe6d41beca51f59e074655a9dd69044353402. Unit151 / study browser12 / shared25. Geometry budgets unchanged, comparison buffers reused100times. Host/renderer/HTML/evidence saved by the follow-up delivery commit.
