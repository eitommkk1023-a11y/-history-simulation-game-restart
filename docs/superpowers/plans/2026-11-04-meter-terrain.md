# Meter terrain trial implementation plan

> Execute with a single agent; user has authorized the next bounded step. No publication or main changes.

Goal: Keep the roughly 100km world and 1.7m person while making mountains read as mountains, up to about 1000m, without editing the original world arrays.

Architecture: A deterministic, versioned playable surface between source geography and terrain chunks. Shared elevations for ground, water and overview. Source save/player coordinates remain compatible. First validate on one real generated mountain; detailed noise, directional prefetch and mobile generation changes are deferred.

Tech stack: existing Three.js r128, ES modules, Node tests and Chromium/Playwright.

Spec: approved six-point design in the conversation (meter units, 100km world, approximately 1000m peaks, preserved geography/water, shared surface, one-mountain-first).

## Constraints and review focus
- Single agent; preserve baseline, Seed, source geography and existing saves.
- No whole-world 1m grid allocation. Keep global source data separate from cached meshes.
- Check heights and slopes numerically, not just appearance.
- Lakes and sea must use the ground height transform; coastline and river downhill direction need checks.
- Original saves must load at the same location; overview must sample the same surface.
- Retain touch movement and camera separation.

## Tasks
- [x] Measure one real mountain and choose a bounded height/profile treatment based on the measured slopes.
- [x] Write regression tests for height range, slope, water and source immutability; verify they fail.
- [x] Implement the playable surface and integrate shared overview sampling; no new world generator.
- [x] Validate a real mountain, foot traversal, chunk continuity, touch movement and save/load; inspect captures.
- [x] Commit the tested unit on the existing work branch and deliver a standalone v25 HTML with checks and limitations.

Ruling: The measured real mountain already has a sufficiently broad footprint for this first trial, so use a smooth monotonic height profile instead of spreading mountains into existing waterways. This retains positions and downstream ordering. Other mountain regions can still have steep cliffs; full-world terrain redesign remains deferred.
Review: Single-agent self-review per user instruction. Source arrays, legacy player coordinates and original generator are preserved. Terrain/water/overview share the same mapping. No extra full-resolution geography arrays or random detail generation were introduced.
