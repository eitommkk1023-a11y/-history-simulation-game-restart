# Horse prototype 03 — persistent four-gait riding

User approved: accelerate button advances stopped → walk → trot → canter → gallop; releasing stick keeps riding; pull back to slow/stop. User specified Zelda-like horse controls. Existing prototype and single-agent/no-main/no-integration constraints remain.

Native single-agent execution; no additional confirmation gates. Existing Three r128, shared bone animation texture and original geometry are retained; no new library/service.

Controls: forward stick from stopped starts walk (edge-triggered). Button advances exactly one gait per tap, capped at gallop. Left/right guide reins relative to horse heading; camera drag cannot change horse direction. Camera follows heading changes while preserving the user's orbit offset. Backward stick: shallow 0.18–0.45 selects at most trot, medium 0.45–0.75 at most walk, deep ≥0.75 selects stop. Requested gait is latched on release; braking never increases speed. Stronger pull increases braking strength. W forward starts, A/D steer, S/Space stop, Shift accelerates once per press. No reverse motion. Collision, overview, reset, blur and dismount cancel persistent drive. Dismount finishes only after stopping safely.

Speeds: walk 110/60 m/s, trot 220/60 m/s, canter 340/60 m/s. Individual gallop max 60–70 km/h, using the existing independent athletic random channel. Existing identities/coat/markings remain stable; speed statistic now means gallop maximum. These are prototype targets, not a simulation of every real breed. Actual gait follows actual speed during acceleration/braking, with hysteresis and existing pose blend.

Animation: retain 4-beat walk, diagonal 2-beat trot, 3-beat left-lead canter. Add a separate 4-beat transverse gallop (RH→LH→RF→LF) with shorter stance, longer stride, suspension, body pitch and rider lean. Five clips including idle fit in the existing 64×256 RGBAFloat texture (48 frames each); no crowd texture-size increase. GLB carries all five clips.

UI: replace separate pace/canter toggles with one accelerator and mount button. Show current/requested gait, next acceleration gait and brake depth. Keep driving UI when informational UI is hidden. Update gesture hint and landscape layout.

Acceptance: button sequence, forward start, coasting release, shallow/medium/deep brake, no reverse/restart on hold, turn signs, camera independence, collision/high-speed stopping, safe dismount/focus/overview, individual persistence, foot camera-relative input, 667×375 / 844×390 / 1180×820 layouts. Verify numeric footfalls/stance and all clips in actual GPU rendering; inspect gallop/rider frames. Reuse established crowd load scenario to check no shader/count regressions, without claiming iOS measurements.
