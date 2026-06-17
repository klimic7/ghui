import { describe, expect, test } from "bun:test"
import { buildDiffExplanationPrompt } from "../src/services/CodexExplainer.js"

describe("CodexExplainer", () => {
	test("builds a prompt scoped to the selected diff lines", () => {
		const prompt = buildDiffExplanationPrompt({
			kind: "range",
			repository: "kitlangton/ghui",
			number: 12,
			title: "Explain selected diff ranges",
			url: "https://github.com/kitlangton/ghui/pull/12",
			baseRefName: "main",
			headRefName: "explain-range",
			path: "src/App.tsx",
			side: "RIGHT",
			startLine: 10,
			endLine: 11,
			lines: [
				{ side: "RIGHT", kind: "addition", line: 10, text: "const selected = true" },
				{ side: "RIGHT", kind: "context", line: 11, text: "return selected" },
			],
		})

		expect(prompt).toContain("Odpověz česky")
		expect(prompt).toContain("Vysvětluj pouze vybrané řádky")
		expect(prompt).toContain("Nevyvozuj závěry ze zbytku diffu")
		expect(prompt).toContain("R10 +const selected = true")
		expect(prompt).toContain("R11  return selected")
		expect(prompt).not.toContain("diff --git")
	})

	test("builds a high-level prompt for the whole displayed diff", () => {
		const prompt = buildDiffExplanationPrompt({
			kind: "whole",
			repository: "kitlangton/ghui",
			number: 12,
			title: "Explain whole diff",
			url: "https://github.com/kitlangton/ghui/pull/12",
			baseRefName: "main",
			headRefName: "explain-whole",
			files: [
				{
					path: "src/App.tsx",
					patch: "diff --git a/src/App.tsx b/src/App.tsx\n@@ -1,1 +1,1 @@\n-old\n+new",
				},
			],
		})

		expect(prompt).toContain("Odpověz česky")
		expect(prompt).toContain("Dej high-level shrnutí celého diffu")
		expect(prompt).toContain("- src/App.tsx")
		expect(prompt).toContain("diff --git a/src/App.tsx b/src/App.tsx")
	})
})
