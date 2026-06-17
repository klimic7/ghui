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

const fakeCommandRunner = (recorder: RecordedCall[]) =>
	Layer.succeed(
		CommandRunner,
		CommandRunner.of({
			run: (command, args, options) => {
				recorder.push({ command, args: [...args], ...(options ? { options } : {}) })
				const stdout = (() => {
					if (command === "git" && args.join(" ") === "remote -v") return "origin\tgit@github.com:owner/repo.git (fetch)\n"
					if (command === "git" && args.join(" ") === "branch --show-current") return "feature/review\n"
					if (command === "git" && args.join(" ") === "status --porcelain") return ""
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

const runWith = <A>(effect: Effect.Effect<A, unknown, CodexCommentImplementer>, recorder: RecordedCall[]) => {
	const githubLayer = MockGitHubService.layer({ prCount: 1, repository: "owner/repo", repositories: ["owner/repo"], username: "kit" })
	const layer = CodexCommentImplementer.layerNoDeps.pipe(Layer.provide(githubLayer), Layer.provide(fakeCommandRunner(recorder)))
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
		const untrackedDiffCall = recorder.find((call) => call.command === "git" && call.args.includes("--no-index"))
		expect(untrackedDiffCall?.options?.successExitCodes).toEqual([0, 1])
	})
})
