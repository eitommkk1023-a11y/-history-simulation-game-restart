# Horse Prototype Implementation Plan

> Execute natively as a single agent. User explicitly forbids subagents and repeated approval stops.

**Goal:** A standalone playable horse and 5000+ horse rendering test, with preserved features and measured limitations.
**Architecture:** Metric test ground; generated rigged mesh with 3 LODs; shared GPU bone clips plus live primary pose; separate identities, locomotion, renderer and host UI.
**Tech Stack:** JavaScript modules, pinned Three r128, Blender 4.3.2, Playwright/Chromium.
**Spec:** docs/superpowers/specs/2026-11-06-horse-prototype.md

## Global Constraints
- Single agent, no paid APIs, no production/main changes/deployment.
- Prototype-only localStorage namespace; self-contained HTML, landscape iPhone/iPad controls.
- Same horse ID = same coat and four stats; no wild population or war AI.
- Report raw counts and desktop/iOS evidence separately.

## Review Focus
- Reloading / changing horse must not reroll an existing identity.
- Stopping, switching gait, accelerating and cornering must not skate feet or snap rider/camera.
- Mount/dismount on a slope or by an obstacle must avoid burial and overlap.
- 5000 placed must not be reported as 5000 actually submitted if culled or capped.
- Touch movement must remain independent of camera, and GPU capability failure must be visible.

### Task 1: Identity, controller, skeleton and clips
Files: prototypes/horse/identity.mjs, motion.mjs, controller.mjs; tests/horse-model.test.mjs.
Interfaces: horseIdentity(id,seed), horseGait(phase,mode), horsePose(phase,mode,groundOffsets), stepHorse(state,input,dt,terrain).
- [ ] Tests for deterministic independent appearance/stats, footfall contacts/stance/lift, finite joints, stopping/endurance/turn rate/slope limits.
- [ ] Implement and verify; commit coherent core on prototype-only branch.

### Task 2: Own horse asset and GPU rendering
Files: prototypes/horse/model.mjs, renderer.mjs; tools/build-horse-assets.mjs, export-horse-blender.py; assets/horse-source/.
Interfaces: buildHorseModel(lod) => indexed positions/normals/skin; bake poses => float texture; createHorseRenderer => update and metrics.
- [ ] Generate shape/LOD data, validate topology/dimensions/weights/budgets, export rigged animated GLB and provenance manifest.
- [ ] Inspect side/front/rear/stride renders; repair before proceeding.
- [ ] Verify shader animation and individual colors against CPU references, count draw batches/triangles.

### Task 3: Arena, riding and delivery
Files: prototypes/horse/arena.mjs, app.mjs, index.html; tools/build-horse-prototype.mjs; tests/horse.browser.cjs.
- [ ] Terrain/collision and articulated rider; mount/dismount, distinct turn/acceleration, stamina and following camera.
- [ ] 1/100/1000/5000/10000, overview/ride cameras, compact inspector and independent touch controls.
- [ ] Browser and CPU checks, real screenshots and motion frames. Measure a fixed crowd scenario, no battle-AI claims.
- [ ] Package HTML/report/GLB, verify hashes and formal isolation; final prototype branch commit.
