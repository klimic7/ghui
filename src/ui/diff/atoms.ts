import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { DiffCommentSide, PullRequestReviewComment } from "../../domain.js"
import { loadStoredDiffWhitespaceMode } from "../../themeStore.js"
import type { ReviewedDiffFilesInput, ReviewedPullRequestInput } from "../../services/CacheService.js"
import { CacheService } from "../../services/CacheService.js"
import { GitHubService } from "../../services/GitHubService.js"
import { githubRuntime } from "../../services/runtime.js"
import { parsePullRequestRevisionAtomKey, selectedPullRequestAtom } from "../pullRequests/atoms.js"
import { type DiffView, type DiffWhitespaceMode, type DiffWrapMode, type PullRequestDiffState, pullRequestDiffKey } from "../diff.js"

export const initialDiffWhitespaceMode = await Effect.runPromise(loadStoredDiffWhitespaceMode)

// === UI state atoms ===
export const diffFullViewAtom = Atom.make(false)
export const diffFileIndexAtom = Atom.make(0)
export const diffScrollTopAtom = Atom.make(0)
export const diffRenderViewAtom = Atom.make<DiffView>("unified")
export const diffWrapModeAtom = Atom.make<DiffWrapMode>("none")
export const diffWhitespaceModeAtom = Atom.make<DiffWhitespaceMode>(initialDiffWhitespaceMode)
export const diffCommentAnchorIndexAtom = Atom.make(0)
export const diffPreferredSideAtom = Atom.make<DiffCommentSide | null>(null)
export const diffCommentRangeStartIndexAtom = Atom.make<number | null>(null)
export const diffCommentThreadsAtom = Atom.make<Record<string, readonly PullRequestReviewComment[]>>({}).pipe(Atom.keepAlive)
export const diffCommentsLoadedAtom = Atom.make<Record<string, "loading" | "ready">>({}).pipe(Atom.keepAlive)
export const reviewedDiffLinesAtom = Atom.make<Record<string, Record<string, true>>>({}).pipe(Atom.keepAlive)
export const pullRequestDiffCacheAtom = Atom.make<Record<string, PullRequestDiffState>>({}).pipe(Atom.keepAlive)

// === Data-fetching atoms ===
export const pullRequestDiffAtom = Atom.family((key: string) => {
	const { repository, number } = parsePullRequestRevisionAtomKey(key, "diff")
	return githubRuntime.atom(GitHubService.use((github) => github.getPullRequestDiff(repository, number)))
})

export const listPullRequestReviewCommentsAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number }>()((input) =>
	GitHubService.use((github) => github.listPullRequestReviewComments(input.repository, input.number)),
)
export const readReviewedDiffFilesAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number }>()((input) =>
	CacheService.use((cache) => cache.readReviewedDiffFiles(input)),
)
export const writeReviewedDiffFilesAtom = githubRuntime.fn<ReviewedDiffFilesInput>()((input) => CacheService.use((cache) => cache.writeReviewedDiffFiles(input)))
export const readReviewedPullRequestKeysAtom = githubRuntime.fn<void>()(() => CacheService.use((cache) => cache.readReviewedPullRequestKeys()))
export const writeReviewedPullRequestAtom = githubRuntime.fn<ReviewedPullRequestInput>()((input) => CacheService.use((cache) => cache.writeReviewedPullRequest(input)))

// === Derived selection atoms ===
export const selectedDiffKeyAtom = Atom.make((get) => {
	const pullRequest = get(selectedPullRequestAtom)
	return pullRequest ? pullRequestDiffKey(pullRequest) : null
})

export const selectedDiffStateAtom = Atom.make((get) => {
	const key = get(selectedDiffKeyAtom)
	if (!key) return undefined
	return get(pullRequestDiffCacheAtom)[key]
})

export const diffReadyAtom = Atom.make((get) => get(selectedDiffStateAtom)?._tag === "Ready")
