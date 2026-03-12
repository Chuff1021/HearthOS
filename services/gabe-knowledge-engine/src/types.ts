export type ManualChunk = {
  manual_id?: string;
  manual_title: string;
  manufacturer: string;
  brand?: string;
  model: string;
  normalized_model?: string;
  family?: string;
  size?: string;
  page_number: number;
  source_url: string;
  chunk_text: string;
  section_type?: string;
  content_kind?: string;
  section_title?: string;
  revision?: string;
  language?: string;
  figure_present?: boolean;
  figure_caption?: string;
  heading_scope?: string;
  page_image_ref?: string;
  diagram_type?: string;
  figure_note_text?: string;
  callout_labels?: string[];
  ocr_used?: boolean;
  ocr_confidence?: number;
  ocr_source_mode?: string;
  doc_type?: "installation" | "owner" | "flyer" | "other" | "parts" | "service" | "wiring";
};

export type RetrievedChunk = ManualChunk & {
  score: number;
  source_type: "manual" | "web";
  section?: string;
};

export type CertaintyLadder = "Verified Exact" | "Verified Partial" | "Interpreted" | "Unverified";

export type GabeAnswer =
  | {
      answer: string;
      source_type: "manual";
      manual_title: string;
      page_number: number;
      source_url: string;
      quote: string;
      confidence: number;
      certainty: CertaintyLadder;
      validator_notes?: string[];
      run_outcome?: string;
    }
  | {
      answer: string;
      source_type: "web";
      url: string;
      section: string;
      quote: string;
      confidence: number;
      certainty: CertaintyLadder;
      validator_notes?: string[];
      run_outcome?: string;
    }
  | {
      answer: "This information is not available in verified manufacturer documentation.";
      source_type: "none";
      confidence: 0;
      certainty: "Unverified";
      validator_notes?: string[];
      run_outcome?: string;
    };

export type InstallAngle = "standard" | "45" | "unknown";

export type DimensionRecord = {
  install_angle: InstallAngle;
  dimension_key: string;
  value_imperial: string;
  value_metric: string;
  units: string;
  page_number: number;
  source_url: string;
  manual_title: string;
  manufacturer: string;
  model: string;
  confidence: number;
};
