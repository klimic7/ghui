import { afterEach, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import type { IssueItem, PullRequestItem, RepositoryDetails } from "../src/domain.ts"
import type { IssueLoad } from "../src/issueLoad.ts"
import type { IssueView } from "../src/issueViews.ts"
import type { PullRequestLoad } from "../src/pullRequestLoad.ts"
import type { PullRequestView } from "../src/pullRequestViews.ts"
import { CacheService, pullRequestCacheKey } from "../src/services/CacheService.ts"
import { makeWorkspacePreferences, repositoryId, viewerId } from "../src/workspacePreferences.ts"

const tempDirs: string[] = []

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

const tempCachePath = async () => {
	const dir = await mkdtemp(join(tmpdir(), "ghui-cache-"))
	tempDirs.push(dir)
	return join(dir, "cache.sqlite")
}

const view: PullRequestView = { _tag: "Queue", mode: "authored", repository: null }

const pullRequest = (number: number, overrides: Partial<PullRequestItem> = {}): PullRequestItem => ({
	repository: "owner/repo",
	author: "author",
	headRefOid: `sha-${number}`,
	headRefName: `feature/${number}`,
	baseRefName: "main",
	defaultBranchName: "main",
	number,
	title: `PR ${number}`,
	body: "Body",
	labels: [{ name: "bug", color: "#d73a4a" }],
	additions: 10,
	deletions: 2,
	changedFiles: 3,
	state: "open",
	reviewStatus: "none",
	checkStatus: "passing",
	checkSummary: "1/1",
	checks: [{ name: "ci", status: "completed", conclusion: "success" }],
	autoMergeEnabled: false,
	detailLoaded: true,
	createdAt: new Date(`2026-01-${String(number).padStart(2, "0")}T00:00:00Z`),
	updatedAt: new Date(`2026-01-${String(number).padStart(2, "0")}T00:00:00Z`),
	closedAt: null,
	url: `https://github.com/owner/repo/pull/${number}`,
	...overrides,
})

const load = (data: readonly PullRequestItem[]): PullRequestLoad => ({
	view,
	data,
	fetchedAt: new Date(),
	endCursor: "cursor-1",
	hasNextPage: true,
})

const runCache = async <A, E>(filename: string, effect: Effect.Effect<A, E, CacheService>) => Effect.runPromise(effect.pipe(Effect.provide(CacheService.layerSqliteFile(filename))))

describe("CacheService", () => {
	test("persists queue order and revives dates", async () => {
		const filename = await tempCachePath()
		const first = pullRequest(1)
		const second = pullRequest(2, { title: "Second" })

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeQueue("alice", load([second, first]))
			}),
		)

		const cached = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readQueue("alice", view)
			}),
		)

		expect(cached?.data.map((item) => item.number)).toEqual([2, 1])
		expect(cached?.fetchedAt).toBeInstanceOf(Date)
		expect(cached?.data[0]?.createdAt).toBeInstanceOf(Date)
		expect(cached?.data[0]?.labels).toEqual([{ name: "bug", color: "#d73a4a" }])
		expect(cached?.endCursor).toBe("cursor-1")
		expect(cached?.hasNextPage).toBe(true)
	})

	test("scopes user queues by viewer", async () => {
		const filename = await tempCachePath()
		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeQueue("alice", load([pullRequest(1)]))
				yield* cache.writeQueue("bob", load([pullRequest(2)]))
			}),
		)

		const [alice, bob] = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* Effect.all([cache.readQueue("alice", view), cache.readQueue("bob", view)])
			}),
		)

		expect(alice?.data.map((item) => item.number)).toEqual([1])
		expect(bob?.data.map((item) => item.number)).toEqual([2])
	})

	test("reads hydrated pull request details by repository and number", async () => {
		const filename = await tempCachePath()
		const detail = pullRequest(3, { body: "Hydrated body", additions: 42 })

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.upsertPullRequest(detail)
			}),
		)

		const cached = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readPullRequest({ repository: "owner/repo", number: 3 })
			}),
		)

		expect(cached?.body).toBe("Hydrated body")
		expect(cached?.additions).toBe(42)
		expect(cached?.createdAt).toBeInstanceOf(Date)
	})

	test("queue summaries do not clobber hydrated details, including checks", async () => {
		const filename = await tempCachePath()
		const detail = pullRequest(4, {
			body: "Hydrated body",
			additions: 42,
			checkStatus: "passing",
			checkSummary: "9/9",
			checks: [{ name: "ci", status: "completed", conclusion: "success" }],
			detailLoaded: true,
		})
		// A real list-fetch summary never carries a real rollup; checkStatus="none" is what lands.
		const summary = pullRequest(4, {
			body: "",
			labels: [],
			additions: 0,
			deletions: 0,
			changedFiles: 0,
			checkStatus: "none",
			checkSummary: null,
			checks: [],
			detailLoaded: false,
		})

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.upsertPullRequest(detail)
				yield* cache.writeQueue("alice", load([summary]))
				return yield* cache.readPullRequest({ repository: "owner/repo", number: 4 })
			}),
		).then((cached) => {
			expect(cached).toMatchObject({
				body: "Hydrated body",
				additions: 42,
				checkStatus: "passing",
				checkSummary: "9/9",
				detailLoaded: true,
			})
		})
	})

	test("skips corrupt pull request rows when reading queues", async () => {
		const filename = await tempCachePath()
		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeQueue("alice", load([pullRequest(1), pullRequest(2)]))
			}),
		)

		const db = new Database(filename)
		db.run("update pull_requests set data_json = ? where pr_key = ?", "{", pullRequestCacheKey({ repository: "owner/repo", number: 1 }))
		db.close()

		const cached = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readQueue("alice", view)
			}),
		)

		expect(cached?.data.map((item) => item.number)).toEqual([2])
	})

	test("disabled layer is a no-op", async () => {
		const cached = await Effect.runPromise(
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeQueue("alice", load([pullRequest(1)]))
				return yield* cache.readQueue("alice", view)
			}).pipe(Effect.provide(CacheService.disabledLayer)),
		)

		expect(cached).toBeNull()
	})

	test("persists workspace preferences by branded viewer", async () => {
		const filename = await tempCachePath()
		const preferences = makeWorkspacePreferences({
			viewer: viewerId("kitlangton"),
			favoriteRepositories: [repositoryId("kitlangton/ghui"), repositoryId("anomalyco/opencode")],
			recentRepositories: [repositoryId("anomalyco/opencode"), repositoryId("Effect-TS/effect")],
		})

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeWorkspacePreferences(preferences)
			}),
		)

		const cached = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readWorkspacePreferences(viewerId("kitlangton"))
			}),
		)

		expect(cached?.favoriteRepositories).toEqual(["kitlangton/ghui", "anomalyco/opencode"])
		expect(cached?.recentRepositories).toEqual(["anomalyco/opencode", "Effect-TS/effect"])
	})

	test("persists reviewed diff files by pull request", async () => {
		const filename = await tempCachePath()

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeReviewedDiffFiles({
					repository: "owner/repo",
					number: 10,
					files: [{ path: "src/app.ts", fingerprint: "abc123", lineKeys: ["src/app.ts:RIGHT:12", "src/app.ts:RIGHT:13"] }],
				})
			}),
		)

		const cached = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readReviewedDiffFiles({ repository: "owner/repo", number: 10 })
			}),
		)

		expect(cached).toEqual([{ path: "src/app.ts", fingerprint: "abc123", lineKeys: ["src/app.ts:RIGHT:12", "src/app.ts:RIGHT:13"] }])
	})

	test("replaces reviewed diff files for a pull request", async () => {
		const filename = await tempCachePath()

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeReviewedDiffFiles({
					repository: "owner/repo",
					number: 10,
					files: [
						{ path: "src/a.ts", fingerprint: "old", lineKeys: ["src/a.ts:RIGHT:1"] },
						{ path: "src/b.ts", fingerprint: "old", lineKeys: ["src/b.ts:RIGHT:1"] },
					],
				})
				yield* cache.writeReviewedDiffFiles({
					repository: "owner/repo",
					number: 10,
					files: [{ path: "src/a.ts", fingerprint: "new", lineKeys: ["src/a.ts:RIGHT:2"] }],
				})
				return yield* cache.readReviewedDiffFiles({ repository: "owner/repo", number: 10 })
			}),
		).then((cached) => {
			expect(cached).toEqual([{ path: "src/a.ts", fingerprint: "new", lineKeys: ["src/a.ts:RIGHT:2"] }])
		})
	})

	test("persists reviewed pull requests by head revision", async () => {
		const filename = await tempCachePath()

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeReviewedPullRequest({
					repository: "owner/repo",
					number: 10,
					headRefOid: "sha-one",
					reviewed: true,
				})
				return yield* cache.readReviewedPullRequestKeys()
			}),
		).then((cached) => {
			expect(cached).toEqual(["owner/repo#10:sha-one"])
		})
	})

	test("clears reviewed pull request when unchecked or head revision changes", async () => {
		const filename = await tempCachePath()

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeReviewedPullRequest({
					repository: "owner/repo",
					number: 10,
					headRefOid: "sha-one",
					reviewed: true,
				})
				yield* cache.writeReviewedPullRequest({
					repository: "owner/repo",
					number: 10,
					headRefOid: "sha-two",
					reviewed: true,
				})
				yield* cache.writeReviewedPullRequest({
					repository: "owner/repo",
					number: 10,
					headRefOid: "sha-two",
					reviewed: false,
				})
				return yield* cache.readReviewedPullRequestKeys()
			}),
		).then((cached) => {
			expect(cached).toEqual([])
		})
	})

	test("persists issue queue order and revives dates", async () => {
		const filename = await tempCachePath()
		const issueView: IssueView = { _tag: "Queue", mode: "authored", repository: null }
		const issue = (number: number, overrides: Partial<IssueItem> = {}): IssueItem => ({
			repository: "owner/repo",
			number,
			state: "open",
			title: `Issue ${number}`,
			body: "Body",
			author: "alice",
			labels: [{ name: "bug", color: "#d73a4a" }],
			commentCount: 0,
			createdAt: new Date(`2026-02-${String(number).padStart(2, "0")}T00:00:00Z`),
			updatedAt: new Date(`2026-02-${String(number).padStart(2, "0")}T00:00:00Z`),
			url: `https://github.com/owner/repo/issues/${number}`,
			...overrides,
		})
		const issueLoad = (data: readonly IssueItem[]): IssueLoad => ({
			view: issueView,
			data,
			fetchedAt: new Date(),
			endCursor: "issue-cursor",
			hasNextPage: false,
		})

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeIssueQueue("alice", issueLoad([issue(2, { title: "Second" }), issue(1)]))
			}),
		)

		const cached = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readIssueQueue("alice", issueView)
			}),
		)

		expect(cached?.data.map((item) => item.number)).toEqual([2, 1])
		expect(cached?.data[0]?.title).toBe("Second")
		expect(cached?.data[0]?.createdAt).toBeInstanceOf(Date)
		expect(cached?.data[0]?.labels).toEqual([{ name: "bug", color: "#d73a4a" }])
		expect(cached?.endCursor).toBe("issue-cursor")
		expect(cached?.hasNextPage).toBe(false)
	})

	test("issue queue cache is independent of pull request cache", async () => {
		const filename = await tempCachePath()
		const prView: PullRequestView = { _tag: "Queue", mode: "authored", repository: null }
		const issueView: IssueView = { _tag: "Queue", mode: "authored", repository: null }
		const issue: IssueItem = {
			repository: "owner/repo",
			number: 99,
			state: "open",
			title: "Issue 99",
			body: "",
			author: "alice",
			labels: [],
			commentCount: 0,
			createdAt: new Date("2026-03-01T00:00:00Z"),
			updatedAt: new Date("2026-03-01T00:00:00Z"),
			url: "https://github.com/owner/repo/issues/99",
		}

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeQueue("alice", load([pullRequest(1)]))
				yield* cache.writeIssueQueue("alice", {
					view: issueView,
					data: [issue],
					fetchedAt: new Date(),
					endCursor: null,
					hasNextPage: false,
				})
			}),
		)

		const [prLoad, issueLoadResult] = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* Effect.all([cache.readQueue("alice", prView), cache.readIssueQueue("alice", issueView)])
			}),
		)

		expect(prLoad?.data.map((item) => item.number)).toEqual([1])
		expect(issueLoadResult?.data.map((item) => item.number)).toEqual([99])
	})

	test("readRepoRollup aggregates pull requests and issues per viewer", async () => {
		const filename = await tempCachePath()
		const prView: PullRequestView = { _tag: "Queue", mode: "authored", repository: null }
		const issueView: IssueView = { _tag: "Queue", mode: "authored", repository: null }
		const otherViewerView: PullRequestView = { _tag: "Queue", mode: "review", repository: null }

		const prAlice = pullRequest(1, { repository: "owner/alpha", updatedAt: new Date("2026-04-10T00:00:00Z") })
		const prAlice2 = pullRequest(2, { repository: "owner/alpha", updatedAt: new Date("2026-04-12T00:00:00Z") })
		const prAliceOther = pullRequest(3, { repository: "owner/beta", updatedAt: new Date("2026-04-09T00:00:00Z") })
		const issueAlice: IssueItem = {
			repository: "owner/alpha",
			number: 11,
			state: "open",
			title: "I",
			body: "",
			author: "alice",
			labels: [],
			commentCount: 0,
			createdAt: new Date("2026-04-15T00:00:00Z"),
			updatedAt: new Date("2026-04-15T00:00:00Z"),
			url: "https://github.com/owner/alpha/issues/11",
		}
		const prBob = pullRequest(4, { repository: "owner/gamma" })

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeQueue("alice", { view: prView, data: [prAlice, prAlice2, prAliceOther], fetchedAt: new Date(), endCursor: null, hasNextPage: false })
				yield* cache.writeIssueQueue("alice", { view: issueView, data: [issueAlice], fetchedAt: new Date(), endCursor: null, hasNextPage: false })
				yield* cache.writeQueue("bob", { view: otherViewerView, data: [prBob], fetchedAt: new Date(), endCursor: null, hasNextPage: false })
			}),
		)

		const rows = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readRepoRollup("alice")
			}),
		)

		const byRepo = new Map(rows.map((row) => [row.repository, row]))
		expect(byRepo.get("owner/alpha")?.pullRequestCount).toBe(2)
		expect(byRepo.get("owner/alpha")?.issueCount).toBe(1)
		expect(byRepo.get("owner/alpha")?.lastActivityAt?.toISOString()).toBe("2026-04-15T00:00:00.000Z")
		expect(byRepo.get("owner/beta")?.pullRequestCount).toBe(1)
		expect(byRepo.get("owner/beta")?.issueCount).toBe(0)
		// Bob's PR must not leak into Alice's rollup.
		expect(byRepo.has("owner/gamma")).toBe(false)
	})

	test("readRepositoryDetailsFetchedAt reflects the latest write", async () => {
		const filename = await tempCachePath()
		const details: RepositoryDetails = {
			repository: "owner/repo",
			description: "Hi",
			url: "https://github.com/owner/repo",
			stargazerCount: 1,
			forkCount: 0,
			openIssueCount: 0,
			openPullRequestCount: 0,
			defaultBranch: "main",
			pushedAt: null,
			isArchived: false,
			isPrivate: false,
		}
		const before = new Date()

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeRepositoryDetails(details)
			}),
		)

		const fetchedAt = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readRepositoryDetailsFetchedAt("owner/repo")
			}),
		)

		expect(fetchedAt).toBeInstanceOf(Date)
		expect(fetchedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
	})

	test("layerFromPath falls back to disabled cache when startup fails", async () => {
		const dir = await mkdtemp(join(tmpdir(), "ghui-cache-fallback-"))
		tempDirs.push(dir)
		const blockedParent = join(dir, "not-a-directory")
		await Bun.write(blockedParent, "blocked")

		const cached = await Effect.runPromise(
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readQueue("alice", view)
			}).pipe(Effect.provide(CacheService.layerFromPath(join(blockedParent, "cache.sqlite")))),
		)

		expect(cached).toBeNull()
	})
})
