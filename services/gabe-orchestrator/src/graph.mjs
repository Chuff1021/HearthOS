import { Annotation, StateGraph } from "@langchain/langgraph";
import {
  intakeNode,
  modelResolverNode,
  intentRouterNode,
  engineSelectorNode,
  generalRetrievalNode,
  ventingEngineNode,
  wiringEngineNode,
  partsEngineNode,
  complianceEngineNode,
  validatorNode,
  handoffDecisionNode,
  responseComposerNode,
  runMetadataPersistenceNode,
} from "./nodes.mjs";

const GraphState = Annotation.Root({
  question: Annotation({ default: () => "" }),
  selected_engine: Annotation({ default: () => "general" }),
  intent: Annotation({ default: () => "general" }),
  payload: Annotation({ default: () => ({}) }),
  run_outcome: Annotation({ default: () => "answered_partial" }),
  certainty: Annotation({ default: () => "Unverified" }),
  needs_handoff: Annotation({ default: () => false }),
  trace: Annotation({ default: () => [] }),
});

export function buildWorkflow() {
  const g = new StateGraph(GraphState)
    .addNode("request_intake", intakeNode)
    .addNode("model_resolver", modelResolverNode)
    .addNode("intent_router", intentRouterNode)
    .addNode("engine_selector", engineSelectorNode)
    .addNode("general_retrieval", generalRetrievalNode)
    .addNode("venting_engine", ventingEngineNode)
    .addNode("wiring_engine", wiringEngineNode)
    .addNode("parts_engine", partsEngineNode)
    .addNode("compliance_engine", complianceEngineNode)
    .addNode("validator", validatorNode)
    .addNode("handoff_decision", handoffDecisionNode)
    .addNode("response_composer", responseComposerNode)
    .addNode("run_metadata_persistence", runMetadataPersistenceNode)
    .addEdge("__start__", "request_intake")
    .addEdge("request_intake", "model_resolver")
    .addEdge("model_resolver", "intent_router")
    .addEdge("intent_router", "engine_selector")
    .addConditionalEdges("engine_selector", (s) => s.selected_engine, {
      general: "general_retrieval",
      venting: "venting_engine",
      wiring: "wiring_engine",
      parts: "parts_engine",
      compliance: "compliance_engine",
    })
    .addEdge("general_retrieval", "validator")
    .addEdge("venting_engine", "validator")
    .addEdge("wiring_engine", "validator")
    .addEdge("parts_engine", "validator")
    .addEdge("compliance_engine", "validator")
    .addEdge("validator", "handoff_decision")
    .addEdge("handoff_decision", "response_composer")
    .addEdge("response_composer", "run_metadata_persistence")
    .addEdge("run_metadata_persistence", "__end__");

  return g.compile();
}
