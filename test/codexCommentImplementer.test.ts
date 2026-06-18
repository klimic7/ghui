import { describe, expect, test } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { CommandRunner, type CommandResult, type RunOptions } from "../src/services/CommandRunner.ts"
import { CodexCommentImplementer } from "../src/services/CodexCommentImplementer.ts"
import { MockGitHubService } from "../src/services/MockGitHubService.ts"

interface RecordedCall {
	readonly command: string
	readonly args: readonly string[]
	readonly options?: RunOptions
}

interface FakeCommandRunnerOptions {
	readonly currentBranch?: string
	readonly remoteBranchAvailable?: boolean
	readonly gitTopLevel?: string | null
	readonly remoteRepository?: string
}

const fakeCommandRunner = (recorder: RecordedCall[], options: FakeCommandRunnerOptions = {}) => {
	let checkedOut = false
	const remoteBranchAvailable = () => checkedOut || (options.remoteBranchAvailable ?? true)
	return Layer.succeed(
		CommandRunner,
		CommandRunner.of({
			run: (command, args, runOptions) => {
				recorder.push({ command, args: [...args], ...(runOptions ? { options: runOptions } : {}) })
				const topLevel = options.gitTopLevel === undefined ? "/workspace/repo" : options.gitTopLevel
				if (command === "git" && args[0] === "-C" && args.slice(2).join(" ") === "rev-parse --show-toplevel") {
					return Effect.succeed({ stdout: topLevel ? `${topLevel}\n` : "", stderr: "", exitCode: topLevel ? 0 : 128 })
				}
				const stdout = (() => {
					if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") return "/workspace/repo\n"
					if (command === "git" && args.join(" ") === "branch --show-current") return checkedOut ? "feature/review\n" : `${options.currentBranch ?? "feature/review"}\n`
					if (command === "git" && args.join(" ") === "status --porcelain") return ""
					if (command === "git" && args.join(" ") === "rev-parse --abbrev-ref --symbolic-full-name @{u}") return "origin/feature/review\n"
					if (command === "git" && args.join(" ") === "remote -v") {
						const repository = options.remoteRepository ?? "owner/repo"
						return `origin\tgit@github.com:${repository}.git (fetch)\norigin\tgit@github.com:${repository}.git (push)\n`
					}
					if (command === "git" && args.join(" ") === "remote") return "origin\nupstream\n"
					if (command === "git" && args.join(" ") === "branch --remotes --list */feature/review") return remoteBranchAvailable() ? "origin/feature/review\n" : ""
					if (command === "git" && args.join(" ") === "ls-remote --heads origin feature/review") return remoteBranchAvailable() ? "abc123\trefs/heads/feature/review\n" : ""
					if (command === "git" && args[0] === "ls-remote") return ""
					if (command === "gh" && args.join(" ") === "pr checkout 42 --repo owner/repo") {
						checkedOut = true
						return ""
					}
					if (command === "codex") return "Upravil jsem implementaci."
					if (command === "git" && args.join(" ") === "diff --name-status") return "M\tsrc/existing.ts\n"
					if (command === "git" && args.join(" ") === "ls-files --others --exclude-standard -z") return "src/new.ts\0"
					return ""
				})()
				const result: CommandResult = { stdout, stderr: "", exitCode: 0 }
				return Effect.succeed(result)
			},
			runSchema: <S extends Schema.Top>() => Effect.die("runSchema is not used in this test") as Effect.Effect<S["Type"], never, S["DecodingServices"]>,
		}),
	)
}

const runWith = <A>(effect: Effect.Effect<A, unknown, CodexCommentImplementer>, recorder: RecordedCall[], options?: FakeCommandRunnerOptions) => {
	const githubLayer = MockGitHubService.layer({ prCount: 1, repository: "owner/repo", repositories: ["owner/repo"], username: "kit" })
	const layer = CodexCommentImplementer.layerNoDeps.pipe(Layer.provide(githubLayer), Layer.provide(fakeCommandRunner(recorder, options)))
	return Effect.runPromise(effect.pipe(Effect.provide(layer)) as Effect.Effect<A>)
}

const reviewCommentInput = (repository = "owner/repo") => ({
	repository,
	number: 42,
	title: "Review fixes",
	headRefName: "feature/review",
	commentId: "100",
	threadId: "PRRT_100",
	author: "reviewer",
	path: "src/existing.ts",
	line: 1,
	body: "Please extract this.",
	files: [
		{
			path: "src/existing.ts",
			patch: "diff --git a/src/existing.ts b/src/existing.ts\n@@ -1 +1 @@\n-before\n+after\n",
		},
		{
			path: "src/related.ts",
			patch: "diff --git a/src/related.ts b/src/related.ts\n@@ -1 +1 @@\n-old related\n+new related\n",
		},
	],
})

describe("CodexCommentImplementer", () => {
	test("includes untracked files in the reviewed diff", async () => {
		const recorder: RecordedCall[] = []
		const result = await runWith(
			CodexCommentImplementer.use((codex) => codex.implementReviewComment(reviewCommentInput())),
			recorder,
		)

		expect(result.diff).toContain("M\tsrc/existing.ts")
		expect(result.diff).toContain("A\tsrc/new.ts")
		expect(result.checkoutPath).toBe("/workspace/repo")
		expect(result.pushRemote).toBe("origin")
		expect(recorder.some((call) => call.command === "git" && call.args.includes("--no-index"))).toBe(false)
		expect(recorder.some((call) => call.command === "find")).toBe(false)
		const codexCall = recorder.find((call) => call.command === "codex")
		expect(codexCall?.options?.timeoutMs).toBe(null)
		expect(codexCall?.options?.stdin).toContain("Celý PR diff pro kontext")
		expect(codexCall?.options?.stdin).toContain("diff --git a/src/related.ts b/src/related.ts")
	})

	test("reports implementation progress phases", async () => {
		const recorder: RecordedCall[] = []
		const phases: string[] = []
		await runWith(
			CodexCommentImplementer.use((codex) => codex.implementReviewComment({ ...reviewCommentInput(), onProgress: (phase) => phases.push(phase) })),
			recorder,
		)

		expect(phases).toContain("Checking current checkout")
		expect(phases).toContain("Running Codex")
		expect(phases).toContain("Collecting change summary")
	})

	test("fails when ghui is not running from the expected repository checkout", async () => {
		const recorder: RecordedCall[] = []
		const error = await runWith(
			CodexCommentImplementer.use((codex) => codex.implementReviewComment(reviewCommentInput())),
			recorder,
			{ remoteRepository: "other/repo" },
		).catch((error: unknown) => error as { readonly detail?: string })

		expect(error.detail).toContain("Current checkout is not owner/repo")
		expect(recorder.some((call) => call.command === "codex")).toBe(false)
	})

	test("fails when ghui is not running inside a git checkout", async () => {
		const recorder: RecordedCall[] = []
		const error = await runWith(
			CodexCommentImplementer.use((codex) => codex.implementReviewComment(reviewCommentInput())),
			recorder,
			{ gitTopLevel: null },
		).catch((error: unknown) => error as { readonly detail?: string })

		expect(error.detail).toContain("Current directory is not a git checkout")
		expect(recorder.some((call) => call.command === "codex")).toBe(false)
	})

	test("checks out the PR branch when only the repository checkout is available", async () => {
		const recorder: RecordedCall[] = []
		const result = await runWith(
			CodexCommentImplementer.use((codex) => codex.implementReviewComment(reviewCommentInput())),
			recorder,
			{
				currentBranch: "main",
				remoteBranchAvailable: false,
			},
		)

		expect(result.checkoutPath).toBe("/workspace/repo")
		expect(result.pushRemote).toBe("origin")
		expect(recorder.some((call) => call.command === "gh" && call.args.join(" ") === "pr checkout 42 --repo owner/repo")).toBe(true)
		expect(recorder.filter((call) => call.command === "codex").every((call) => call.options?.cwd === "/workspace/repo")).toBe(true)
	})

	test("pushes explicitly to the resolved PR head remote and branch", async () => {
		const recorder: RecordedCall[] = []
		const result = await runWith(
			CodexCommentImplementer.use((codex) => codex.implementReviewComment(reviewCommentInput())),
			recorder,
		)

		await runWith(
			CodexCommentImplementer.use((codex) =>
				codex.confirmReviewCommentImplementation({
					...reviewCommentInput(),
					checkoutPath: result.checkoutPath,
					pushRemote: result.pushRemote,
					commitMessage: result.commitMessage,
					replyBody: result.replyBody,
					expectedDiff: result.diff,
				}),
			),
			recorder,
		)

		expect(recorder.some((call) => call.command === "git" && call.args.join(" ") === "push origin HEAD:refs/heads/feature/review")).toBe(true)
		expect(recorder.filter((call) => call.command === "codex").every((call) => call.options?.cwd === "/workspace/repo")).toBe(true)
	})
})
