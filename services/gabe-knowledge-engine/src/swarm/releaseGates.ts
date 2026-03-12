export type ReleaseGateThresholds = {
  unresolved_conflict_rate_max: number;
  unsupported_numeric_answer_attempts_max: number;
  incomplete_manual_refusal_rate_max: number;
  install_query_no_manual_id_attempts_max: number;
  fact_answer_rate_min: number;
  wrong_authority_override_attempts_max: number;
  strict_manual_id_coverage_rate_min: number;
  critical_eval_accuracy_min: number;
  regression_failures_max: number;
};

export type GateProfile = "development" | "staging" | "production";

const PROFILE_DEFAULTS: Record<GateProfile, ReleaseGateThresholds> = {
  development: {
    unresolved_conflict_rate_max: 0.25,
    unsupported_numeric_answer_attempts_max: 50,
    incomplete_manual_refusal_rate_max: 0.9,
    install_query_no_manual_id_attempts_max: 10,
    fact_answer_rate_min: 0.05,
    wrong_authority_override_attempts_max: 10,
    strict_manual_id_coverage_rate_min: 0.5,
    critical_eval_accuracy_min: 0.6,
    regression_failures_max: 20,
  },
  staging: {
    unresolved_conflict_rate_max: 0.1,
    unsupported_numeric_answer_attempts_max: 15,
    incomplete_manual_refusal_rate_max: 0.5,
    install_query_no_manual_id_attempts_max: 1,
    fact_answer_rate_min: 0.2,
    wrong_authority_override_attempts_max: 1,
    strict_manual_id_coverage_rate_min: 0.9,
    critical_eval_accuracy_min: 0.75,
    regression_failures_max: 8,
  },
  production: {
    unresolved_conflict_rate_max: 0.03,
    unsupported_numeric_answer_attempts_max: 2,
    incomplete_manual_refusal_rate_max: 0.25,
    install_query_no_manual_id_attempts_max: 0,
    fact_answer_rate_min: 0.3,
    wrong_authority_override_attempts_max: 0,
    strict_manual_id_coverage_rate_min: 0.98,
    critical_eval_accuracy_min: 0.85,
    regression_failures_max: 0,
  },
};

export function resolveGateProfile(): GateProfile {
  const p = String(process.env.RELEASE_GATE_PROFILE || process.env.NODE_ENV || "development").toLowerCase();
  if (p.includes("prod")) return "production";
  if (p.includes("stag")) return "staging";
  return "development";
}

export function loadReleaseThresholds(profile = resolveGateProfile()): ReleaseGateThresholds {
  const d = PROFILE_DEFAULTS[profile];
  return {
    unresolved_conflict_rate_max: Number(process.env.GATE_UNRESOLVED_CONFLICT_RATE_MAX || d.unresolved_conflict_rate_max),
    unsupported_numeric_answer_attempts_max: Number(process.env.GATE_UNSUPPORTED_NUMERIC_MAX || d.unsupported_numeric_answer_attempts_max),
    incomplete_manual_refusal_rate_max: Number(process.env.GATE_INCOMPLETE_REFUSAL_RATE_MAX || d.incomplete_manual_refusal_rate_max),
    install_query_no_manual_id_attempts_max: Number(process.env.GATE_INSTALL_NO_MANUAL_ID_MAX || d.install_query_no_manual_id_attempts_max),
    fact_answer_rate_min: Number(process.env.GATE_FACT_ANSWER_RATE_MIN || d.fact_answer_rate_min),
    wrong_authority_override_attempts_max: Number(process.env.GATE_WRONG_AUTHORITY_OVERRIDE_MAX || d.wrong_authority_override_attempts_max),
    strict_manual_id_coverage_rate_min: Number(process.env.GATE_STRICT_MANUAL_ID_COVERAGE_MIN || d.strict_manual_id_coverage_rate_min),
    critical_eval_accuracy_min: Number(process.env.GATE_CRITICAL_EVAL_ACCURACY_MIN || d.critical_eval_accuracy_min),
    regression_failures_max: Number(process.env.GATE_REGRESSION_FAILURES_MAX || d.regression_failures_max),
  };
}

export function evaluateReleaseReadiness(metrics: any, t: ReleaseGateThresholds) {
  const checks = [
    { key: "unresolved_conflict_rate", ok: (metrics.unresolved_conflict_refusal_rate || 0) <= t.unresolved_conflict_rate_max, value: metrics.unresolved_conflict_refusal_rate || 0, threshold: t.unresolved_conflict_rate_max, op: "<=" },
    { key: "unsupported_numeric_answer_attempts", ok: (metrics.unsupported_numeric_answer_attempts || 0) <= t.unsupported_numeric_answer_attempts_max, value: metrics.unsupported_numeric_answer_attempts || 0, threshold: t.unsupported_numeric_answer_attempts_max, op: "<=" },
    { key: "incomplete_manual_refusal_rate", ok: (metrics.incomplete_manual_refusal_rate || 0) <= t.incomplete_manual_refusal_rate_max, value: metrics.incomplete_manual_refusal_rate || 0, threshold: t.incomplete_manual_refusal_rate_max, op: "<=" },
    { key: "install_query_no_manual_id_attempts", ok: (metrics.install_query_no_manual_id_attempts || 0) <= t.install_query_no_manual_id_attempts_max, value: metrics.install_query_no_manual_id_attempts || 0, threshold: t.install_query_no_manual_id_attempts_max, op: "<=" },
    { key: "fact_answer_rate", ok: (metrics.fact_answer_rate || 0) >= t.fact_answer_rate_min, value: metrics.fact_answer_rate || 0, threshold: t.fact_answer_rate_min, op: ">=" },
    { key: "wrong_authority_override_attempts", ok: (metrics.wrong_authority_override_attempts || 0) <= t.wrong_authority_override_attempts_max, value: metrics.wrong_authority_override_attempts || 0, threshold: t.wrong_authority_override_attempts_max, op: "<=" },
    { key: "strict_manual_id_coverage_rate", ok: (metrics.strict_manual_id_coverage_rate || 0) >= t.strict_manual_id_coverage_rate_min, value: metrics.strict_manual_id_coverage_rate || 0, threshold: t.strict_manual_id_coverage_rate_min, op: ">=" },
    { key: "critical_eval_accuracy", ok: (metrics.critical_eval_accuracy || 0) >= t.critical_eval_accuracy_min, value: metrics.critical_eval_accuracy || 0, threshold: t.critical_eval_accuracy_min, op: ">=" },
    { key: "regression_failures", ok: (metrics.regression_failures || 0) <= t.regression_failures_max, value: metrics.regression_failures || 0, threshold: t.regression_failures_max, op: "<=" },
  ];

  return {
    ready: checks.every((c) => c.ok),
    checks,
    thresholds: t,
  };
}
