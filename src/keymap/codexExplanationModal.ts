import { context } from "@ghui/keymap"

export interface CodexExplanationModalCtx {
	readonly halfPage: number
	readonly closeModal: () => void
	readonly copy: () => void
	readonly scrollBy: (delta: number) => void
}

const CodexExplanation = context<CodexExplanationModalCtx>()

export const codexExplanationModalKeymap = CodexExplanation(
	{ id: "codex-explanation.close", title: "Close explanation", keys: ["escape"], run: (s) => s.closeModal() },
	{ id: "codex-explanation.copy", title: "Copy explanation", keys: ["y"], run: (s) => s.copy() },
	{ id: "codex-explanation.up", title: "Up", keys: ["k", "up"], run: (s) => s.scrollBy(-1) },
	{ id: "codex-explanation.down", title: "Down", keys: ["j", "down"], run: (s) => s.scrollBy(1) },
	{ id: "codex-explanation.half-up", title: "Half page up", keys: ["pageup", "ctrl+u"], run: (s) => s.scrollBy(-s.halfPage) },
	{
		id: "codex-explanation.half-down",
		title: "Half page down",
		keys: ["pagedown", "ctrl+d", "ctrl+v"],
		run: (s) => s.scrollBy(s.halfPage),
	},
)
