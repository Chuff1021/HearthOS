import json, requests
from pathlib import Path

BASE = 'https://hearth-os.vercel.app/api/gabe'
ROOT = Path('/root/.openclaw/workspace/HearthOS/ops')
CASES = json.loads((ROOT / 'venting10-testset.json').read_text())

results = []
record_counts = []
for tc in CASES:
    r = requests.post(BASE, json={'messages':[{'role':'user','content':tc['question']}]}, timeout=180)
    p = r.json() if r.headers.get('content-type','').startswith('application/json') else {}
    blob = f"{p.get('answer','')} {p.get('quote','')}".lower()
    has_terms = any(t in blob for t in tc['requiredTerms'])
    if p.get('source_type') == 'manual':
        has_citation = bool(p.get('source_url') and p.get('page_number') and p.get('quote'))
    elif p.get('source_type') == 'web':
        has_citation = bool((p.get('source_url') or p.get('url')) and p.get('quote'))
    else:
        has_citation = True

    notes = p.get('validator_notes') or []
    rec_n = None
    for n in notes:
        if isinstance(n, str) and n.startswith('vent_rule_records:'):
            try:
                rec_n = int(n.split(':',1)[1])
            except Exception:
                pass
    if rec_n is not None:
        record_counts.append(rec_n)

    results.append({
        'id': tc['id'],
        'question': tc['question'],
        'pass': bool(has_terms and has_citation),
        'hasTerms': has_terms,
        'hasCitation': has_citation,
        'source_type': p.get('source_type'),
        'certainty': p.get('certainty'),
        'source_url': p.get('source_url') or p.get('url'),
        'page_number': p.get('page_number'),
        'validator_notes': notes,
        'no_answer_reason': p.get('no_answer_reason'),
    })

passed = sum(1 for r in results if r['pass'])
out = {
    'passed': passed,
    'total': len(results),
    'accuracy': round((passed/len(results))*100, 1) if results else 0,
    'structured_record_counts_observed': record_counts,
    'max_structured_records_seen': max(record_counts) if record_counts else 0,
    'results': results,
}
print(json.dumps(out, indent=2))
(ROOT / 'venting10-after.json').write_text(json.dumps(out, indent=2))
