import json, requests
from pathlib import Path

import os
BASE=os.environ.get('PARTS_TEST_BASE','http://127.0.0.1:3000/api/gabe')
cases=json.loads(Path('/root/.openclaw/workspace/HearthOS/ops/parts10-testset.json').read_text())

def note(notes,prefix):
  for n in notes or []:
    if isinstance(n,str) and n.startswith(prefix):
      return n.split(':',1)[1]
  return None

rows=[]
summary={
 'scorer pass + likely correct':0,
 'scorer pass but incomplete':0,
 'scorer pass but questionable':0,
 'scorer fail but acceptable':0,
}
for tc in cases:
  p=requests.post(BASE,json={'messages':[{'role':'user','content':tc['question']}]},timeout=180).json()
  notes=p.get('validator_notes') or []
  qtype=note(notes,'parts_qtype:')
  rec=note(notes,'parts_record_id:')
  missing=note(notes,'missing_fields:')
  ans=p.get('answer','')
  quote=p.get('quote','')
  blob=(ans+' '+quote).lower()
  hasTerms=any(t in blob for t in [x.lower() for x in tc['requiredTerms']])
  hasCitation=bool(p.get('source_url') and p.get('page_number') and p.get('quote')) if p.get('source_type')=='manual' else bool((p.get('source_url') or p.get('url')) and p.get('quote'))
  scorer=bool(hasTerms and hasCitation)
  if scorer:
    if missing or 'not verified' in ans.lower():
      cat='scorer pass but incomplete'
    else:
      cat='scorer pass + likely correct'
  else:
    cat='scorer fail but acceptable' if (p.get('source_type')=='none' or missing) else 'scorer pass but questionable'
  summary[cat]+=1
  rows.append({
    'id':tc['id'],'question':tc['question'],'final_answer':ans,'detected_parts_qtype':qtype,
    'parts_record_id':rec,'source_page':p.get('page_number'),'source_url':p.get('source_url') or p.get('url'),'quote':quote,
    'certainty':p.get('certainty'),'missing_fields':missing,'pass_fail':'PASS' if scorer else 'FAIL','classification':cat
  })
out={'rows':rows,'summary':summary}
Path('/root/.openclaw/workspace/HearthOS/ops/parts-truth-audit.json').write_text(json.dumps(out,indent=2))
print(json.dumps(out,indent=2))
