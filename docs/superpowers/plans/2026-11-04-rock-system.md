# Integrated 24-rock system implementation plan

Single-agent native execution. User explicitly authorized one integrated delivery, internal staged verification and A-D experiments, with technical corrections reported. No per-stage approval, no subagents, no publication/main merge.

Spec: docs/superpowers/specs/2026-11-04-rock-system-request.md

Architecture: Add a common 24-rock catalog with measured ranges and explicit empirical modeling parameters; separate rock identity from local fractures/weathering/dip/groundwater. Use a 2.5D column model on the existing coarse geology grid, with finite layer inventories, water partition, bedrock removal, dissolved load and routed solid sediment. Run once during generation, before final climate/hydrology. Modify actual elevation in a new generation profile only; legacy seed generation remains available for old saves. Share exposed rock IDs and effective-property fields between the map, local material and diagnostics. No voxel world or runtime geological erosion.

Numerical contract: SI properties; source-geography physical coordinates in the geological solver, existing compressed game-meter surface remains a view. Annual quasi-steady water flow within geological macro steps; open ocean/domain outlets and priority-flood depression routing. Exact process bookkeeping for solid/dissolved/exported mass on the solver grid; report interpolation and downstream native-hydrology changes separately. No target percentage deformation or post-hoc amplification.

Files/interfaces:
- src/rocks/catalog.mjs: catalog, scientific ranges, effective properties.
- src/rocks/layers.mjs: deterministic formation-conditioned layered columns, exposure and structural interventions.
- src/rocks/evolution.mjs: conservative coarse geological evolution and metrics.
- src/rocks/world-rocks.mjs: native world extraction, generation integration, continuous displacement sampling/application.
- src/rocks/rock-material.mjs: exposed-ID atlas, natural rock patterns and property diagnostics.
- tools/build-integrated-world.mjs: worker/profile/save hooks and standalone bundling.
- tests/rocks*.test.mjs and browser scripts: causal, conservative, renderer and compatibility checks.
- tools/rock-experiments.mjs, rock-world-seeds.mjs: four controlled terrains, A/B/C1/C2/D1/D2/D3, three real seeds; JSON/CSV/PNG and Japanese report.

Review focus: identical inputs in interventions; finite/nonnegative layers and mass inventories; dissolved vs solid and boundary export; dip-induced initial-ID changes; source save compatibility; continuous sampler and consistent atlas IDs; generation CPU/memory and no invasive default changes to legacy worlds.

- [x] Catalog/layer tests; cite source ranges and mark approximations.
- [x] Erosion/groundwater/sediment tests including exposure, conservation, interventions and deterministic generation.
- [x] Integrate worker/new profile/legacy save/rendering/diagnostics; commit verified core stage.
- [x] Run A-D on four fixtures and real generation on at least three seeds; record raw metrics, images and rationale.
- [x] Browser visual + controls/water/volcano/save compatibility checks, self-review, final work-branch commit and v30 HTML + report.
