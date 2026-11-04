# Detailed terrain and directional prefetch

Single-agent execution, existing work branch, no publication or main changes. User authorized a combined update without intermediate approval stops.

Goal: Deliver deterministic local relief, shared rendering/collision, protected waterways and bounded directional CPU prefetch as one v27 HTML.

Technology: In-project JavaScript value noise (two smooth coordinate scales, seed hash), bilinear protection weights, existing triangle colliders. No external dependency or service. Heights remain in meters; retain v26 1000m mountain profile and 8km LOD.

Design: Add up to 1.25m of relief on dry, gentle land. Fade out near sea/lake/river cells, steep slopes, low sea-level elevations, high summits and world edges. An 8192-entry lazy node-weight cache avoids a full-world detail grid. Source data remains unchanged. Overview and third-person use the same seed and invalidate cached terrain on geography revision. Preserve source player save coordinates and version the new surface.

Prefetch: Keep active 3x3 collider/mesh window unchanged. Build at most three extra CPU terrain chunks ahead of actual travel direction, one job per frame. Promote by reuse when the active window reaches them; cancel stale direction requests and clear on developer fast mode/reload. No hidden prefetched meshes or extra LOD holes.

- [x] Regression tests: seed/reload determinism, new relief, protected water, bounded cache, continuous chunk contacts; prefetch reuse/reversal/world edges.
- [x] Implement shared detailed surface and seed/revision integration.
- [x] Implement and integrate bounded directional prefetch with existing frame work budget.
- [x] Verify real-world relief, foot movement and actions, look separation, boundary traversal, saved position restore, normal/fast mode and far LOD. Inspect captures at phone/tablet landscape sizes.
- [x] Commit the reviewable combined unit and deliver HTML plus checks. Safari hardware performance remains unverified.

Validation: Node77/77. Real-world Chromium check found about 1.52m of local detail variation across the review neighborhood; simultaneous move/look touch input, sprint jump, crouch walk, three promoted prefetched chunks and exact triangle contact all passed. Integrated save/load and fast-to-normal restoration also passed. Captures inspected at phone/tablet landscape sizes.
Self-review: Source arrays remain read-only; Seed is shared by overview and player; geography revision invalidates overview protection weights; water protection covers the pre-existing extended water candidate band; high summits retain the v26 profile. CPU-only prefetch does not change active LOD boundaries, and stale requests/cache are dropped on reversal, reload and fast mode.
Ruling: Limit relief to 1.25m and fade it out at waterways and steep slopes, rather than altering the macro mountain or river generator. This keeps this combined update compatible with the accepted world; it does not add vegetation, erosion or new hydrology.
