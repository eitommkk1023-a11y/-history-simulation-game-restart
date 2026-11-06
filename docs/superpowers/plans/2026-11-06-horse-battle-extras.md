# Horse battle extras implementation plan

> Execute natively as a single agent; no agents or per-step approvals.

**Goal:** Five additional clips and a lightweight one/two-horse cargo wagon in standalone06, with a battle-facing instancing API.
**Architecture:** preserve base pose/model; add extra pose sampler and clip descriptors; extended packed instanced renderer; separate cart mesh/renderer; extras host wraps the unchanged riding controls.
**Tech Stack:** JS/Three r128, direct GLB writer, existing Node/Playwright.
**Spec:** docs/superpowers/specs/2026-11-06-horse-battle-extras.md

## Constraints / review focus
No original gait/model/control edits, main or battle.js writes. Existing05 frozen. No downloads/providers. Non-loop states clamp; dead never restarts on phase change. One horse remains one instanced base mesh. Saddle, collar and hitch share coordinate math. Minimum attribute slots8. Ground and wheel checks must inspect rendered data; avoid claims beyond actual tests.

- [x] Core/tests: extra rigid pose math, one-shot state resolution, turn stepping, harness model, cart model/kinematics; observe test failures then implement.
- [x] Assets:337 rows/10 clips, preserve original240 rows, general GLB export and cart export/manifest; validate readback and budgets; coherent prototype commit.
- [x] Renderer/API/host: packed state flags, per-state timing and attachments, saddle-linked rider, cargo/wheels/team; action test UI06 and handoff README.
- [x] Verify browser screenshots, GPU comparisons, non-loop transitions,5000 mixed states/drawcalls, landscape and legacy05 invariants; package and final prototype commit.

Verification completed locally (129 unit tests / 25 browser checks). Core asset commit: a04864196158b70458264124df0c2f15c000b43a. The follow-up delivery commit contains the renderer, host, evidence and standalone06.

User-added covered wagon: canvas part7 and three seats, instanced human companion, optional0..2 passengers, player driver boarding/control/exit, GLB18 scenes; validate live seat matrices, moving-exit rejection and real canopy pixel changes.
