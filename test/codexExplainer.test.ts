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
			filePatch: "diff --git a/src/App.tsx b/src/App.tsx\n@@ -10,2 +10,2 @@\n+const selected = true\n return selected",
		})

		expect(prompt).toContain("Odpověz česky")
		expect(prompt).toContain("lokální checkout")
		expect(prompt).toContain("čti relevantní soubory")
		expect(prompt).toContain("R10 +const selected = true")
		expect(prompt).toContain("R11  return selected")
		expect(prompt).toContain("Patch vybraného souboru")
		expect(prompt).toContain("diff --git a/src/App.tsx b/src/App.tsx")
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
		expect(prompt).toContain("lokální checkout")
		expect(prompt).toContain("Dej high-level shrnutí zobrazeného diffu")
		expect(prompt).toContain("- src/App.tsx")
		expect(prompt).toContain("diff --git a/src/App.tsx b/src/App.tsx")
	})

	test("builds a question prompt for a selected diff range", () => {
		const prompt = buildDiffExplanationPrompt({
			kind: "question",
			repository: "kitlangton/ghui",
			number: 12,
			title: "Ask about selected diff ranges",
			url: "https://github.com/kitlangton/ghui/pull/12",
			baseRefName: "main",
			headRefName: "question-range",
			question: "Proč se mění oba řádky?",
			path: "src/App.tsx",
			side: "RIGHT",
			line: null,
			selectedText: null,
			startLine: 20,
			endLine: 21,
			lines: [
				{ side: "RIGHT", kind: "addition", line: 20, text: "const first = true" },
				{ side: "RIGHT", kind: "addition", line: 21, text: "const second = true" },
			],
			filePatch: "diff --git a/src/App.tsx b/src/App.tsx\n@@ -20,0 +20,2 @@\n+const first = true\n+const second = true",
		})

		expect(prompt).toContain("Line: 20-21")
		expect(prompt).toContain("Vybrané diff řádky")
		expect(prompt).toContain("R20 +const first = true")
		expect(prompt).toContain("R21 +const second = true")
		expect(prompt).toContain("Proč se mění oba řádky?")
	})
})
