# Horse09 calm side fall and stick starts

Single agent. User asks a quieter fall toward the horse's collapsing side and forward/back stick starts. Keep branch codex/prototype-horse-v1, main/battle.js/world/assets/old standalone unchanged; no library/provider added.

- [ ] Test first: forward/back stick starts only from stopped neutral; forward walk/back reverse, held/repeated input never raises gait, stop while held requires release, moving cannot reverse. Preserve buttons and speed/stamina/turning.
- [ ] Test/adjust flight: existing fall rolls toward local+X; use same side, no upwards impulse, cap forward carry so side dominates at gallop, lower arm/leg/pitch motion and side roll. Validate against actual baked fall direction, yaw, max height, collision, landing/getup.
- [ ] Host holds rider on current saddle for0.32s of collapse, then releases from current transformed saddle; dead preview drops immediately. Recovery while attached or airborne does not teleport. Stick Y passed consistently in frame/events/buttons to keep latch intact.
- [ ] Build09. New browser checks real stick touch/stop/release, walk/reverse and cart, delayed saddle release, side direction/no high bounce, ground/getup/recovery, UI/camera. Run whole unit suite and compatible25 shared regressions, inspect snapshots.
- [ ] Update README/report, package HTML09, staged commits on prototype branch, verify remote hashes/ref/protected paths; deliver HTML+checks. iOS hardware unmeasured.
