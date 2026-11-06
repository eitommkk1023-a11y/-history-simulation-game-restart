# Horse Four Gaits Implementation Plan

> Execute natively as a single agent. User forbids agents and repeated approval gates.

**Goal:** Zelda-like persistent riding and distinct walk/trot/canter/gallop in a standalone prototype03.
**Architecture:** Pure riding-command latch → metric locomotion controller → gait/pose generator → existing live/baked GPU skinning; host manages independent foot/camera/touch input.
**Tech Stack:** existing Three r128, JavaScript, direct GLB export, Playwright/Chromium.
**Spec:** docs/superpowers/specs/2026-11-06-horse-four-gaits.md

## Global Constraints
No main/formal integration, no agents, no external services. Preserve prototype01/02 HTML, original horse appearance and meter scale. Deliver HTML and checks. Five 48-frame clips must remain within existing texture capacity.

## Review Focus
Latched throttle cannot restart after deep brake or collision without new input. Braking cannot upshift. Camera drag cannot steer. Dismount cannot leave a moving horse/rider. High-speed movement must still use bounded collision substeps.

### Task 1: Riding controls, velocity and four-beat gallop
Files: prototypes/horse/riding-controls.mjs (new), controller.mjs, motion.mjs, identity.mjs; tests/horse-riding.test.mjs (new), horse-model.test.mjs.
Interfaces: freshRideControls(), stepRideControls(state,{x,y,advance,stop}) → latched {gear,mode,steer,brake,forwardHeld}; stepHorse() accepts requested gait and brake strength; horsePose() includes gallop.
- [x] Write behavioral tests, observe failure, implement pure latch/metric targets and gallop.
- [x] Verify held inputs, tiered braking, exhaustion and all footfall/hoof constraints; commit coherent core.

### Task 2: Host, shared clips and standalone delivery
Files: app.mjs, index.html, renderer.mjs, rider.mjs; tools/build-horse-assets.mjs, export-horse-glb.mjs, build-horse-prototype.mjs; horse assets/manifest; browser tests.
- [x] Connect accelerator, forward start, horse-relative steering, backward brake, lifecycle stops and clear UI; preserve camera/foot separation.
- [x] Bake/export five clips, keep texture size and polygon budgets, verify GLB reconstruction.
- [x] Browser functional/touch/layout checks, actual GPU-vs-CPU gallop comparison and visual frames; exercise 5000 submitted horses.
- [x] Self-review, package prototype03, verify saved remote HTML matches local, final prototype branch commit/report.

## Outcome
113 unit tests and 27 browser checks pass. Five fixed-pose GPU/CPU silhouettes match. 5000 galloping instances are submitted. Desktop functional verification only; iOS speed is not claimed. Prototype01/02 and formal source remain untouched.
