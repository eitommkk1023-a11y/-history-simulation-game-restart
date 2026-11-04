# Distant terrain implementation plan

Execute as one agent on codex/terrain-query-v1; no main changes or publication.

Goal: Extend normal terrain visibility from about 2km to about 8km without multiplying fine geometry. Preserve v25 meter surface, saves and near collision.

Architecture: Quadtree tiles up to 2048m with eight interior segments. Shared edges use the union of both adjacent meshes' edge samples, including the 2m near collider edges; topology participates in cache keys. Extend camera clipping and fog to the same distance. Keep the separate coarse developer travel mode.

Review focus: Mixed LOD joins; world edge clipping; stale queue cache entries; normal/fast transitions; coverage at 6-8km. Water outside the old 2.8km radius must remain represented at sea level without dense whole-world water meshes.

Tasks:
- [x] Add failing coverage and seam tests for 8km, bounded geometry and clipped world edges.
- [x] Implement distant selection, adaptive shared edges and distance settings.
- [x] Add bounded far sea representation if required by captures.
- [x] Run Node suite and real-world browser checks; inspect screenshots, exercise fast-to-normal restoration and original saves.
- [x] Commit one verified unit and deliver v26 HTML with verification steps.

Directional prediction and local detail noise remain separate next steps; this unit changes distant rendering.

Validation: Node70/70; real-world distant rendering and boundary transition, fast travel restoration, integrated touch movement and original save/load all PASS in Chromium. Captured and inspected /tmp/woh-review/distant-v26.png. Baseline SHA256 unchanged.
Self-review (single agent per user instruction): adaptive edges include near colliders and clipped world boundaries; edge topology is in cache keys; camera, fog and LOD ranges agree; both water meshes are released on reload, fast mode, and position changes. Far shores are approximate at 256m and do not feed collision or alter source geography.
