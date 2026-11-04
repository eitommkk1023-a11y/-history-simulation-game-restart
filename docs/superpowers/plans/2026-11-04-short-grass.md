# Simple below-knee grass

Single agent, existing work branch, no main merge or publication. User approved one simple standard grass, extensible later, after requesting discussion of types.

Goal: Seeded 20-35cm grass tufts on suitable dry biomes around the player. One configurable grass type for now; no trees, wind, new textures, external dependencies or collision obstacles.

Technology announced to user: existing Three.js InstancedMesh. Four simple tapered blades (12 triangles per tuft), one visible instanced batch. Fade geometry between 16m and 24m; candidates in a quantized 32m patch. CPU construction is frame-budgeted with two reusable buffers, retaining the active patch until replacement is ready. Maximum 7000 instances per buffer.

Constraints: Seed and global position determine placement; do not modify geography or saves. Use actual near-triangle ground heights for roots, avoid all water and unsuitable biomes/steep slopes. Hide during overview and developer fast travel. Dispose resources on world reload; update mesh translation after floating-origin changes. Separate configurable type/placement and rendering modules.

- [x] Failing tests for height/determinism/type habitat/water exclusion/ground contact and bounded population.
- [x] Implement deterministic placement and instanced rendering with bounded frame work.
- [x] Integrate lifecycle and add a developer review location on the real world.
- [x] Check phone/tablet captures, walking/actions, overview/fast mode and reload behavior; run relevant existing tests.
- [x] Commit the verified unit and provide v28 HTML and checks.

Validation: Node80/80. Chromium real seed12345: 3005 tufts, four blades/12 triangles, one visible batch, exact sampled ground contact, walking, overview/fast visibility and save/reload placement all passed. Phone/tablet landscape screenshots inspected after correcting instance color allocation. Existing action/touch/prefetch/fast-restoration checks passed.
Self-review (single agent): Vegetation is cosmetic and does not modify geography, terrain collision or save coordinates. Global cell hashes preserve overlapping patch placement. Two bounded buffers are reused and disposed on reload. Current and staged grass anchors follow the floating origin. Suitable habitat and actual water depth are both checked.
Ruling: Start with one static configurable grass type and no new external assets, wind or species selector, matching the user's narrowed scope. Density varies with existing biome suitability; future species can be added in the separated vegetation modules.
