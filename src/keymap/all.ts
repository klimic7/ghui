import { context } from "@ghui/keymap"
import { changedFilesModalKeymap, type ChangedFilesModalCtx } from "./changedFilesModal.ts"
import { closeModalKeymap, type CloseModalCtx } from "./closeModal.ts"
import { codexExplanationModalKeymap, type CodexExplanationModalCtx } from "./codexExplanationModal.ts"
import { codexQuestionModalKeymap, type CodexQuestionModalCtx } from "./codexQuestionModal.ts"
import { commandPaletteKeymap, type CommandPaletteCtx } from "./commandPalette.ts"
import { commentModalKeymap, type CommentModalCtx } from "./commentModal.ts"
import { commentsViewKeymap, type CommentsViewCtx } from "./commentsView.ts"
import { commentImplementationModalKeymap, type CommentImplementationModalCtx } from "./commentImplementationModal.ts"
import { commentThreadModalKeymap, type CommentThreadModalCtx } from "./commentThreadModal.ts"
import { deleteCommentModalKeymap, type DeleteCommentModalCtx } from "./deleteCommentModal.ts"
import { detailViewKeymap, type DetailViewCtx } from "./detailView.ts"
import { diffViewKeymap, type DiffViewCtx } from "./diffView.ts"
import { filterModalKeymap, type FilterModalCtx } from "./filterModal.ts"
import { filterModeKeymap, type FilterModeCtx } from "./filterMode.ts"
import { labelModalKeymap, type LabelModalCtx } from "./labelModal.ts"
import { listNavKeymap, type ListNavCtx } from "./listNav.ts"
import { mergeModalKeymap, type MergeModalCtx } from "./mergeModal.ts"
import { openRepositoryModalKeymap, type OpenRepositoryModalCtx } from "./openRepositoryModal.ts"
import { pullRequestStateModalKeymap, type PullRequestStateModalCtx } from "./pullRequestStateModal.ts"
import { submitReviewModalKeymap, type SubmitReviewModalCtx } from "./submitReviewModal.ts"
import { themeModalKeymap, type ThemeModalCtx } from "./themeModal.ts"

export interface AppCtx {
	// Active flags
	readonly closeModalActive: boolean
	readonly codexExplanationModalActive: boolean
	readonly codexQuestionModalActive: boolean
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

	// True whenever a modal/mode swallows raw text input (so q-quit, etc. are
	// disabled inside text-editing contexts).
	readonly textInputActive: boolean

	// Per-layer narrow contexts
	readonly closeModal: CloseModalCtx
	readonly codexExplanationModal: CodexExplanationModalCtx
	readonly codexQuestionModal: CodexQuestionModalCtx
	readonly commentImplementationModal: CommentImplementationModalCtx
	readonly pullRequestStateModal: PullRequestStateModalCtx
	readonly mergeModal: MergeModalCtx
	readonly commentThreadModal: CommentThreadModalCtx
	readonly changedFilesModal: ChangedFilesModalCtx
	readonly filterModal: FilterModalCtx
	readonly submitReviewModal: SubmitReviewModalCtx
	readonly labelModal: LabelModalCtx
	readonly themeModal: ThemeModalCtx
	readonly openRepositoryModal: OpenRepositoryModalCtx
	readonly commentModal: CommentModalCtx
	readonly deleteCommentModal: DeleteCommentModalCtx
	readonly commandPalette: CommandPaletteCtx
	readonly filterModeCtx: FilterModeCtx
	readonly diff: DiffViewCtx
	readonly detail: DetailViewCtx
	readonly commentsView: CommentsViewCtx
	readonly listNav: ListNavCtx

	// Always-on / app-level
	readonly openCommandPalette: () => void
	readonly handleQuitOrClose: () => void
}

const App = context<AppCtx>()

const modalActive = (a: AppCtx): boolean =>
	a.closeModalActive ||
	a.codexExplanationModalActive ||
	a.codexQuestionModalActive ||
	a.commentImplementationModalActive ||
	a.pullRequestStateModalActive ||
	a.mergeModalActive ||
	a.commentThreadModalActive ||
	a.changedFilesModalActive ||
	a.filterModalActive ||
	a.submitReviewModalActive ||
	a.labelModalActive ||
	a.themeModalActive ||
	a.openRepositoryModalActive ||
	a.commentModalActive ||
	a.deleteCommentModalActive ||
	a.commandPaletteActive

const inListMode = (a: AppCtx): boolean => !modalActive(a) && !a.filterMode && !a.diffFullView && !a.detailFullView && !a.commentsViewActive

export const appKeymap = App(
	// Always-on: command palette opener
	{ id: "command.open", title: "Open command palette", keys: ["ctrl+p", "meta+k"], run: (s) => s.openCommandPalette() },
	{ id: "command.open-help", title: "Open command palette", keys: ["?"], when: (s) => !s.textInputActive, run: (s) => s.openCommandPalette() },

	// Quit / close-active-modal — gated to "not editing text"
	{
		id: "app.quit-or-close",
		title: "Quit / close modal",
		keys: ["ctrl+c"],
		run: (s) => s.handleQuitOrClose(),
	},
	{
		id: "app.quit-or-close-q",
		title: "Quit / close modal",
		keys: ["q"],
		when: (s) => !s.textInputActive,
		run: (s) => s.handleQuitOrClose(),
	},

	// Modal layers
	closeModalKeymap.scope((a) => a.closeModalActive && a.closeModal),
	codexExplanationModalKeymap.scope((a) => a.codexExplanationModalActive && a.codexExplanationModal),
	codexQuestionModalKeymap.scope((a) => a.codexQuestionModalActive && a.codexQuestionModal),
	commentImplementationModalKeymap.scope((a) => a.commentImplementationModalActive && a.commentImplementationModal),
	pullRequestStateModalKeymap.scope((a) => a.pullRequestStateModalActive && a.pullRequestStateModal),
	mergeModalKeymap.scope((a) => a.mergeModalActive && a.mergeModal),
	commentThreadModalKeymap.scope((a) => a.commentThreadModalActive && a.commentThreadModal),
	changedFilesModalKeymap.scope((a) => a.changedFilesModalActive && a.changedFilesModal),
	filterModalKeymap.scope((a) => a.filterModalActive && a.filterModal),
	submitReviewModalKeymap.scope((a) => a.submitReviewModalActive && a.submitReviewModal),
	labelModalKeymap.scope((a) => a.labelModalActive && a.labelModal),
	themeModalKeymap.scope((a) => a.themeModalActive && a.themeModal),
	openRepositoryModalKeymap.scope((a) => a.openRepositoryModalActive && a.openRepositoryModal),
	commentModalKeymap.scope((a) => a.commentModalActive && a.commentModal),
	deleteCommentModalKeymap.scope((a) => a.deleteCommentModalActive && a.deleteCommentModal),
	commandPaletteKeymap.scope((a) => a.commandPaletteActive && a.commandPalette),
	filterModeKeymap.scope((a) => a.filterMode && a.filterModeCtx),

	// Full-view layers (only when no modal is on top)
	diffViewKeymap.scope((a) => a.diffFullView && !modalActive(a) && a.diff),
	detailViewKeymap.scope((a) => a.detailFullView && !modalActive(a) && a.detail),
	commentsViewKeymap.scope((a) => a.commentsViewActive && !modalActive(a) && a.commentsView),

	// PR list nav
	listNavKeymap.scope((a) => inListMode(a) && a.listNav),
)
