import type {
  AuditClassification,
  Certainty,
  GabeAnswer,
  RunOutcome,
  SourceEvidenceStatus,
  TruthAuditStatus,
} from "../../gabe-validator/src";

export type EngineName =
  | "general_retrieval"
  | "venting"
  | "wiring"
  | "parts"
  | "compliance";

export type OrchestratorQuery = {
  question: string;
  conversationId?: string;
  debug?: boolean;
};

export type RunDiagnostics = {
  engine_build_id: string;
  engine_commit_sha: string;
  engine_runtime_name: string;
  selected_engine: EngineName;
  certainty: Certainty;
  run_outcome: RunOutcome;
  validator_version: string;
};

export type RunRecord = {
  selectedEngine: EngineName;
  certainty: Certainty;
  runOutcome: RunOutcome;
  truthAuditStatus: TruthAuditStatus;
  sourceEvidenceStatus: SourceEvidenceStatus;
  auditClassification: AuditClassification;
  validatorVersion: string;
  diagnostics: RunDiagnostics;
};

export type OrchestratorResponse = GabeAnswer & {
  run: RunRecord;
  debug?: RunDiagnostics;
};
