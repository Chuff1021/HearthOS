export type FigureEvidence = {
  figure_present: boolean;
  figure_caption?: string | null;
  heading_scope?: string | null;
  figure_note_text?: string | null;
  nearby_explanatory_text?: string | null;
  page_image_ref?: string | null;
  diagram_type?: string | null;
  callout_labels?: string[];
};

export function linkFigureEvidence(input: {
  caption?: string;
  heading?: string;
  text?: string;
  imageRef?: string;
  diagramType?: string;
}) : FigureEvidence {
  const txt = String(input.text || "");
  const noteMatch = txt.match(/(?:note|notes?)\s*:\s*([^\n]{10,260})/i);
  const callouts = Array.from(new Set((txt.match(/\b(?:item|part)\s*#?\s*[A-Z0-9\-]{1,8}\b/gi) || []).slice(0, 20)));

  return {
    figure_present: Boolean(input.caption || input.imageRef || /figure|diagram|illustration/i.test(txt)),
    figure_caption: input.caption || null,
    heading_scope: input.heading || null,
    figure_note_text: noteMatch?.[1] || null,
    nearby_explanatory_text: txt.slice(0, 500) || null,
    page_image_ref: input.imageRef || null,
    diagram_type: input.diagramType || null,
    callout_labels: callouts,
  };
}
