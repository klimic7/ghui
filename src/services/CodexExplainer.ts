import { Context, Effect, Layer } from "effect"
import { CommandRunner, type CommandError } from "./CommandRunner.js"

export interface CodexDiffLine {
	readonly side: "LEFT" | "RIGHT"
	readonly kind: "addition" | "deletion" | "context"
	readonly line: number
	readonly text: string
}

export interface ExplainDiffBaseInput {
	readonly repository: string
	readonly number: number
	readonly title: string
	readonly url: string
	readonly baseRefName: string
	readonly headRefName: string
}

export interface ExplainDiffSelectionInput extends ExplainDiffBaseInput {
	readonly kind: "range"
	readonly path: string
	readonly side: "LEFT" | "RIGHT"
	readonly startLine: number
	readonly endLine: number
	readonly lines: readonly CodexDiffLine[]
}

export interface ExplainWholeDiffInput extends ExplainDiffBaseInput {
	readonly kind: "whole"
	readonly files: readonly {
		readonly path: string
		readonly patch: string
	}[]
}

export type ExplainDiffInput = ExplainDiffSelectionInput | ExplainWholeDiffInput

const linePrefix = (line: CodexDiffLine) => (line.kind === "addition" ? "+" : line.kind === "deletion" ? "-" : " ")
const sideLabel = (side: "LEFT" | "RIGHT") => (side === "LEFT" ? "old/LEFT" : "new/RIGHT")

const prMetadata = (input: ExplainDiffBaseInput) => `Pull request:
- Repository: ${input.repository}
- PR: #${input.number} ${input.title}
- URL: ${input.url}
- Base: ${input.baseRefName}
- Head: ${input.headRefName}`

const buildDiffSelectionExplanationPrompt = (input: ExplainDiffSelectionInput) => `Vysvětluješ vybraný rozsah diffu z GitHub pull requestu uvnitř terminálového UI.

Důležité podmínky:
- Odpověz česky.
- Vysvětluj pouze vybrané řádky uvedené níže.
- Nevyvozuj závěry ze zbytku diffu. Ten jsi nedostal.
- Pokud z těchto řádků není širší účel jasný, řekni, co jasné je a co jasné není.
- Buď stručný a praktický. Zmiň chování, pravděpodobný důvod a review rizika.

${prMetadata(input)}

Vybraný rozsah:
- File: ${input.path}
- Side: ${sideLabel(input.side)}
- Lines: ${input.startLine}-${input.endLine}

Pouze vybrané diff řádky:
\`\`\`diff
${input.lines.map((line) => `${line.side === "LEFT" ? "L" : "R"}${line.line} ${linePrefix(line)}${line.text}`).join("\n")}
\`\`\`
`

const buildWholeDiffExplanationPrompt = (input: ExplainWholeDiffInput) => `Vysvětluješ celý zobrazený diff z GitHub pull requestu uvnitř terminálového UI.

Důležité podmínky:
- Odpověz česky.
- Dej high-level shrnutí celého diffu.
- Zaměř se na to, co se mění, proč to pravděpodobně existuje, a jaká jsou review rizika.
- Buď stručný a praktický.

${prMetadata(input)}

Změněné soubory:
${input.files.map((file) => `- ${file.path}`).join("\n")}

Celý zobrazený diff:
\`\`\`diff
${input.files.map((file) => file.patch).join("\n")}
\`\`\`
`

export const buildDiffExplanationPrompt = (input: ExplainDiffInput) =>
	input.kind === "range" ? buildDiffSelectionExplanationPrompt(input) : buildWholeDiffExplanationPrompt(input)

export class CodexExplainer extends Context.Service<
	CodexExplainer,
	{
		readonly explainDiffSelection: (input: ExplainDiffInput) => Effect.Effect<string, CommandError>
	}
>()("ghui/CodexExplainer") {
	static readonly layerNoDeps = Layer.effect(
		CodexExplainer,
		Effect.gen(function* () {
			const command = yield* CommandRunner
			const explainDiffSelection = Effect.fn("CodexExplainer.explainDiffSelection")(function* (input: ExplainDiffInput) {
				const prompt = buildDiffExplanationPrompt(input)
				const result = yield* command.run("codex", ["exec", "--skip-git-repo-check", "--cd", "/tmp", "--sandbox", "read-only", "--ephemeral", "--color", "never", "-"], {
					stdin: prompt,
					timeoutMs: 120_000,
				})
				return result.stdout.trim()
			})

			return CodexExplainer.of({ explainDiffSelection })
		}),
	)

	static readonly layer = CodexExplainer.layerNoDeps.pipe(Layer.provide(CommandRunner.layer))
}
