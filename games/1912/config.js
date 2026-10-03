(function(g){const config = {
  "schema_version": 1,
  "design_version": "D0.1",
  "status": "UNTUNED_UNPLAYTESTED",
  "title_working": "牵流",
  "engine": {
    "version": "4.7.2",
    "release_checked_on": "2026-10-02",
    "language": "GDScript",
    "renderer": "gl_compatibility",
    "physics_ticks_per_second": 120
  },
  "canvas": {
    "width": 1280,
    "height": 720,
    "arena": {
      "x": 90,
      "y": 60,
      "width": 1100,
      "height": 600
    },
    "player_wall_inset": 20
  },
  "session": {
    "scenario_id": 0,
    "run_ticks": 18000,
    "initial_countdown_ticks": 240,
    "retry_countdown_ticks": 36,
    "retry_skip_countdown_allowed": true,
    "initial_hp": 3,
    "minimum_completed_gates": 5,
    "initial_player": [
      640,
      360
    ],
    "initial_invulnerability_ticks": 0
  },
  "player": {
    "speed": 360.0,
    "focus_speed": 180.0,
    "hit_radius": 6.0,
    "visual_diameter": 26.0,
    "invulnerability_ticks": 120,
    "damage_clear_radius": 48.0,
    "analog_deadzone": 0.18,
    "diagonal_normalized": true,
    "acceleration_seconds": 0.0
  },
  "rail": {
    "minimum_length": 64.0,
    "maximum_length": 300.0,
    "limit_hint_length": 270.0,
    "capture_half_width": 4.0,
    "anchor_exclusion": 16.0,
    "endpoint_exclusion": 24.0,
    "transport_speed": 780.0,
    "outlet_offset": 12.0,
    "outlet_speed": 420.0,
    "direction_arrow_length": 64.0,
    "capture_geom": "end_of_tick_fixed_capsule",
    "max_active_capture_rails": 1,
    "release_captures_new": false,
    "release_retains_bound": true,
    "shrink_below_min": "drain_last_valid_geometry_keep_anchor"
  },
  "hazards": {
    "bead": {
      "collision_radius": 4.0,
      "initial_speed": 220.0,
      "lifetime_ticks": 1440,
      "bounce_count": 1,
      "capturable": true,
      "routed_free_still_harmful": true
    },
    "needle": {
      "collision_radius": 4.0,
      "visual_size": [
        18.0,
        8.0
      ],
      "speed": 540.0,
      "lifetime_ticks": 360,
      "bounce_count": 0,
      "capturable": false,
      "telegraph_ticks": 108,
      "target_lock": "telegraph_start"
    }
  },
  "gate": {
    "width": 160.0,
    "valid_bead_center_offset": 76.0,
    "quota": 20,
    "transition_ticks": 72,
    "score_per_routed_delivery": 10,
    "score_per_completion": 100,
    "score_per_capture": 0,
    "score_per_bounce": 0,
    "carry_over_overflow": false,
    "sequence": [
      {
        "id": "R_T",
        "center": [
          1190,
          220
        ]
      },
      {
        "id": "T_L",
        "center": [
          400,
          60
        ]
      },
      {
        "id": "L_B",
        "center": [
          90,
          500
        ]
      },
      {
        "id": "B_R",
        "center": [
          880,
          660
        ]
      },
      {
        "id": "R_B",
        "center": [
          1190,
          500
        ]
      },
      {
        "id": "T_R",
        "center": [
          880,
          60
        ]
      },
      {
        "id": "L_T",
        "center": [
          90,
          220
        ]
      },
      {
        "id": "B_L",
        "center": [
          400,
          660
        ]
      }
    ]
  },
  "templates": {
    "S": {
      "start_warning_ticks": 108,
      "interval_ticks": 15,
      "beads_per_fire": 1,
      "speed": 220.0,
      "wave_period_seconds": 8.0,
      "horizontal_source_center": 640.0,
      "horizontal_source_amplitude": 220.0,
      "vertical_source_center": 360.0,
      "vertical_source_amplitude": 180.0,
      "direction": "edge_inward_normal"
    },
    "F": {
      "start_warning_ticks": 108,
      "interval_ticks": 60,
      "angles_degrees": [
        -18.0,
        0.0,
        18.0
      ],
      "speed": 220.0,
      "source": "edge_midpoint"
    },
    "N": {
      "warning_ticks": 108,
      "speed": 540.0,
      "source": "edge_midpoint",
      "aim": "player_at_warning_start"
    },
    "spawn_inset": 5.0,
    "phase_end_cancels_unfired_warnings": true
  },
  "phases": [
    {
      "start_tick": 0,
      "end_tick_exclusive": 3600,
      "emitters": [
        {
          "template": "S",
          "edge": "top"
        }
      ]
    },
    {
      "start_tick": 3600,
      "end_tick_exclusive": 7200,
      "emitters": [
        {
          "template": "S",
          "edge": "top"
        },
        {
          "template": "F",
          "edge": "left"
        }
      ]
    },
    {
      "start_tick": 7200,
      "end_tick_exclusive": 10800,
      "emitters": [
        {
          "template": "S",
          "edge": "right"
        },
        {
          "template": "F",
          "edge": "bottom"
        },
        {
          "template": "N",
          "edge": "top",
          "period_ticks": 360
        }
      ]
    },
    {
      "start_tick": 10800,
      "end_tick_exclusive": 14400,
      "emitters": [
        {
          "template": "S",
          "edge": "top"
        },
        {
          "template": "S",
          "edge": "left"
        },
        {
          "template": "N",
          "edge": "right",
          "period_ticks": 300
        }
      ]
    },
    {
      "start_tick": 14400,
      "end_tick_exclusive": 18000,
      "emitters": [
        {
          "template": "S",
          "edge": "bottom"
        },
        {
          "template": "S",
          "edge": "right"
        },
        {
          "template": "F",
          "edge": "left"
        },
        {
          "template": "N",
          "edge": "top",
          "period_ticks": 300
        }
      ]
    }
  ],
  "scenario_transforms": {
    "0": "identity",
    "1": "mirror_x_about_640",
    "2": "mirror_y_about_360",
    "3": "mirror_both"
  },
  "tutorial": {
    "starting_position": [
      400,
      360
    ],
    "pull_ghost": [
      580,
      360
    ],
    "step_A_gate_center": [
      1190,
      360
    ],
    "step_B_gate_center": [
      90,
      360
    ],
    "gate_quota": 6,
    "source_x": 500.0,
    "bead_interval_ticks": 30,
    "source_activation": "after_first_active_rail",
    "no_hp_loss": true,
    "record_would_hit": true,
    "step_B_requires_release_after_active_rail": true,
    "step_B_release_requires_bound_beads": false,
    "additional_hint_after_ticks": 7200,
    "needle_warning_ticks": 108,
    "skip_allowed": true
  },
  "feedback": {
    "capture_flash_ms": 50,
    "gate_completion_ring_ms": 180,
    "max_particle_lifetime_ms": 250,
    "default_hitstop_ticks": 0,
    "camera_damage_shake_pixels": 2.0,
    "camera_damage_shake_ms": 80,
    "reduced_motion_shake_pixels": 0.0,
    "capture_audio_min_interval_ms": 100,
    "delivery_audio_max_per_second": 12,
    "hum_bound_count_cap": 12,
    "body_font_px": 24,
    "major_font_px": 32,
    "text_scale_options": [
      1.0,
      1.25,
      1.5
    ]
  },
  "palette": {
    "background": "#111820",
    "player_rail": "#BDEFE8",
    "free_bead": "#FFC06A",
    "needle_accent": "#FF6B73",
    "white_gate_needle": "#F7F4EC"
  },
  "technical": {
    "object_pool_capacity": 1024,
    "collision_time_epsilon": 1e-06,
    "max_geometry_events_per_bullet_tick": 4,
    "simultaneous_priority": [
      "player",
      "wall_or_gate",
      "capture"
    ],
    "event_sort": [
      "tick_fraction",
      "priority",
      "uid"
    ],
    "new_capture_motion_ready_delay_ticks": 1,
    "new_launch_motion_ready_delay_ticks": 1,
    "spawner_bullet_motion_ready_delay_ticks": 0,
    "death_history_ticks": 30,
    "geometry_log_interval_ticks": 12,
    "stress_free_objects": 512,
    "target_render_fps": 60,
    "budget_render_frame_p95_ms": 16.7,
    "budget_physics_step_p95_ms": 4.0,
    "pool_overflow_policy": "pause_invalid_session",
    "promise_bitwise_cross_platform_replay": false
  },
  "defaults": {
    "hold_to_rail": true,
    "low_motion": false,
    "text_scale": 1.0,
    "cosmetic_seed": 1,
    "transform_id": 0,
    "music_volume": 0.35,
    "sfx_volume": 0.8,
    "master_volume": 0.8
  },
  "notes": [
    "所有人类乐趣阈值见gate_preregistration_template.json，不能用本配置数值替代。",
    "出生/捕获/出管及寿命时序以E 09.5/26.3为准。",
    "无玩法RNG；cosmetic_seed只用于表现层。"
  ]
};if(typeof module!=="undefined")module.exports=config;else g.QianliuConfig=config;})(typeof globalThis!=="undefined"?globalThis:this);
