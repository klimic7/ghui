import type { PullRequestItem, SubmitPullRequestReviewInput } from "../domain.js"
import { BrowserOpener } from "./BrowserOpener.js"
import { Clipboard } from "./Clipboard.js"
import { CodexExplainer, type ExplainDiffInput } from "./CodexExplainer.js"
import { CodexCommentImplementer, type ConfirmReviewCommentImplementationInput, type ImplementReviewCommentInput } from "./CodexCommentImplementer.js"
import { GitHubService } from "./GitHubService.js"
import { githubRuntime } from "./runtime.js"

export const submitPullRequestReviewAtom = githubRuntime.fn<SubmitPullRequestReviewInput>()((input) => GitHubService.use((github) => github.submitPullRequestReview(input)))
export const copyToClipboardAtom = githubRuntime.fn<string>()((text) => Clipboard.use((clipboard) => clipboard.copy(text)))
export const openInBrowserAtom = githubRuntime.fn<PullRequestItem>()((pullRequest) => BrowserOpener.use((browser) => browser.openPullRequest(pullRequest)))
export const openUrlAtom = githubRuntime.fn<string>()((url) => BrowserOpener.use((browser) => browser.openUrl(url)))
export const explainDiffSelectionAtom = githubRuntime.fn<ExplainDiffInput>()((input) => CodexExplainer.use((codex) => codex.explainDiffSelection(input)))
export const implementReviewCommentAtom = githubRuntime.fn<ImplementReviewCommentInput>()((input) => CodexCommentImplementer.use((codex) => codex.implementReviewComment(input)))
export const confirmReviewCommentImplementationAtom = githubRuntime.fn<ConfirmReviewCommentImplementationInput>()((input) =>
	CodexCommentImplementer.use((codex) => codex.confirmReviewCommentImplementation(input)),
)
