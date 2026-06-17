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

const fakeCommandRunner = (recorder: RecordedCall[], remoteOutput = "origin\tgit@github.com:owner/repo.git (fetch)\n") =>
	Layer.succeed(
		CommandRunner,
		CommandRunner.of({
			run: (command, args, options) => {
				recorder.push({ command, args: [...args], ...(options ? { options } : {}) })
				const stdout = (() => {
					if (command === "git" && args.join(" ") === "remote -v") return remoteOutput
					if (command === "git" && args.join(" ") === "branch --show-current") return "feature/review\n"
					if (command === "git" && args.join(" ") === "status --porcelain") return ""
					if (command === "git" && args.join(" ") === "rev-parse --abbrev-ref --symbolic-full-name @{u}") return "origin/feature/review\n"
					if (command === "git" && args.join(" ") === "remote") return "origin\nupstream\n"
					if (command === "git" && args.join(" ") === "ls-remote --heads origin feature/review") return "abc123\trefs/heads/feature/review\n"
					if (command === "git" && args[0] === "ls-remote") return ""
					if (command === "codex") return "Upravil jsem implementaci."
					if (command === "git" && args.join(" ") === "diff --binary") return "diff --git a/src/existing.ts b/src/existing.ts\n@@ -1 +1 @@\n-old\n+new\n"
					if (command === "git" && args.join(" ") === "ls-files --others --exclude-standard -z") return "src/new.ts\0"
					if (command === "git" && args[0] === "diff" && args.includes("--no-index")) {
						return "diff --git a/src/new.ts b/src/new.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/new.ts\n@@ -0,0 +1 @@\n+export const created = true\n"
					}
					return ""
				})()
				const result: CommandResult = { stdout, stderr: "", exitCode: 0 }
				return Effect.succeed(result)
			},
			runSchema: <S extends Schema.Top>() => Effect.die("runSchema is not used in this test") as Effect.Effect<S["Type"], never, S["DecodingServices"]>,
		}),
	)

const runWith = <A>(effect: Effect.Effect<A, unknown, CodexCommentImplementer>, recorder: RecordedCall[], remoteOutput?: string) => {
	const githubLayer = MockGitHubService.layer({ prCount: 1, repository: "owner/repo", repositories: ["owner/repo"], username: "kit" })
	const layer = CodexCommentImplementer.layerNoDeps.pipe(Layer.provide(githubLayer), Layer.provide(fakeCommandRunner(recorder, remoteOutput)))
	return Effect.runPromise(effect.pipe(Effect.provide(layer)) as Effect.Effect<A>)
}

describe("CodexCommentImplementer", () => {
	test("includes untracked files in the reviewed diff", async () => {
		const recorder: RecordedCall[] = []
		const result = await runWith(
			CodexCommentImplementer.use((codex) =>
				codex.implementReviewComment({
					repository: "owner/repo",
					number: 42,
					title: "Review fixes",
					headRefName: "feature/review",
					commentId: "100",
					threadId: "PRRT_100",
					author: "reviewer",
					path: "src/existing.ts",
					line: 1,
					body: "Please extract this.",
				}),
			),
			recorder,
		)

		expect(result.diff).toContain("diff --git a/src/existing.ts b/src/existing.ts")
		expect(result.diff).toContain("diff --git a/src/new.ts b/src/new.ts")
		expect(result.diff).toContain("new file mode 100644")
		expect(result.pushRemote).toBe("origin")
		const untrackedDiffCall = recorder.find((call) => call.command === "git" && call.args.includes("--no-index"))
		expect(untrackedDiffCall?.options?.successExitCodes).toEqual([0, 1])
	})

	test("accepts a fork remote with the same repository name", async () => {
		const recorder: RecordedCall[] = []
		const result = await runWith(
			CodexCommentImplementer.use((codex) =>
				codex.implementReviewComment({
					repository: "upstream/repo",
					number: 42,
					title: "Review fixes",
					headRefName: "feature/review",
					commentId: "100",
					threadId: "PRRT_100",
					author: "reviewer",
					path: "src/existing.ts",
					line: 1,
					body: "Please extract this.",
				}),
			),
			recorder,
			"origin\tgit@github.com:fork-owner/repo.git (fetch)\n",
		)

		expect(result.codexOutput).toContain("Upravil")
		expect(result.pushRemote).toBe("origin")
		expect(recorder.some((call) => call.command === "codex")).toBe(true)
	})

	test("pushes explicitly to the resolved PR head remote and branch", async () => {
		const recorder: RecordedCall[] = []
		const result = await runWith(
			CodexCommentImplementer.use((codex) =>
				codex.implementReviewComment({
					repository: "owner/repo",
					number: 42,
					title: "Review fixes",
					headRefName: "feature/review",
					commentId: "100",
					threadId: "PRRT_100",
					author: "reviewer",
					path: "src/existing.ts",
					line: 1,
					body: "Please extract this.",
				}),
			),
			recorder,
		)

		await runWith(
			CodexCommentImplementer.use((codex) =>
				codex.confirmReviewCommentImplementation({
					repository: "owner/repo",
					number: 42,
					title: "Review fixes",
					headRefName: "feature/review",
					commentId: "100",
					threadId: "PRRT_100",
					author: "reviewer",
					path: "src/existing.ts",
					line: 1,
					body: "Please extract this.",
					pushRemote: result.pushRemote,
					commitMessage: result.commitMessage,
					replyBody: result.replyBody,
					expectedDiff: result.diff,
				}),
			),
			recorder,
		)

		expect(recorder.some((call) => call.command === "git" && call.args.join(" ") === "push origin HEAD:refs/heads/feature/review")).toBe(true)
	})
})
