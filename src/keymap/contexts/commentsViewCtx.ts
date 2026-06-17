import type { CommentsViewCtx } from "../commentsView.ts"

export interface BuildCommentsViewCtxInput {
	readonly halfPage: number
	readonly visibleCount: number
	readonly canEditSelected: boolean
	readonly moveCommentsSelection: (delta: number) => void
	readonly setCommentsSelection: (index: number) => void
	readonly closeCommentsView: () => void
	readonly openSelectedCommentInBrowser: () => void
	readonly refreshSelectedComments: () => void
	readonly confirmCommentSelection: () => void
	readonly runCommandById: (id: string) => void
}

export const buildCommentsViewCtx = ({
	halfPage,
	visibleCount,
	canEditSelected,
	moveCommentsSelection,
	setCommentsSelection,
	closeCommentsView,
	openSelectedCommentInBrowser,
	refreshSelectedComments,
	confirmCommentSelection,
	runCommandById,
}: BuildCommentsViewCtxInput): CommentsViewCtx => ({
	halfPage,
	scrollBy: moveCommentsSelection,
	scrollTo: setCommentsSelection,
	visibleCount,
	canEditSelected,
	closeCommentsView,
	openInBrowser: openSelectedCommentInBrowser,
	refresh: refreshSelectedComments,
	newComment: () => runCommandById("comments.new"),
	confirmSelection: confirmCommentSelection,
	implementSelected: () => runCommandById("comments.implement"),
	editSelected: () => runCommandById("comments.edit"),
	deleteSelected: () => runCommandById("comments.delete"),
})
