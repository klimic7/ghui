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
	readonly pushRemote: string
	readonly commitMessage: string
	readonly replyBody: string
}

export interface ConfirmReviewCommentImplementationInput extends ImplementReviewCommentInput {
	readonly pushRemote: string
	readonly commitMessage: string
	readonly replyBody: string
	readonly expectedDiff: string
}

const repositoryRemotePattern = (repository: string) => new RegExp(`github\\.com[:/]${repository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\.git)?`, "i")
const repositoryName = (repository: string) => repository.split("/")[1]?.toLowerCase() ?? repository.toLowerCase()
const remoteRepositoryNames = (remotes: string): readonly string[] =>
	Array.from(remotes.matchAll(/github\.com[:/]([^/\s:]+)\/([^/\s]+?)(?:\.git)?(?:\s|$)/gi), (match) => match[2]?.toLowerCase()).filter((name): name is string => Boolean(name))
const checkoutMatchesRepository = (remotes: string, repository: string) =>
	repositoryRemotePattern(repository).test(remotes) || remoteRepositoryNames(remotes).includes(repositoryName(repository))
const splitNullSeparated = (value: string): readonly string[] => value.split("\0").filter((entry) => entry.length > 0)
const splitLines = (value: string): readonly string[] =>
	value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
const branchRemote = (upstream: string, headRefName: string): string | null => {
	if (!upstream.endsWith(`/${headRefName}`)) return null
	return upstream.slice(0, -headRefName.length - 1) || null
}

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

			const remoteHasBranch = Effect.fn("CodexCommentImplementer.remoteHasBranch")(function* (remote: string, headRefName: string) {
				const result = yield* command.run("git", ["ls-remote", "--heads", remote, headRefName])
				return result.stdout.trim().length > 0
			})

			const findPushRemote = Effect.fn("CodexCommentImplementer.findPushRemote")(function* (input: ImplementReviewCommentInput) {
				const upstream = yield* command.run("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { successExitCodes: [0, 128] })
				const upstreamRemote = upstream.exitCode === 0 ? branchRemote(upstream.stdout.trim(), input.headRefName) : null
				if (upstreamRemote && (yield* remoteHasBranch(upstreamRemote, input.headRefName))) return upstreamRemote

				const remotes = yield* command.run("git", ["remote"])
				for (const remote of splitLines(remotes.stdout)) {
					if (remote === upstreamRemote) continue
					if (yield* remoteHasBranch(remote, input.headRefName)) return remote
				}

				return yield* new CommandError({
					command: "git",
					args: ["ls-remote", "--heads", "<remote>", input.headRefName],
					detail: `Could not find a git remote containing PR head branch ${input.headRefName}. Add/fetch the PR head remote before implementing comments.`,
					cause: remotes.stdout,
				})
			})

			const ensureLocalCheckout = Effect.fn("CodexCommentImplementer.ensureLocalCheckout")(function* (input: ImplementReviewCommentInput) {
				const remotes = yield* command.run("git", ["remote", "-v"])
				if (!checkoutMatchesRepository(remotes.stdout, input.repository)) {
					return yield* new CommandError({
						command: "git",
						args: ["remote", "-v"],
						detail: `Current checkout does not look like ${input.repository}. Open ghui from that repository or from a fork with the same repository name before implementing comments.`,
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
				return yield* findPushRemote(input)
			})

			const implementReviewComment = Effect.fn("CodexCommentImplementer.implementReviewComment")(function* (input: ImplementReviewCommentInput) {
				const pushRemote = yield* ensureLocalCheckout(input)
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
				return { codexOutput: codex.stdout.trim(), diff, pushRemote, commitMessage, replyBody }
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
				yield* command.run("git", ["push", input.pushRemote, `HEAD:refs/heads/${input.headRefName}`])
				yield* github.replyToReviewComment(input.repository, input.number, input.commentId, input.replyBody)
				yield* github.resolveReviewThread(input.threadId)
			})

			return CodexCommentImplementer.of({ implementReviewComment, confirmReviewCommentImplementation })
		}),
	)

	static readonly layer = CodexCommentImplementer.layerNoDeps.pipe(Layer.provide(CommandRunner.layer), Layer.provide(GitHubService.layerNoDeps))
}
