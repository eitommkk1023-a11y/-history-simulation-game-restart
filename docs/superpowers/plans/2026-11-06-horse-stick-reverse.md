# Horse stick controls and reverse implementation plan

> Native single-agent execution; user forbids agents and repeated approval gates.

**Goal:** All gait changes on the stick, with low-speed held reverse after stopping.
**Architecture:** edge-triggered forward/rear command state (three rear gestures stop from top gear) with signed-speed interlocks; signed metric locomotion, existing live walk pose for reverse, host/UI cleanup.
**Tech Stack:** existing JS/Three r128/Playwright; no dependencies.
**Spec:** docs/superpowers/specs/2026-11-06-horse-stick-reverse.md

## Global Constraints
Prototype only; preserve previous HTML and formal world/main; no unrelated realism overhaul or new assets.

## Review Focus
No upshift from held forward; no reverse from a held forward-braking gesture; no instant sign switch; reverse collision and slopes use absolute distances; hidden UI keeps riding status and stick.

- [x] Core: add failing control and signed-motion tests; implement gesture latches, reverse/release/stop interlocks, signed travel/phase; verify related tests.
- [x] Host: remove accelerator/Shift, send signed speed, reverse-aware stop/dismount/fatigue/status; update HTML05 and documentation.
- [x] Verify actual touch upshifts/reverse and camera separation, backward collision, focus/overview/dismount, forward gaits and mobile layouts; inspect screenshots and package/commit reviewed prototype.

Outcome: 119 unit tests, 32 browser checks pass. Rear gestures are counted (4→3→2→0), independent of depth. Actual reverse and backward planted-foot/collision behavior inspected. No formal integration, new clip, library or service.
