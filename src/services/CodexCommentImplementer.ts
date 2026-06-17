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
const dirname = (path: string) => path.replace(/\/+$/, "").replace(/\/[^/]*$/, "") || "/"
const repositoryRemotePattern = (repository: string) => new RegExp(`github\\.com[:/]${repository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\.git)?`, "i")
const repositoryName = (repository: string) => repository.split("/")[1]?.toLowerCase() ?? repository.toLowerCase()
const remoteRepositoryNames = (remotes: string): readonly string[] =>
	Array.from(remotes.matchAll(/github\.com[:/]([^/\s:]+)\/([^/\s]+?)(?:\.git)?(?:\s|$)/gi), (match) => match[2]?.toLowerCase()).filter((name): name is string => Boolean(name))
const checkoutRepositoryScore = (remotes: string, repository: string): number => {
	if (repositoryRemotePattern(repository).test(remotes)) return 2
	return remoteRepositoryNames(remotes).includes(repositoryName(repository)) ? 1 : 0
}
const branchRemote = (upstream: string, headRefName: string): string | null => {
	if (!upstream.endsWith(`/${headRefName}`)) return null
	return upstream.slice(0, -headRefName.length - 1) || null
}
const envPathList = (value: string | undefined): readonly string[] => (value ?? "").split(":").filter((entry) => entry.length > 0)
const checkoutSearchRoots = (): readonly string[] => {
	const home = process.env.HOME
	const commonRoots = home ? [`${home}/Work`, `${home}/work`, `${home}/Projects`, `${home}/projects`] : []
	const roots = [process.cwd(), ...envPathList(process.env.GHUI_REPO_ROOTS), ...commonRoots]
	return Array.from(new Set(roots))
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

			const currentReviewableDiff = Effect.fn("CodexCommentImplementer.currentReviewableDiff")(function* (checkoutPath: string) {
				const tracked = yield* command.run("git", ["diff", "--binary"], { cwd: checkoutPath })
				const untracked = yield* command.run("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: checkoutPath })
				const untrackedDiffs: string[] = []
				for (const path of splitNullSeparated(untracked.stdout)) {
					const diff = yield* command.run("git", ["diff", "--binary", "--no-index", "--", "/dev/null", path], { cwd: checkoutPath, successExitCodes: [0, 1] })
					if (diff.stdout.trim().length > 0) untrackedDiffs.push(diff.stdout)
				}
				return [tracked.stdout, ...untrackedDiffs].filter((part) => part.length > 0).join(tracked.stdout.length > 0 && untrackedDiffs.length > 0 ? "\n" : "")
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

			const discoverCheckouts = Effect.fn("CodexCommentImplementer.discoverCheckouts")(function* () {
				const candidates = new Set<string>()
				for (const root of checkoutSearchRoots()) {
					const topLevel = yield* gitTopLevel(root)
					if (topLevel) candidates.add(topLevel)
					const found = yield* command.run("find", [root, "-maxdepth", "5", "-type", "d", "-name", ".git", "-prune"], { successExitCodes: [0, 1] })
					for (const gitDir of splitLines(found.stdout)) candidates.add(dirname(gitDir))
				}
				return [...candidates]
			})

			const findCheckout = Effect.fn("CodexCommentImplementer.findCheckout")(function* (input: ImplementReviewCommentInput) {
				const matches: Array<{ readonly checkoutPath: string; readonly pushRemote: string; readonly currentBranchMatches: boolean; readonly repositoryScore: number }> = []
				for (const checkoutPath of yield* discoverCheckouts()) {
					const branch = yield* command.run("git", ["branch", "--show-current"], { cwd: checkoutPath, successExitCodes: [0, 128] })
					const currentBranchMatches = branch.exitCode === 0 && branch.stdout.trim() === input.headRefName
					const pushRemote = yield* findPushRemote(checkoutPath, input).pipe(Effect.catch(() => Effect.succeed(null)))
					if (!pushRemote) continue
					const remotes = yield* command.run("git", ["remote", "-v"], { cwd: checkoutPath, successExitCodes: [0, 128] })
					const repositoryScore = remotes.exitCode === 0 ? checkoutRepositoryScore(remotes.stdout, input.repository) : 0
					matches.push({ checkoutPath, pushRemote, currentBranchMatches, repositoryScore })
				}
				const match =
					matches.find((candidate) => candidate.repositoryScore > 0 && candidate.currentBranchMatches) ??
					matches.find((candidate) => candidate.repositoryScore > 0) ??
					matches.find((candidate) => candidate.currentBranchMatches) ??
					matches[0]
				if (match) return { checkoutPath: match.checkoutPath, pushRemote: match.pushRemote }
				return yield* new CommandError({
					command: "git",
					args: ["branch", "--remotes", "--list", `*/${input.headRefName}`],
					detail: `Could not find a local checkout with PR head branch ${input.headRefName}. Set GHUI_REPO_ROOTS to the parent directory containing your checkouts, or fetch the PR branch locally.`,
					cause: input.headRefName,
				})
			})

			const ensureLocalCheckout = Effect.fn("CodexCommentImplementer.ensureLocalCheckout")(function* (input: ImplementReviewCommentInput) {
				const checkout = yield* findCheckout(input)
				const status = yield* command.run("git", ["status", "--porcelain"], { cwd: checkout.checkoutPath })
				if (status.stdout.trim().length > 0) {
					return yield* new CommandError({
						command: "git",
						args: ["status", "--porcelain"],
						detail: `Working tree is not clean in ${checkout.checkoutPath}. Commit or stash local changes before implementing a review comment.`,
						cause: status.stdout,
					})
				}
				return checkout
			})

			const implementReviewComment = Effect.fn("CodexCommentImplementer.implementReviewComment")(function* (input: ImplementReviewCommentInput) {
				const { checkoutPath, pushRemote } = yield* ensureLocalCheckout(input)
				const codex = yield* command.run("codex", ["exec", "--skip-git-repo-check", "--sandbox", "workspace-write", "--ephemeral", "--color", "never", "-"], {
					cwd: checkoutPath,
					stdin: buildPrompt(input),
					timeoutMs: 180_000,
				})
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
