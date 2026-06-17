import type { AppCtx } from "../all.ts"
import { buildChangedFilesModalCtx, type BuildChangedFilesModalCtxInput } from "./changedFilesModalCtx.ts"
import { buildCommandPaletteCtx, type BuildCommandPaletteCtxInput } from "./commandPaletteCtx.ts"
import { buildCommentModalCtx, type BuildCommentModalCtxInput } from "./commentModalCtx.ts"
import { buildCommentsViewCtx, type BuildCommentsViewCtxInput } from "./commentsViewCtx.ts"
import { buildCommentThreadModalCtx, type BuildCommentThreadModalCtxInput } from "./commentThreadModalCtx.ts"
import { buildDetailViewCtx, type BuildDetailViewCtxInput } from "./detailViewCtx.ts"
import { buildDiffViewCtx, type BuildDiffViewCtxInput } from "./diffViewCtx.ts"
import { buildFilterModeCtx, type BuildFilterModeCtxInput } from "./filterModeCtx.ts"
import { buildListNavCtx, type BuildListNavCtxInput } from "./listNavCtx.ts"
import { buildMergeModalCtx, type BuildMergeModalCtxInput } from "./mergeModalCtx.ts"
import { buildPullRequestStateModalCtx, type BuildPullRequestStateModalCtxInput } from "./pullRequestStateModalCtx.ts"
import { buildSubmitReviewModalCtx, type BuildSubmitReviewModalCtxInput } from "./submitReviewModalCtx.ts"
import { buildThemeModalCtx, type BuildThemeModalCtxInput } from "./themeModalCtx.ts"

// Five modal contexts are pure rename adapters from App's local handler names
// to the keymap's expected method names. They live inline here rather than in
// their own files because the mapping is one line each and putting them in
// dedicated modules just added imports without adding clarity.

export interface BuildCloseModalCtxInput {
	readonly closeActiveModal: () => void
	readonly confirmCloseModal: () => void
}

export interface BuildCodexExplanationModalCtxInput {
	readonly halfPage: number
	readonly closeActiveModal: () => void
	readonly copyCodexExplanation: () => void
	readonly scrollCodexExplanation: (delta: number) => void
}

export interface BuildCommentImplementationModalCtxInput {
	readonly halfPage: number
	readonly closeActiveModal: () => void
	readonly confirmCommentImplementation: () => void
	readonly copyCommentImplementation: () => void
	readonly scrollCommentImplementation: (delta: number) => void
}

export interface BuildDeleteCommentModalCtxInput {
	readonly closeActiveModal: () => void
	readonly confirmDeleteComment: () => void
}

export interface BuildFilterModalCtxInput {
	readonly closeActiveModal: () => void
	readonly applySelected: () => void
	readonly moveSelection: (delta: -1 | 1) => void
}

export interface BuildLabelModalCtxInput {
	readonly closeActiveModal: () => void
	readonly toggleLabelAtIndex: () => void
	readonly moveLabelSelection: (delta: -1 | 1) => void
}

export interface BuildOpenRepositoryModalCtxInput {
	readonly closeActiveModal: () => void
	readonly openRepositoryFromInput: () => void
}

export interface BuildAppCtxFlags {
	readonly closeModalActive: boolean
	readonly codexExplanationModalActive: boolean
	readonly commentImplementationModalActive: boolean
	readonly pullRequestStateModalActive: boolean
	readonly mergeModalActive: boolean
	readonly commentThreadModalActive: boolean
	readonly changedFilesModalActive: boolean
	readonly filterModalActive: boolean
	readonly submitReviewModalActive: boolean
	readonly labelModalActive: boolean
	readonly themeModalActive: boolean
	readonly openRepositoryModalActive: boolean
	readonly commentModalActive: boolean
	readonly deleteCommentModalActive: boolean
	readonly commandPaletteActive: boolean
	readonly filterMode: boolean
	readonly diffFullView: boolean
	readonly detailFullView: boolean
	readonly commentsViewActive: boolean
	readonly textInputActive: boolean
}

export interface BuildAppCtxInput {
	readonly flags: BuildAppCtxFlags
	readonly closeModal: BuildCloseModalCtxInput
	readonly codexExplanationModal: BuildCodexExplanationModalCtxInput
	readonly commentImplementationModal: BuildCommentImplementationModalCtxInput
	readonly pullRequestStateModal: BuildPullRequestStateModalCtxInput
	readonly mergeModal: BuildMergeModalCtxInput
	readonly commentThreadModal: BuildCommentThreadModalCtxInput
	readonly changedFilesModal: BuildChangedFilesModalCtxInput
	readonly filterModal: BuildFilterModalCtxInput
	readonly submitReviewModal: BuildSubmitReviewModalCtxInput
	readonly labelModal: BuildLabelModalCtxInput
	readonly themeModal: BuildThemeModalCtxInput
	readonly openRepositoryModal: BuildOpenRepositoryModalCtxInput
	readonly commentModal: BuildCommentModalCtxInput
	readonly deleteCommentModal: BuildDeleteCommentModalCtxInput
	readonly commandPalette: BuildCommandPaletteCtxInput
	readonly filterModeCtx: BuildFilterModeCtxInput
	readonly diff: BuildDiffViewCtxInput
	readonly detail: BuildDetailViewCtxInput
	readonly commentsView: BuildCommentsViewCtxInput
	readonly listNav: BuildListNavCtxInput
	readonly openCommandPalette: () => void
	readonly handleQuitOrClose: () => void
}

export const buildAppCtx = (input: BuildAppCtxInput): AppCtx => ({
	...input.flags,
	closeModal: { closeModal: input.closeModal.closeActiveModal, confirmClose: input.closeModal.confirmCloseModal },
	codexExplanationModal: {
		halfPage: input.codexExplanationModal.halfPage,
		closeModal: input.codexExplanationModal.closeActiveModal,
		copy: input.codexExplanationModal.copyCodexExplanation,
		scrollBy: input.codexExplanationModal.scrollCodexExplanation,
	},
	commentImplementationModal: {
		halfPage: input.commentImplementationModal.halfPage,
		closeModal: input.commentImplementationModal.closeActiveModal,
		confirm: input.commentImplementationModal.confirmCommentImplementation,
		copy: input.commentImplementationModal.copyCommentImplementation,
		scrollBy: input.commentImplementationModal.scrollCommentImplementation,
	},
	pullRequestStateModal: buildPullRequestStateModalCtx(input.pullRequestStateModal),
	mergeModal: buildMergeModalCtx(input.mergeModal),
	commentThreadModal: buildCommentThreadModalCtx(input.commentThreadModal),
	changedFilesModal: buildChangedFilesModalCtx(input.changedFilesModal),
	filterModal: {
		closeModal: input.filterModal.closeActiveModal,
		applySelected: input.filterModal.applySelected,
		moveSelection: input.filterModal.moveSelection,
	},
	submitReviewModal: buildSubmitReviewModalCtx(input.submitReviewModal),
	labelModal: {
		closeModal: input.labelModal.closeActiveModal,
		toggleSelected: input.labelModal.toggleLabelAtIndex,
		moveSelection: input.labelModal.moveLabelSelection,
	},
	themeModal: buildThemeModalCtx(input.themeModal),
	openRepositoryModal: { closeModal: input.openRepositoryModal.closeActiveModal, openFromInput: input.openRepositoryModal.openRepositoryFromInput },
	commentModal: buildCommentModalCtx(input.commentModal),
	deleteCommentModal: { closeModal: input.deleteCommentModal.closeActiveModal, confirmDelete: input.deleteCommentModal.confirmDeleteComment },
	commandPalette: buildCommandPaletteCtx(input.commandPalette),
	filterModeCtx: buildFilterModeCtx(input.filterModeCtx),
	diff: buildDiffViewCtx(input.diff),
	detail: buildDetailViewCtx(input.detail),
	commentsView: buildCommentsViewCtx(input.commentsView),
	listNav: buildListNavCtx(input.listNav),
	openCommandPalette: input.openCommandPalette,
	handleQuitOrClose: input.handleQuitOrClose,
})
