import { getGabeMessages } from '@/lib/gabe-messages';

export type GabeReviewInsight = {
  id: string;
  sessionId: string;
  techName?: string;
  detectedIssue: 'uncertain_answer' | 'no_answer' | 'short_response' | 'needs_followup';
  suggestion: string;
  sampleQuestion?: string;
  sampleAnswer?: string;
  timestamp: string;
};

export async function runGabeReviewAgent(limit = 100): Promise<GabeReviewInsight[]> {
  const sessions = (await getGabeMessages()).slice(0, limit);
  const insights: GabeReviewInsight[] = [];

  for (const s of sessions) {
    const turns = s.messages || [];
    const userTurns = turns.filter((t) => t.role === 'user');
    const assistantTurns = turns.filter((t) => t.role === 'assistant');
    const lastUser = userTurns[userTurns.length - 1]?.content || '';
    const lastAssistant = assistantTurns[assistantTurns.length - 1]?.content || '';

    const lc = lastAssistant.toLowerCase();

    if (!lastAssistant || lc.includes('not available in verified manufacturer documentation')) {
      insights.push({
        id: `${s.id}-na`,
        sessionId: s.sessionId,
        techName: s.techName,
        detectedIssue: 'no_answer',
        suggestion: 'Improve manual retrieval coverage for this model/topic and add indexed section keywords.',
        sampleQuestion: lastUser,
        sampleAnswer: lastAssistant,
        timestamp: s.lastActivityAt,
      });
      continue;
    }

    if (lc.includes("couldn't verify") || lc.includes('manual-verified')) {
      insights.push({
        id: `${s.id}-uncertain`,
        sessionId: s.sessionId,
        techName: s.techName,
        detectedIssue: 'uncertain_answer',
        suggestion: 'Add stronger model/brand filters and prioritization for installation/service manuals before web fallback.',
        sampleQuestion: lastUser,
        sampleAnswer: lastAssistant,
        timestamp: s.lastActivityAt,
      });
      continue;
    }

    if (lastAssistant.length < 100) {
      insights.push({
        id: `${s.id}-short`,
        sessionId: s.sessionId,
        techName: s.techName,
        detectedIssue: 'short_response',
        suggestion: 'Expand answer template with steps, safety note, and citation requirement when technical.',
        sampleQuestion: lastUser,
        sampleAnswer: lastAssistant,
        timestamp: s.lastActivityAt,
      });
      continue;
    }

    if (s.flagged) {
      insights.push({
        id: `${s.id}-flagged`,
        sessionId: s.sessionId,
        techName: s.techName,
        detectedIssue: 'needs_followup',
        suggestion: `User flagged this session${s.flagReason ? `: ${s.flagReason}` : ''}. Add to regression tests and tune ranking.`,
        sampleQuestion: lastUser,
        sampleAnswer: lastAssistant,
        timestamp: s.lastActivityAt,
      });
    }
  }

  return insights.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
