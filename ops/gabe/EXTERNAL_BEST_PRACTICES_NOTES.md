# External Best Practices Notes (RAG for Production)

## What other teams do that applies to HearthOS

1. **Evaluation loops over vibe checks (Ragas/Haystack ecosystems)**
   - Keep benchmark datasets and run every change.
   - Track faithfulness/context precision style metrics plus business acceptance.

2. **Contextual retrieval improvements (Anthropic contextual retrieval pattern)**
   - Add richer chunk context and combine lexical + embedding retrieval.
   - Re-rank top candidates before final answer selection.

3. **Conservative grounded answering**
   - Return no-answer when evidence confidence is weak.
   - Require verifiable quote + page + source URL.

4. **Deterministic retrieval routing**
   - Hard metadata filters by manufacturer/model/manual type before generation.
   - Penalize intro/TOC chunks; prioritize section-intent match.

## Recommended Additions for GABE (next)

1. **Reranker stage (high impact)**
   - Add cross-encoder reranker for top-N chunks after hybrid retrieval.
   - Use reranker score in final chunk selection.

2. **Query decomposition for technical prompts**
   - Split question into intent slots (model, subsystem, constraint).
   - Retrieve per slot and require agreement.

3. **Benchmark expansion using real technician questions**
   - Add a golden set from field logs with expected manual family and answerability label.

4. **Model-assisted evaluator pass in CI**
   - Add an evaluator step scoring relevance/faithfulness over regression outputs.

5. **Coverage dashboards**
   - Per-model manual coverage and answerable-rate heatmap to target ingestion gaps.

## Sources reviewed
- Ragas docs (evaluation loops for LLM apps): https://docs.ragas.io/en/stable/
- Haystack evaluation docs (component + end-to-end evaluation): https://docs.haystack.deepset.ai/docs/evaluation
- Anthropic engineering on contextual retrieval: https://www.anthropic.com/engineering/contextual-retrieval
- Prompting Guide RAG overview: https://www.promptingguide.ai/research/rag
- Pinecone RAG production overview: https://www.pinecone.io/learn/retrieval-augmented-generation/

Note: Brave web search key was unavailable in this environment, so direct source fetches were used.
