# Horse riding / 5000-instance prototype

Approved scope: separate test HTML before any formal integration. No wild spawning or battle AI. Recognizable, lightweight horse with articulated walking/trotting/cantering; mount/dismount, camera-relative controls and safe slope traversal. Natural randomized coats and persistent individual speed/acceleration/endurance/agility. User target >=5000 on-screen horses; benchmark 1/100/1000/5000/10000 while maintaining an inspectable detailed horse.

Use existing pinned Three.js r128 and local Blender 4.3.2. No paid providers. The game-dev CLI is absent; record direct model inspection/export/hash checks, not invented CLI receipts. User authorized autonomous single-agent implementation and validation; no per-write approval, subagents, main changes, formal integration or deployment.

Horse-specific standalone arena avoids the existing 3000-square geography's startup/memory overhead when measuring horses. This is a test ground, not a replacement world. Shared geometry, <=3 crowd LOD batches, baked bone-matrix texture and per-instance appearance/phase. A single ridden horse receives live foot IK and controller updates. GPU instancing does not magically animate r128 SkinnedMesh; implement the shared skinning shader and verify it directly. Fall back clearly if vertex float textures are unavailable.

Near ~4000 triangles, middle ~1200, far ~200 (budgets, report actual counts). Preserve long head, ears, neck, chest, haunch, four legs, hooves, mane and tail. Saddlery and rider pose support recognizable riding; no combat. Four-beat walk, diagonal trot, asymmetric canter, explicit stance/swing and hoof lift. Individual ID/seed preserves coat and stats; color and attributes use independent hash channels.

Measure visible submissions, triangles, batches, FPS and CPU generation, not only allocated count. Display crowd is a repeatable marching load without collision/war AI. >=5000 full battlefield simulation and iOS performance remain unproven; never claim desktop results are iPhone measurements.
