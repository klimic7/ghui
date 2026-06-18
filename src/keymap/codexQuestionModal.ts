import { context } from "@ghui/keymap"

export interface CodexQuestionModalCtx {
	readonly closeModal: () => void
	readonly submit: () => void
	readonly clear: () => void
	readonly deleteWord: () => void
}

const CodexQuestion = context<CodexQuestionModalCtx>()

export const codexQuestionModalKeymap = CodexQuestion(
	{ id: "codex-question.close", title: "Cancel", keys: ["escape"], run: (s) => s.closeModal() },
	{ id: "codex-question.submit", title: "Ask", keys: ["return"], run: (s) => s.submit() },
	{ id: "codex-question.clear", title: "Clear", keys: ["ctrl+u"], run: (s) => s.clear() },
	{ id: "codex-question.delete-word", title: "Delete word", keys: ["ctrl+w"], run: (s) => s.deleteWord() },
)
