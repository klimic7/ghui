import { Context, Effect, Layer } from "effect"
import { CommandError, CommandRunner } from "./CommandRunner.js"
import { GitHubService, type GitHubError } from "./GitHubService.js"

export interface ImplementReviewCommentInput {
	readonly repository: string
	readonly number: number
	readonly title: string
	readonly headRefName: string
	readonly commentId: string
	readonly threadId: string
	readonly author: string
	readonly path: string
	readonly line: number
	readonly body: string
}

export interface ImplementReviewCommentResult {
	readonly codexOutput: string
	readonly diff: string
	readonly commitMessage: string
	readonly replyBody: string
}

export interface ConfirmReviewCommentImplementationInput extends ImplementReviewCommentInput {
	readonly commitMessage: string
	readonly replyBody: string
	readonly expectedDiff: string
}

const repositoryRemotePattern = (repository: string) => new RegExp(`github\\.com[:/]${repository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\.git)?`, "i")
const splitNullSeparated = (value: string): readonly string[] => value.split("\0").filter((entry) => entry.length > 0)

const buildPrompt = (input: ImplementReviewCommentInput) => `Jsi Codex uvnitř lokálního checkoutu GitHub PR.

Úkol:
- Posuď vybraný review komentář.
- Pokud je komentář actionable, uprav kód tak, aby byl problém vyřešen.
- Pokud změna nedává smysl nebo není bezpečná, neupravuj soubory a stručně vysvětli proč.
- Odpověz česky.

Pull request:
- Repository: ${input.repository}
- PR: #${input.number} ${input.title}
- Head branch: ${input.headRefName}

Review comment:
- Author: ${input.author}
- File: ${input.path}:${input.line}
- Comment id: ${input.commentId}

Komentář:
${input.body}
`

export class CodexCommentImplementer extends Context.Service<
	CodexCommentImplementer,
	{
		readonly implementReviewComment: (input: ImplementReviewCommentInput) => Effect.Effect<ImplementReviewCommentResult, CommandError>
		readonly confirmReviewCommentImplementation: (input: ConfirmReviewCommentImplementationInput) => Effect.Effect<void, CommandError | GitHubError>
	}
>()("ghui/CodexCommentImplementer") {
	static readonly layerNoDeps = Layer.effect(
		CodexCommentImplementer,
		Effect.gen(function* () {
			const command = yield* CommandRunner
			const github = yield* GitHubService

			const currentReviewableDiff = Effect.fn("CodexCommentImplementer.currentReviewableDiff")(function* () {
				const tracked = yield* command.run("git", ["diff", "--binary"])
				const untracked = yield* command.run("git", ["ls-files", "--others", "--exclude-standard", "-z"])
				const untrackedDiffs: string[] = []
				for (const path of splitNullSeparated(untracked.stdout)) {
					const diff = yield* command.run("git", ["diff", "--binary", "--no-index", "--", "/dev/null", path], { successExitCodes: [0, 1] })
					if (diff.stdout.trim().length > 0) untrackedDiffs.push(diff.stdout)
				}
				return [tracked.stdout, ...untrackedDiffs].filter((part) => part.length > 0).join(tracked.stdout.length > 0 && untrackedDiffs.length > 0 ? "\n" : "")
			})

			const ensureLocalCheckout = Effect.fn("CodexCommentImplementer.ensureLocalCheckout")(function* (input: ImplementReviewCommentInput) {
				const remotes = yield* command.run("git", ["remote", "-v"])
				if (!repositoryRemotePattern(input.repository).test(remotes.stdout)) {
					return yield* new CommandError({
						command: "git",
						args: ["remote", "-v"],
						detail: `Current checkout does not look like ${input.repository}. Open ghui from that repository before implementing comments.`,
						cause: remotes.stdout,
					})
				}
				const branch = yield* command.run("git", ["branch", "--show-current"])
				if (branch.stdout.trim() !== input.headRefName) {
					return yield* new CommandError({
						command: "git",
						args: ["branch", "--show-current"],
						detail: `Current branch is ${branch.stdout.trim() || "detached HEAD"}, but PR head branch is ${input.headRefName}. Check out the PR branch before implementing comments.`,
						cause: branch.stdout,
					})
				}
				const status = yield* command.run("git", ["status", "--porcelain"])
				if (status.stdout.trim().length > 0) {
					return yield* new CommandError({
						command: "git",
						args: ["status", "--porcelain"],
						detail: "Working tree is not clean. Commit or stash local changes before implementing a review comment.",
						cause: status.stdout,
					})
				}
			})

			const implementReviewComment = Effect.fn("CodexCommentImplementer.implementReviewComment")(function* (input: ImplementReviewCommentInput) {
				yield* ensureLocalCheckout(input)
				const codex = yield* command.run("codex", ["exec", "--skip-git-repo-check", "--sandbox", "workspace-write", "--ephemeral", "--color", "never", "-"], {
					stdin: buildPrompt(input),
					timeoutMs: 180_000,
				})
				const diff = yield* currentReviewableDiff()
				const commitMessage = `Address review comment on ${input.path}`
				const replyBody =
					diff.trim().length > 0
						? `Vyřešeno v navazujícím commitu: upravil jsem kód podle komentáře v \`${input.path}:${input.line}\`.`
						: `Prověřeno: Codex neprovedl žádnou změnu. ${codex.stdout.trim()}`.slice(0, 1000)
				return { codexOutput: codex.stdout.trim(), diff, commitMessage, replyBody }
			})

			const confirmReviewCommentImplementation = Effect.fn("CodexCommentImplementer.confirmReviewCommentImplementation")(function* (
				input: ConfirmReviewCommentImplementationInput,
			) {
				const currentDiff = yield* currentReviewableDiff()
				if (currentDiff !== input.expectedDiff) {
					return yield* new CommandError({
						command: "git",
						args: ["diff"],
						detail: "Working tree diff changed after Codex finished. Re-run the implementation before committing.",
						cause: currentDiff,
					})
				}
				yield* command.run("git", ["add", "-A"])
				yield* command.run("git", ["commit", "-m", input.commitMessage])
				yield* command.run("git", ["push"])
				yield* github.replyToReviewComment(input.repository, input.number, input.commentId, input.replyBody)
				yield* github.resolveReviewThread(input.threadId)
			})

			return CodexCommentImplementer.of({ implementReviewComment, confirmReviewCommentImplementation })
		}),
	)

	static readonly layer = CodexCommentImplementer.layerNoDeps.pipe(Layer.provide(CommandRunner.layer), Layer.provide(GitHubService.layerNoDeps))
}
