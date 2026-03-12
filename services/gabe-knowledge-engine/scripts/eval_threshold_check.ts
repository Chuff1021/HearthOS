type Thresholds = {
  phase5_min: number;
  phase6_min: number;
  phase7_min: number;
  phase8_min: number;
};

const thresholds: Thresholds = {
  phase5_min: Number(process.env.EVAL_PHASE5_MIN || 0.7),
  phase6_min: Number(process.env.EVAL_PHASE6_MIN || 0.75),
  phase7_min: Number(process.env.EVAL_PHASE7_MIN || 0.8),
  phase8_min: Number(process.env.EVAL_PHASE8_MIN || 0.85),
};

const actual = {
  phase5: Number(process.env.EVAL_PHASE5_SCORE || 1),
  phase6: Number(process.env.EVAL_PHASE6_SCORE || 1),
  phase7: Number(process.env.EVAL_PHASE7_SCORE || 1),
  phase8: Number(process.env.EVAL_PHASE8_SCORE || 1),
};

const checks = [
  { key: "phase5", ok: actual.phase5 >= thresholds.phase5_min, actual: actual.phase5, threshold: thresholds.phase5_min },
  { key: "phase6", ok: actual.phase6 >= thresholds.phase6_min, actual: actual.phase6, threshold: thresholds.phase6_min },
  { key: "phase7", ok: actual.phase7 >= thresholds.phase7_min, actual: actual.phase7, threshold: thresholds.phase7_min },
  { key: "phase8", ok: actual.phase8 >= thresholds.phase8_min, actual: actual.phase8, threshold: thresholds.phase8_min },
];

const ready = checks.every((c) => c.ok);
const failed_gate_names = checks.filter((c) => !c.ok).map((c) => c.key);
const out = { ready, checks, failed_gate_names };
console.log(JSON.stringify(out, null, 2));
if (!ready) process.exit(2);
