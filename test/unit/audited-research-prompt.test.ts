import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runWorkflowScript, type RunWorkflowScriptOptions } from "../../src/workflows/scripted-workflow.ts";

const prompt = readFileSync(join(process.cwd(), "prompts/audited-research.md"), "utf-8");
const script = prompt.match(/```js\n([\s\S]*?)\n```/)?.[1] ?? "";
type WorkflowLaunchParams = Parameters<RunWorkflowScriptOptions["launch"]>[1];

describe("audited-research prompt", () => {
	it("keeps orchestration and synthesis ownership explicit", () => {
		assert.match(prompt, /two or three distinct research angles/i);
		assert.match(prompt, /one `runs\.all\(\[\.\.\.\]\)` batch/);
		assert.match(prompt, /context: "fresh"/);
		assert.match(prompt, /Use `researcher` for external sources/);
		assert.match(prompt, /Use `scout` only.*local repository context/);
		assert.match(prompt, /agent: "evidence-auditor"/);
		assert.match(prompt, /parent must read.*synthesize the final answer/i);
		assert.match(prompt, /Do not launch a synthesis subagent/);
		assert.match(prompt, /Preserve material contradictions.*rather than silently resolving them/i);
		assert.match(prompt, /outputReference/);
		assert.match(prompt, /outputMode: "file-only"/);
		assert.match(prompt, /async: true/);
		assert.doesNotMatch(prompt, /research-synthesizer|deep-research/);
	});

	it("passes successful and failed research lanes to a fresh downstream auditor", async () => {
		const launches: Array<{ key: string; params: WorkflowLaunchParams }> = [];
		const result = await runWorkflowScript({
			script,
			async launch(key, params) {
				launches.push({ key, params });
				if (key === "research-tradeoffs") {
					return { key, ok: false, output: "lane failed", error: "lane failed", artifactPaths: [] };
				}
				return {
					key,
					ok: true,
					output: `${key} complete`,
					outputReference: `/tmp/${key}.md`,
					artifactPaths: [],
				};
			},
			async status(key) { return { key, ok: true, output: "ok", artifactPaths: [] }; },
		});

		assert.deepEqual(launches.map(({ key }) => key), [
			"research-primary-sources",
			"research-tradeoffs",
			"research-local-context",
			"evidence-audit",
		]);
		for (const launch of launches) assert.equal(launch.params.context, "fresh");
		assert.deepEqual(launches.slice(0, 3).map(({ params }) => params.agent), ["researcher", "researcher", "scout"]);
		assert.equal(launches[3]?.params.agent, "evidence-auditor");
		assert.match(String(launches[3]?.params.task), /research-primary-sources/);
		assert.match(String(launches[3]?.params.task), /research-tradeoffs/);
		assert.match(String(launches[3]?.params.task), /counterevidence and practical tradeoffs/);
		assert.match(String(launches[3]?.params.task), /lane failed/);
		// SAFETY: The exercised workflow script returns this object shape on the partial-research branch.
		assert.equal((result.value as { state: string }).state, "partial-research");
	});

	it("skips the auditor when all research lanes fail", async () => {
		const launches: string[] = [];
		const result = await runWorkflowScript({
			script,
			async launch(key) {
				launches.push(key);
				return { key, ok: false, output: "failed", error: `${key} failed`, artifactPaths: [] };
			},
			async status(key) { return { key, ok: true, output: "ok", artifactPaths: [] }; },
		});

		assert.deepEqual(launches, ["research-primary-sources", "research-tradeoffs", "research-local-context"]);
		// SAFETY: The exercised workflow script returns this object shape on the all-failed branch.
		const value = result.value as { state: string; audit: unknown };
		assert.equal(value.state, "research-failed");
		assert.equal(value.audit, null);
	});

	it("returns the research handoff when the auditor fails", async () => {
		const result = await runWorkflowScript({
			script,
			async launch(key) {
				if (key === "evidence-audit") return { key, ok: false, output: "audit failed", error: "audit failed", artifactPaths: [] };
				return { key, ok: true, output: "complete", outputReference: `/tmp/${key}.md`, artifactPaths: [] };
			},
			async status(key) { return { key, ok: true, output: "ok", artifactPaths: [] }; },
		});

		// SAFETY: The exercised workflow script returns this object shape from its caught auditor failure.
		const value = result.value as { state: string; research: unknown[]; audit: unknown };
		assert.equal(value.state, "audit-failed");
		assert.equal(value.research.length, 3);
		assert.deepEqual(value.audit, { ok: false, error: "Error: Run 'evidence-audit' failed: audit failed" });
	});
});
