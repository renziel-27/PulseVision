export interface User {
  id: number;
  name: string;
  email: string;
  phone?: string;
  created_at?: string;
}

export interface ScanRecord {
  id: number;
  user_id: number;
  started_at: string;
  completed_at?: string;
  duration_seconds: number;
  sampling_rate: number;
  algorithm_name: string;
  model_version: string;
  estimated_bpm?: number | null;
  confidence: number;
  signal_quality: string;
  accepted: boolean;
  rejection_reason: string;
  classification: string;
  stress_level: string;
  fatigue_level: string;
  ear_value: number;
}

export interface ValidationTrial {
  id: number;
  user_id: number;
  trial_name: string;
  trial_code?: string;
  participant_code?: string;
  reference_source?: string;
  condition: string;
  reference_bpm: number;
  smartwatch_bpm?: number;
  pulsevision_bpm: number;
  absolute_error: number;
  measurement_duration?: number;
  algorithm: string;
  signal_quality: number;
  status?: string;
  invalid_reason?: string;
  notes?: string;
  timestamp: string;
}

export interface ValidationStats {
  total_trials: number;
  valid_trials?: number;
  invalid_trials?: number;
  mae?: number | null;
  rmse?: number | null;
  pearson_r?: number | null;
  mean_bias?: number | null;
  mean_reference?: number | null;
  mean_smartwatch?: number | null;
  mean_pulsevision?: number | null;
  max_error?: number | null;
  min_error?: number | null;
  bland_altman_mean_diff?: number | null;
  loa_upper?: number | null;
  loa_lower?: number | null;
}

export interface PreflightStatus {
  ready: boolean;
  face_detected: boolean;
  lighting_ok: boolean;
  lighting_mean: number;
  lighting_contrast: number;
  position_ok: boolean;
  stability_ok: boolean;
  motion_score: number;
  message: string;
}
