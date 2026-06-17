import { context, type Scrollable, scrollCommands } from "@ghui/keymap"

export interface CommentsViewCtx extends Scrollable {
	readonly visibleCount: number
	readonly canEditSelected: boolean
	readonly closeCommentsView: () => void
	readonly openInBrowser: () => void
	readonly refresh: () => void
	readonly newComment: () => void
	readonly confirmSelection: () => void
	readonly editSelected: () => void
	readonly deleteSelected: () => void
	readonly implementSelected: () => void
}

const Comments = context<CommentsViewCtx>()

export const commentsViewKeymap = Comments(
	scrollCommands<CommentsViewCtx>(),
	{ id: "comments-view.close", title: "Close comments", keys: ["escape", "c"], run: (s) => s.closeCommentsView() },
	{ id: "comments-view.confirm", title: "Reply / new comment", keys: ["return"], run: (s) => s.confirmSelection() },
	{ id: "comments-view.new", title: "New comment", keys: ["a"], run: (s) => s.newComment() },
	{ id: "comments-view.open-browser", title: "Open in browser", keys: ["o"], run: (s) => s.openInBrowser() },
	{ id: "comments-view.refresh", title: "Refresh", keys: ["r"], run: (s) => s.refresh() },
	{ id: "comments-view.implement", title: "Implement comment", keys: ["i"], run: (s) => s.implementSelected() },
	{ id: "comments-view.edit", title: "Edit comment", keys: ["e"], when: (s) => s.canEditSelected, run: (s) => s.editSelected() },
	{ id: "comments-view.delete", title: "Delete comment", keys: ["x"], when: (s) => s.canEditSelected, run: (s) => s.deleteSelected() },
)
