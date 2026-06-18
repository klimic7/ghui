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
	readonly files: readonly {
		readonly path: string
		readonly patch: string
	}[]
	readonly onProgress?: (message: string) => void
}

export interface ImplementReviewCommentResult {
	readonly codexOutput: string
	readonly diff: string
	readonly checkoutPath: string
	readonly pushRemote: string
	readonly commitMessage: string
	readonly replyBody: string
}

export interface ConfirmReviewCommentImplementationInput extends ImplementReviewCommentInput {
	readonly checkoutPath: string
	readonly pushRemote: string
	readonly commitMessage: string
	readonly replyBody: string
	readonly expectedDiff: string
}

const splitNullSeparated = (value: string): readonly string[] => value.split("\0").filter((entry) => entry.length > 0)
const splitLines = (value: string): readonly string[] =>
	value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
const repositoryRemotePattern = (repository: string) => new RegExp(`github\\.com[:/]${repository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\.git)?`, "i")
const branchRemote = (upstream: string, headRefName: string): string | null => {
	if (!upstream.endsWith(`/${headRefName}`)) return null
	return upstream.slice(0, -headRefName.length - 1) || null
}
const progress = (input: ImplementReviewCommentInput, message: string) => Effect.sync(() => input.onProgress?.(message))

const buildPrompt = (input: ImplementReviewCommentInput) => `Jsi Codex uvnitř lokálního checkoutu GitHub PR.

Úkol:
- Posuď vybraný review komentář.
- Review komentář neřeš izolovaně. Použij celý PR diff níže jako kontext a vyřeš celý problém, který komentář naznačuje.
- Pokud je komentář actionable, uprav kód tak, aby byl problém vyřešen konzistentně v celém relevantním rozsahu změn.
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

Změněné soubory v PR:
${input.files.map((file) => `- ${file.path}`).join("\n")}

Celý PR diff pro kontext:
\`\`\`diff
${input.files.map((file) => file.patch).join("\n")}
\`\`\`
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

			const currentReviewableDiff = Effect.fn("CodexCommentImplementer.currentReviewableDiff")(function* (checkoutPath: string) {
				const tracked = yield* command.run("git", ["diff", "--name-status"], { cwd: checkoutPath })
				const untracked = yield* command.run("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: checkoutPath })
				const untrackedSummary = splitNullSeparated(untracked.stdout).map((path) => `A\t${path}`)
				const summary = [tracked.stdout.trimEnd(), ...untrackedSummary].filter((part) => part.length > 0).join("\n")
				return summary.length > 0 ? `${summary}\n` : ""
			})

			const remoteHasBranch = Effect.fn("CodexCommentImplementer.remoteHasBranch")(function* (checkoutPath: string, remote: string, headRefName: string) {
				const result = yield* command.run("git", ["ls-remote", "--heads", remote, headRefName], { cwd: checkoutPath })
				return result.stdout.trim().length > 0
			})

			const findPushRemote = Effect.fn("CodexCommentImplementer.findPushRemote")(function* (checkoutPath: string, input: ImplementReviewCommentInput) {
				const upstream = yield* command.run("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { cwd: checkoutPath, successExitCodes: [0, 128] })
				const upstreamRemote = upstream.exitCode === 0 ? branchRemote(upstream.stdout.trim(), input.headRefName) : null
				if (upstreamRemote && (yield* remoteHasBranch(checkoutPath, upstreamRemote, input.headRefName))) return upstreamRemote

				const remoteBranches = yield* command.run("git", ["branch", "--remotes", "--list", `*/${input.headRefName}`], { cwd: checkoutPath })
				const remoteBranch = splitLines(remoteBranches.stdout)[0]
				const remoteFromFetchedBranch = remoteBranch ? branchRemote(remoteBranch.replace(/^\*?\s*/, ""), input.headRefName) : null
				if (remoteFromFetchedBranch) return remoteFromFetchedBranch

				const remotes = yield* command.run("git", ["remote"], { cwd: checkoutPath })
				for (const remote of splitLines(remotes.stdout)) {
					if (remote === upstreamRemote) continue
					if (yield* remoteHasBranch(checkoutPath, remote, input.headRefName)) return remote
				}

				return yield* new CommandError({
					command: "git",
					args: ["ls-remote", "--heads", "<remote>", input.headRefName],
					detail: `Could not find a git remote containing PR head branch ${input.headRefName}. Add/fetch the PR head remote before implementing comments.`,
					cause: remotes.stdout,
				})
			})

			const gitTopLevel = Effect.fn("CodexCommentImplementer.gitTopLevel")(function* (path: string) {
				const topLevel = yield* command.run("git", ["-C", path, "rev-parse", "--show-toplevel"], { successExitCodes: [0, 128] })
				return topLevel.exitCode === 0 ? topLevel.stdout.trim() : null
			})

			const currentCheckout = Effect.fn("CodexCommentImplementer.currentCheckout")(function* (input: ImplementReviewCommentInput) {
				yield* progress(input, "Checking current checkout")
				const checkoutPath = yield* gitTopLevel(process.cwd())
				if (!checkoutPath) {
					return yield* new CommandError({
						command: "git",
						args: ["rev-parse", "--show-toplevel"],
						detail: `Current directory is not a git checkout. To implement review comments, start ghui from the local checkout for ${input.repository}.`,
						cause: process.cwd(),
					})
				}
				const remotes = yield* command.run("git", ["remote", "-v"], { cwd: checkoutPath, successExitCodes: [0, 128] })
				if (remotes.exitCode !== 0 || !repositoryRemotePattern(input.repository).test(remotes.stdout)) {
					return yield* new CommandError({
						command: "git",
						args: ["remote", "-v"],
						detail: `Current checkout is not ${input.repository}. To implement review comments, start ghui from the local checkout for ${input.repository}.`,
						cause: remotes.stdout,
					})
				}
				return checkoutPath
			})

			const ensureLocalCheckout = Effect.fn("CodexCommentImplementer.ensureLocalCheckout")(function* (input: ImplementReviewCommentInput) {
				const checkoutPath = yield* currentCheckout(input)
				yield* progress(input, `Checking worktree in ${checkoutPath}`)
				const status = yield* command.run("git", ["status", "--porcelain"], { cwd: checkoutPath })
				if (status.stdout.trim().length > 0) {
					return yield* new CommandError({
						command: "git",
						args: ["status", "--porcelain"],
						detail: `Working tree is not clean in ${checkoutPath}. Commit or stash local changes before implementing a review comment.`,
						cause: status.stdout,
					})
				}
				const branch = yield* command.run("git", ["branch", "--show-current"], { cwd: checkoutPath, successExitCodes: [0, 128] })
				if (branch.exitCode !== 0 || branch.stdout.trim() !== input.headRefName) {
					yield* progress(input, "Checking out PR branch")
					yield* command.run("gh", ["pr", "checkout", String(input.number), "--repo", input.repository], { cwd: checkoutPath, timeoutMs: 120_000 })
				}
				yield* progress(input, "Resolving push remote")
				const pushRemote = yield* findPushRemote(checkoutPath, input)
				return { checkoutPath, pushRemote }
			})

			const implementReviewComment = Effect.fn("CodexCommentImplementer.implementReviewComment")(function* (input: ImplementReviewCommentInput) {
				const { checkoutPath, pushRemote } = yield* ensureLocalCheckout(input)
				yield* progress(input, "Running Codex")
				const codex = yield* command.run("codex", ["exec", "--skip-git-repo-check", "--sandbox", "workspace-write", "--ephemeral", "--color", "never", "-"], {
					cwd: checkoutPath,
					stdin: buildPrompt(input),
					timeoutMs: null,
				})
				yield* progress(input, "Collecting change summary")
				const diff = yield* currentReviewableDiff(checkoutPath)
				const commitMessage = `Address review comment on ${input.path}`
				const replyBody =
					diff.trim().length > 0
						? `Vyřešeno v navazujícím commitu: upravil jsem kód podle komentáře v \`${input.path}:${input.line}\`.`
						: `Prověřeno: Codex neprovedl žádnou změnu. ${codex.stdout.trim()}`.slice(0, 1000)
				return { codexOutput: codex.stdout.trim(), diff, checkoutPath, pushRemote, commitMessage, replyBody }
			})

			const confirmReviewCommentImplementation = Effect.fn("CodexCommentImplementer.confirmReviewCommentImplementation")(function* (
				input: ConfirmReviewCommentImplementationInput,
			) {
				const currentDiff = yield* currentReviewableDiff(input.checkoutPath)
				if (currentDiff !== input.expectedDiff) {
					return yield* new CommandError({
						command: "git",
						args: ["diff"],
						detail: "Working tree diff changed after Codex finished. Re-run the implementation before committing.",
						cause: currentDiff,
					})
				}
				yield* command.run("git", ["add", "-A"], { cwd: input.checkoutPath })
				yield* command.run("git", ["commit", "-m", input.commitMessage], { cwd: input.checkoutPath })
				yield* command.run("git", ["push", input.pushRemote, `HEAD:refs/heads/${input.headRefName}`], { cwd: input.checkoutPath })
				yield* github.replyToReviewComment(input.repository, input.number, input.commentId, input.replyBody)
				yield* github.resolveReviewThread(input.threadId)
			})

			return CodexCommentImplementer.of({ implementReviewComment, confirmReviewCommentImplementation })
		}),
	)

	static readonly layer = CodexCommentImplementer.layerNoDeps.pipe(Layer.provide(CommandRunner.layer), Layer.provide(GitHubService.layerNoDeps))
}
