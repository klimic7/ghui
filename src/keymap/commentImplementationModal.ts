import { context } from "@ghui/keymap"

export interface CommentImplementationModalCtx {
	readonly halfPage: number
	readonly closeModal: () => void
	readonly confirm: () => void
	readonly copy: () => void
	readonly scrollBy: (delta: number) => void
}

const Impl = context<CommentImplementationModalCtx>()

export const commentImplementationModalKeymap = Impl(
	{ id: "comment-implementation.close", title: "Close implementation", keys: ["escape"], run: (s) => s.closeModal() },
	{ id: "comment-implementation.confirm", title: "Commit, push, reply, resolve", keys: ["return"], run: (s) => s.confirm() },
	{ id: "comment-implementation.copy", title: "Copy Codex response", keys: ["y"], run: (s) => s.copy() },
	{ id: "comment-implementation.up", title: "Up", keys: ["k", "up"], run: (s) => s.scrollBy(-1) },
	{ id: "comment-implementation.down", title: "Down", keys: ["j", "down"], run: (s) => s.scrollBy(1) },
	{ id: "comment-implementation.half-up", title: "Half page up", keys: ["pageup", "ctrl+u"], run: (s) => s.scrollBy(-s.halfPage) },
	{ id: "comment-implementation.half-down", title: "Half page down", keys: ["pagedown", "ctrl+d", "ctrl+v"], run: (s) => s.scrollBy(s.halfPage) },
)
