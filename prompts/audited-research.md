---
description: Parallel research followed by an independent evidence audit
---

Run an opt-in audited research workflow for the current question or decision.

The parent session owns the research frame and final synthesis. Before launching children, state the question, the decision it informs, and two or three distinct research angles. Use `researcher` for external sources. Use `scout` only for an angle that genuinely needs local repository context. Do not launch a synthesis subagent.

Launch exactly one async `workflowScript`. Put the two or three research lanes in one `runs.all([...])` batch and set `context: "fresh"` on every child. Give each lane a stable key, a specific angle, and a managed file-only output. Adapt the following shape to the actual question; remove the optional local lane when repository context is irrelevant:

```js
const research = await runs.all([
  {
    key: "research-primary-sources",
    label: "Primary-source evidence",
    agent: "researcher",
    context: "fresh",
    task: "Research primary and authoritative evidence for QUESTION as it affects DECISION. Cover ANGLE_1. Return claims, source links, confidence, contradictions, and missing evidence. Do not edit files.",
    output: "audited-research/primary-sources.md",
    outputMode: "file-only"
  },
  {
    key: "research-tradeoffs",
    label: "Tradeoffs and counterevidence",
    agent: "researcher",
    context: "fresh",
    task: "Research independent evidence for QUESTION as it affects DECISION. Cover ANGLE_2, including counterevidence and practical tradeoffs. Return claims, source links, confidence, contradictions, and missing evidence. Do not edit files.",
    output: "audited-research/tradeoffs.md",
    outputMode: "file-only"
  },
  {
    key: "research-local-context",
    label: "Local repository context",
    agent: "scout",
    context: "fresh",
    task: "Inspect the local repository evidence relevant to QUESTION and DECISION. Cover ANGLE_3. Return file paths and line ranges, constraints, contradictions, confidence, and missing context. Do not edit files.",
    output: "audited-research/local-context.md",
    outputMode: "file-only"
  }
]);

const angleByKey = {
  "research-primary-sources": "ANGLE_1: primary and authoritative evidence",
  "research-tradeoffs": "ANGLE_2: counterevidence and practical tradeoffs",
  "research-local-context": "ANGLE_3: local repository context"
};
const researchHandoff = research.map((result) => ({
  key: result.key,
  angle: angleByKey[result.key],
  ok: result.ok,
  outputReference: result.outputReference,
  artifactPaths: result.artifactPaths,
  error: result.error
}));
const successful = researchHandoff.filter((result) => result.ok);
const failed = researchHandoff.filter((result) => !result.ok);

if (successful.length === 0) {
  return { state: "research-failed", research: researchHandoff, failedAngles: failed, audit: null };
}

const auditTask = [
  "Independently audit the decision-critical claims for QUESTION and DECISION.",
  "Read every successful research output reference below. Do not treat supplied citations as proof; inspect the underlying sources.",
  "Preserve contradictions and uncertainty for the parent. Report supported, contradicted, unclear, and missing-evidence claims plus implications for the conclusion.",
  "The handoff also lists failed or missing angles so you can identify coverage gaps:",
  JSON.stringify({ successful, failed }, null, 2)
].join("\n");

try {
  const audit = await runs.run("evidence-audit", {
    label: "Independent evidence audit",
    agent: "evidence-auditor",
    context: "fresh",
    task: auditTask,
    output: "audited-research/evidence-audit.md",
    outputMode: "file-only"
  });
  return { state: failed.length === 0 ? "complete" : "partial-research", research: researchHandoff, failedAngles: failed, audit };
} catch (error) {
  return {
    state: "audit-failed",
    research: researchHandoff,
    failedAngles: failed,
    audit: { ok: false, error: String(error) }
  };
}
```

Pass `async: true` on the enclosing `subagent` call. Do not add retries, follow-up research rounds, or contradiction-resolution runs. Let the ordinary async completion notification return control to the parent.

When the workflow completes, the parent must read the successful research and audit output references and synthesize the final answer. Keep failed or missing angles visible. If one lane failed, continue only when the successful evidence is sufficient and state the coverage gap. If every research lane failed, report that no audit was run and do not claim a research conclusion. If the auditor failed, the parent may still synthesize sufficient research but must clearly state that independent audit did not complete. Preserve material contradictions from both the researchers and auditor rather than silently resolving them.

Final synthesis:
- direct answer and decision implication
- strongest supported evidence
- contradictions and uncertainty
- failed or missing coverage
- independent audit status and findings
- recommended next step

Additional question, decision context, or requested angles from the slash command invocation:

$@
