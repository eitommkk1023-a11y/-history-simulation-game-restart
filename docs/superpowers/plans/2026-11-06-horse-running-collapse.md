# Horse10 running collapse

Single agent. User correction: at speed the HORSE must buckle and crumble under its momentum, rather than just roll sideways. Keep09 input/quiet side drop/UI, main/battle.js/world/assets and old HTML untouched. No new library/provider.

- [ ] Add tests first: exact start from captured gait matrices and exact end at existing dead; fast fall has front-knee fold/chest drop before side roll, rear follows later, speed changes intensity. Rigid transforms/joint lengths, no model ground penetration, finite phases and continuity.
- [ ] New procedural primary-only running-fall.mjs with front-leg buckling key pose -> low chest/hindquarter collapse -> existing side-dead pose. Retain frozen gait initial state and blend rigid transforms, use actual two-link IK lengths. Ground-correct primary deformed bounds. Old fall/static clips and baked assets unchanged.
- [ ] Fall motion keeps forward speed through early loss of support, higher drag after chest impact; substeps retain blocker checks. Capture start speed/mode/phase/matrices. Inject pose sampler only into primary renderer. Rider release follows current saddle; keep calm side fall and09 input.
- [ ] Browser side-view captures at0/.15/.3/.55/.85/1.5s, inspect all together; actual front/body drop, fold, speed/slide and ground clearance, gait-to-fall and quiet rider, restore/remount and stick controls. Run full unit suite and shared25 GPU/browser checks.
- [ ] README/report/HTML10/package; staged prototype commits; protected file and remote hash/ref verification; deliver HTML+specific visual check. iOS hardware unmeasured.

User added review of other motions: capture all five gaits/reverse at four phases, rear at rise/peak/return, both standing turns, rider getup/recovery and wagon one/two/cargo/canopy. Check transitions and geometry; report findings separately from new running collapse. No extra agent.
