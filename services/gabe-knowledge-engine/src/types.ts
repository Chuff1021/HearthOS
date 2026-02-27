export type ManualChunk = {
  manual_title: string;
  manufacturer: string;
  model: string;
  page_number: number;
  source_url: string;
  chunk_text: string;
};

export type RetrievedChunk = ManualChunk & {
  score: number;
  source_type: "manual" | "web";
  section?: string;
};

export type GabeAnswer =
  | {
      answer: string;
      source_type: "manual";
      manual_title: string;
      page_number: number;
      source_url: string;
      confidence: number;
    }
  | {
      answer: string;
      source_type: "web";
      url: string;
      section: string;
      confidence: number;
    }
  | {
      answer: "This information is not available in verified manufacturer documentation.";
      source_type: "none";
      confidence: 0;
    };
