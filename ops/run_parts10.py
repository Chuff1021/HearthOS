import json, requests
from pathlib import Path

import os
BASE=os.environ.get('PARTS_TEST_BASE','http://127.0.0.1:3000/api/gabe')
cases=json.loads(Path('/root/.openclaw/workspace/HearthOS/ops/parts10-testset.json').read_text())
results=[]
for tc in cases:
    p=requests.post(BASE,json={'messages':[{'role':'user','content':tc['question']}]},timeout=180).json()
    blob=(str(p.get('answer',''))+' '+str(p.get('quote',''))).lower()
    hasTerms=any(t in blob for t in [x.lower() for x in tc['requiredTerms']])
    hasCitation=bool(p.get('source_url') and p.get('page_number') and p.get('quote')) if p.get('source_type')=='manual' else bool((p.get('source_url') or p.get('url')) and p.get('quote'))
    results.append({
      'id':tc['id'],'question':tc['question'],'pass':bool(hasTerms and hasCitation),
      'hasTerms':hasTerms,'hasCitation':hasCitation,'answer':p.get('answer',''),
      'source_type':p.get('source_type'),'certainty':p.get('certainty'),'source_url':p.get('source_url') or p.get('url'),'page_number':p.get('page_number'),
      'validator_notes':p.get('validator_notes') or []
    })
passed=sum(1 for x in results if x['pass'])
out={'passed':passed,'total':len(results),'accuracy':round(passed/len(results)*100,1),'results':results}
Path('/root/.openclaw/workspace/HearthOS/ops/parts10-after.json').write_text(json.dumps(out,indent=2))
print(json.dumps(out,indent=2))
