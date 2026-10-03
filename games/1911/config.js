/* Source configuration, unchanged. */
globalThis.SLIPLINE_CONFIG = {
  "document_version": "0.1-design-candidate",
  "status": "UNVALIDATED_DESIGN_NOT_A_PLAYABLE_BUILD",
  "engine": "Godot 4.7.2 stable",
  "verified_on": "2026-10-02",
  "units": "logical pixels; seconds; angles in degrees unless named radians",
  "viewport": {
    "width": 960,
    "height": 660,
    "hud_height": 60,
    "arena_width": 960,
    "arena_height": 600,
    "player_margin": 24
  },
  "simulation": {
    "physics_hz": 120,
    "substeps_per_tick": 4,
    "simulation_hz": 480,
    "round_event_time": "ceil(seconds*480)",
    "hostile_capacity": 512,
    "bead_capacity": 128,
    "capture_epsilon": 1.0
  },
  "player": {
    "move_speed": 260,
    "focus_speed": 130,
    "hit_radius": 5,
    "visual_radius": 11,
    "hp_max": 3,
    "hurt_invulnerability": 1.0,
    "hurt_clear_radius": 64,
    "gamepad_deadzone": 0.18
  },
  "wire": {
    "max_length": 240,
    "width": 4,
    "anchor_dead_length": 8,
    "player_dead_length": 20,
    "minimum_capture_length_exclusive": 28,
    "bead_speed": 180,
    "transport_denominator_floor": 24,
    "attach_radius": 24
  },
  "ports": {
    "capacity_each": 36,
    "activation_delay": 0.9,
    "initial_active_ids": [
      0,
      3
    ],
    "completion_clear_radius": 90,
    "completion_clear_corridor_radius": 26,
    "positions": [
      {
        "id": 0,
        "name": "W",
        "x": 240,
        "y": 300
      },
      {
        "id": 1,
        "name": "NW",
        "x": 360,
        "y": 160
      },
      {
        "id": 2,
        "name": "NE",
        "x": 600,
        "y": 160
      },
      {
        "id": 3,
        "name": "E",
        "x": 720,
        "y": 300
      },
      {
        "id": 4,
        "name": "SE",
        "x": 600,
        "y": 440
      },
      {
        "id": 5,
        "name": "SW",
        "x": 360,
        "y": 440
      }
    ]
  },
  "hazards": {
    "round_radius": 4,
    "needle_hit_radius": 4,
    "needle_visual_half_length": 8,
    "ttl": 8.0,
    "cull_margin": 32,
    "round_speed_by_completed": [
      140,
      140,
      160,
      160,
      180,
      180
    ],
    "needle_speed_by_completed": [
      160,
      160,
      170,
      170,
      180,
      180
    ]
  },
  "director": {
    "phrase_seconds": 12,
    "comb_times": [
      0.8,
      1.2,
      1.6
    ],
    "comb_extra_time_from_completed_4": 2.0,
    "comb_warning": 0.6,
    "comb_spacing": 36,
    "comb_gap_slots": 4,
    "fan_times": [
      4.5,
      5.1,
      5.7
    ],
    "fan_warning": 0.6,
    "fan_degrees_tier_0_1": [
      -40,
      -32,
      -24,
      -16,
      -8,
      0,
      8,
      16,
      24,
      32,
      40
    ],
    "fan_degrees_tier_2_5": [
      -48,
      -40,
      -32,
      -24,
      -16,
      -8,
      0,
      8,
      16,
      24,
      32,
      40,
      48
    ],
    "braid_start": 8.0,
    "braid_count": 12,
    "braid_interval": 0.18,
    "braid_warning": 0.6,
    "pin_first_warning": 8.0,
    "pin_warning_interval": 3.2,
    "pin_warning_seconds": 0.8,
    "pin_angles_tier_0_2": [
      0
    ],
    "pin_angles_tier_3_5": [
      -9,
      0,
      9
    ],
    "rail_warning_local": 10.0,
    "rail_warning_seconds": 0.8,
    "rail_from_completed": 2,
    "edge_centers": [
      [
        480,
        -12
      ],
      [
        972,
        300
      ],
      [
        480,
        612
      ],
      [
        -12,
        300
      ]
    ],
    "edge_normals": [
      [
        0,
        1
      ],
      [
        -1,
        0
      ],
      [
        0,
        -1
      ],
      [
        1,
        0
      ]
    ],
    "half_spans": [
      432,
      252,
      432,
      252
    ],
    "comb_candidate_counts": [
      25,
      15,
      25,
      15
    ],
    "comb_gap_phrase_factor": 2,
    "fan_edge_offset": 1,
    "braid_edge_offsets": [
      2,
      3
    ],
    "braid_q": [
      -0.3,
      0.3
    ],
    "braid_angles": [
      -12,
      -4,
      4,
      12
    ],
    "pin_edge_offset": 2,
    "pin_q_even_odd": [
      -0.5,
      0.5
    ],
    "rail_edge_offset": 2,
    "rail_q": [
      -0.4,
      0,
      0.4
    ]
  },
  "session": {
    "limit_seconds": 180,
    "ports_to_clear": 6,
    "retry_result_guard_seconds": 0.25,
    "in_run_restart_hold_seconds": 0.5,
    "resume_countdown_seconds": 1.0
  },
  "score": {
    "per_delivered": 10,
    "per_completed_port": 200,
    "clear_bonus": 1000,
    "clear_per_remaining_whole_second": 5,
    "clear_per_hp": 100
  },
  "seeds": [
    {
      "id": 101,
      "start_port": 0,
      "edges": [
        0,
        1,
        2,
        3
      ],
      "queue": [
        1,
        4,
        2,
        5
      ],
      "gap_offset": 0
    },
    {
      "id": 102,
      "start_port": 3,
      "edges": [
        2,
        3,
        0,
        1
      ],
      "queue": [
        4,
        1,
        5,
        2
      ],
      "gap_offset": 3
    },
    {
      "id": 103,
      "start_port": 0,
      "edges": [
        1,
        0,
        3,
        2
      ],
      "queue": [
        5,
        2,
        1,
        4
      ],
      "gap_offset": 6
    },
    {
      "id": 104,
      "start_port": 3,
      "edges": [
        3,
        2,
        1,
        0
      ],
      "queue": [
        2,
        5,
        4,
        1
      ],
      "gap_offset": 9
    }
  ],
  "assist": {
    "hazard_speed_multipliers": [
      1.0,
      0.8
    ],
    "clock_and_player_speed_unchanged": true,
    "toggle_grip_is_rule_equivalent": true,
    "reduce_motion_is_rule_equivalent": true
  },
  "feedback": {
    "capture_lifetime": 0.12,
    "bead_arrival_pulse": 0.1,
    "port_complete_vfx": 0.45,
    "hurt_camera_pixels": 2,
    "hurt_camera_seconds": 0.12,
    "capture_audio_min_interval": 0.05,
    "delivery_audio_min_interval": 0.06,
    "audio_polyphony_max": 12,
    "no_fullscreen_flash": true,
    "no_simulation_hitstop": true,
    "attach_seconds": 0.08,
    "body_stretch_max": 1.12,
    "body_restore_seconds": 0.08,
    "cut_residue_seconds": 0.12,
    "capture_particle_min": 2,
    "capture_particle_max": 4,
    "player_nearby_unoccluded_radius": 24,
    "invalid_attach_audio_min_interval": 0.3,
    "needle_audio_warning_remaining_seconds": [
      0.8,
      0.2
    ],
    "port_complete_audio_seconds": 0.35,
    "hit_audio_max_seconds": 0.2,
    "bead_visual_radius": 2.5
  },
  "collision": {
    "body_radius_sum_squared": 81,
    "stationary_relative_motion_epsilon_squared": 1e-12,
    "capture_sample_fractions": [
      0,
      0.5,
      1
    ],
    "body_hit_priority": "earliest_swept_contact_then_lowest_id; body_before_capture_within_substep"
  },
  "visual": {
    "background": "#101722",
    "player": "#F4F0DD",
    "round": "#FFC66D",
    "needle": "#F27E9D",
    "wire_and_ports": "#67D9D0",
    "bead": "#D7FFF2",
    "inactive": "#647184",
    "minimum_font_size": 16,
    "hud_font_size_min": 20,
    "hud_font_size_max": 24
  }
};
if(typeof module!=="undefined") module.exports=globalThis.SLIPLINE_CONFIG;
