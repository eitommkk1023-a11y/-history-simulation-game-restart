/**
 * Pinta 1492 research profile, copied verbatim from the research pack (docs/pinta-1492/pinta_1492_reconstruction.json).
 * Do NOT edit values here: this is the source of historical/research figures with their evidence levels
 * (A = fairly direct source, B = scholarly estimate, C = inferred from contemporary ships, D = game hypothesis).
 * Game-side assumptions live in pinta-1492-params.mjs, all level D.
 */
export const PINTA_1492_PROFILE = Object.freeze({
  "document": "Pinta 1492 historical-reconstruction research profile",
  "version": "1.0",
  "as_of": "2026-11-05",
  "not_original_blueprints": true,
  "ship_name": "La Pinta",
  "reference_year": 1492,
  "status": "design proposal; not implemented",
  "units": "metric",
  "axis": {
    "x": "stern to bow",
    "y": "port to starboard",
    "z": "up"
  },
  "selected_profile": "research_compact_1690",
  "sources": {
    "PINTA_1690_RESEARCH": "https://revistas.utp.ac.pa/index.php/prisma/article/download/603/html?inline=1",
    "KCL_DIARY": "https://ems.kcl.ac.uk/content/etext/e020.html",
    "UNIA_RESEARCH": "https://dokumen.pub/actas-de-las-jornadas-de-historia-sobre-el-descubrimiento-de-america-tomo-i.html",
    "US_REPLICA": "https://www.ninapinta.net/",
    "ANDALUCIA_MUSEUM": "https://www.andalucia.org/listing/muelle-de-las-carabelas/16117102/",
    "GOULD_CREW": "https://www.cervantesvirtual.com/obra-visor/nueva-lista-documentada-de-los-tripulantes-de-coln-en-1492-iv-0/html/00ab953a-82b2-11df-acc7-002185ce6064_1.html"
  },
  "dimensions": {
    "length_overall": {
      "value": 16.9,
      "unit": "m",
      "source": "PINTA_1690_RESEARCH",
      "evidence_level": "B",
      "notes_ja": "研究復元案、原船の実測値ではない"
    },
    "length_waterline": {
      "value": 15.75,
      "unit": "m",
      "source": "PINTA_1690_RESEARCH",
      "evidence_level": "B",
      "notes_ja": "研究復元案"
    },
    "beam_max": {
      "value": 5.0,
      "unit": "m",
      "source": "PINTA_1690_RESEARCH",
      "evidence_level": "B",
      "notes_ja": "研究復元案"
    },
    "beam_waterline": {
      "value": 4.7,
      "unit": "m",
      "source": "PINTA_1690_RESEARCH",
      "evidence_level": "B",
      "notes_ja": "研究復元案"
    },
    "puntal_reconstructed": {
      "value": 2.28,
      "unit": "m",
      "source": "PINTA_1690_RESEARCH",
      "evidence_level": "B",
      "notes_ja": "研究の Puntal をそのまま保持；絶対的な甲板高ではない"
    },
    "lightship_draft": {
      "value": 1.58,
      "unit": "m",
      "source": "PINTA_1690_RESEARCH",
      "evidence_level": "B",
      "notes_ja": "研究の calado en rosca; 積荷追加時の喫水ではない"
    },
    "hold_internal_length": {
      "value": 14.91,
      "unit": "m",
      "source": "PINTA_1690_RESEARCH",
      "evidence_level": "B",
      "notes_ja": "研究の内部船倉長を用いた異なる計算定義"
    },
    "hold_internal_beam": {
      "value": 4.6,
      "unit": "m",
      "source": "PINTA_1690_RESEARCH",
      "evidence_level": "B",
      "notes_ja": "内部船倉幅に基づく研究値"
    },
    "hold_internal_puntal": {
      "value": 2.3,
      "unit": "m",
      "source": "PINTA_1690_RESEARCH",
      "evidence_level": "B",
      "notes_ja": "内部容積計算に用いた研究値"
    },
    "keel_length_research": {
      "value": 10.31,
      "unit": "m",
      "source": "PINTA_1690_RESEARCH",
      "evidence_level": "B",
      "notes_ja": "造船比例式からの再構成"
    },
    "plan_width_research": {
      "value": 1.53,
      "unit": "m",
      "source": "PINTA_1690_RESEARCH",
      "evidence_level": "B",
      "notes_ja": "内部船倉底部の幅関連指標"
    },
    "toneladas_de_arqueo": {
      "value": 40.1,
      "unit": "historical volume tonnage",
      "source": "PINTA_1690_RESEARCH",
      "evidence_level": "B",
      "notes_ja": "重量ではない：kgと見なさない"
    },
    "displacement_mass": {
      "value": null,
      "unit": "kg",
      "source": null,
      "evidence_level": "D",
      "notes_ja": "未計算。船体形状と積荷から求める"
    },
    "masts_height": {
      "value": null,
      "unit": "m",
      "source": null,
      "evidence_level": "D",
      "notes_ja": "要推定"
    },
    "sail_area": {
      "value": null,
      "unit": "m2",
      "source": null,
      "evidence_level": "D",
      "notes_ja": "要推定"
    },
    "crew_size": {
      "value": 26,
      "unit": "persons",
      "source": null,
      "evidence_level": "D",
      "notes_ja": "複数文献で異なり断定不可：シナリオ初期値"
    },
    "speed_max": {
      "value": null,
      "unit": "kn",
      "source": null,
      "evidence_level": "D",
      "notes_ja": "史料の距離/時間表記を現代knへ直結しない"
    }
  },
  "rig_presets": [
    {
      "id": "atlantic_square_rig",
      "reference_date": "1492-09",
      "evidence_level": "B-C",
      "note_ja": "研究者の三檣横帆型再構築。具体的帆数・寸法は暫定",
      "foremast": "square",
      "mainmast": "square",
      "mizzen": "lateen",
      "sails_exact_dimensions": null
    },
    {
      "id": "departure_lateen_hypothesis",
      "reference_date": "1492-08-03",
      "evidence_level": "C-D",
      "note_ja": "帆装改装対象は史料間で異説。原船の出航時帆装は未確定",
      "sailplan": "lateen hypothesis, number and geometry unresolved",
      "historical_dispute_sources": [
        "KCL_DIARY",
        "UNIA_RESEARCH"
      ]
    }
  ],
  "structural_components": [
    "keel",
    "stem",
    "sternpost",
    "frames",
    "hull_planks",
    "deck_beams",
    "deck",
    "quarterdeck",
    "rudder",
    "mast_steps",
    "masts",
    "yards",
    "standing_rigging",
    "running_rigging",
    "sails",
    "hatch",
    "hold"
  ],
  "historical_events": [
    {
      "date": "1492-08-03",
      "kind": "departure_palos",
      "source": "KCL_DIARY",
      "evidence_level": "A"
    },
    {
      "date": "1492-08-06",
      "kind": "rudder_disengaged",
      "source": "KCL_DIARY",
      "evidence_level": "A"
    },
    {
      "date": "1492-08-07",
      "kind": "rudder_repair_after_repeat_problem",
      "source": "KCL_DIARY",
      "evidence_level": "A"
    },
    {
      "date": "1492-08-08",
      "kind": "leak_reported",
      "source": "KCL_DIARY",
      "evidence_level": "A"
    },
    {
      "date": "1492-09-06",
      "kind": "depart_gomera_west",
      "source": "KCL_DIARY",
      "evidence_level": "A"
    },
    {
      "date": "1492-10-12",
      "kind": "land_sighted_from_pinta",
      "source": "KCL_DIARY",
      "evidence_level": "A",
      "observer_alias_disputed": true
    }
  ],
  "unresolved": [
    "authentic_blueprints",
    "true_original_dimensions",
    "fully_verified_crew_count",
    "exact_mast_heights",
    "exact_sail_area",
    "rig_refit_ship_identity",
    "original_hull_planking_details",
    "deck_and_hold_exact_layout",
    "armament_exact_number",
    "sail_insignia",
    "sailing_performance"
  ],
  "render_lods": [
    "near_detailed",
    "medium_simplified",
    "far_silhouette",
    "offscreen_aggregated"
  ],
  "constraints": {
    "single_agent_only": true,
    "no_parallel_subagents": true,
    "reuse_existing_geography_weather_npc": true,
    "mobile_first": true,
    "separate_history_and_assumptions": true
  }
});
