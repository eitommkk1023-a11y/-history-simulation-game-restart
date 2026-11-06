# Horse07 implementation plan

Single agent, no repeated approval gates. Continue codex/prototype-horse-v1, main/battle.js untouched. Existing05/06 standalone files remain frozen. No new dependency or asset technology.

- [ ] Reproduce dead -> recovery -> dismount/remount saddle drift in06. Clear all local pelvis translation/rotation before each rider update. Verify recovery including fall/rear and repeated cycles.
- [ ] Add extras-only locomotion/button state. Accelerate one forward gear per press, decelerate one per press, explicit stop and reverse. Stick X steers only; stick Y cannot change gait or brake. PC R/F/Space/B matches buttons; A/D steer. Preserve existing base modules and clips.
- [ ] Canter target27/3.6 m/s, zero drain (recover outside gallop); cart forward gears6.6 and14 km/h with walk/trot. Curvature from speed-dependent radius, larger for carts; limited yaw and collision substeps. Test exact speeds, stamina, radius, reverse and obstacles.
- [ ] Build07 from shared extras host, with all four buttons and mount clear of stick across667x375,844x390,1180x820. Inspect screenshots. Recheck rear/fall/dead/wagon people/canopy and5000 GPU submissions. Run whole unit suite and browser regressions.
- [ ] Update handoff/readme/report and package standalone HTML07. Save coherent fix and behavior commits on prototype branch; verify remote HTML Git hash and branch head. Deliver HTML and specific checks. iOS performance stays unmeasured.
