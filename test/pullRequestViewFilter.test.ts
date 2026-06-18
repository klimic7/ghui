import { describe, expect, test } from "bun:test"
import type { PullRequestItem } from "../src/domain.ts"
import { applyPullRequestViewClientFilter } from "../src/ui/pullRequests/atoms.ts"

const pullRequest = (author: string): PullRequestItem => ({
	repository: "owner/repo",
	author,
	headRefOid: `${author}-sha`,
	headRefName: `${author}-branch`,
	baseRefName: "main",
	defaultBranchName: "main",
	number: author === "me" ? 1 : 2,
	title: `PR by ${author}`,
	body: "",
	labels: [],
	additions: 1,
	deletions: 0,
	changedFiles: 1,
	state: "open",
	reviewStatus: "none",
	checkStatus: "none",
	checkSummary: null,
	checks: [],
	autoMergeEnabled: false,
	detailLoaded: false,
	createdAt: new Date("2026-01-01T00:00:00Z"),
	updatedAt: new Date("2026-01-01T00:00:00Z"),
	closedAt: null,
	url: `https://github.com/owner/repo/pull/${author === "me" ? 1 : 2}`,
})

describe("applyPullRequestViewClientFilter", () => {
	test("keeps only the authenticated author's pull requests in authored queues", () => {
		const items = [pullRequest("me"), pullRequest("teammate")]

		expect(applyPullRequestViewClientFilter(items, { _tag: "Queue", mode: "authored", repository: "owner/repo" }, "me")).toEqual([items[0]])
	})

	test("does not filter repository overview views", () => {
		const items = [pullRequest("me"), pullRequest("teammate")]

		expect(applyPullRequestViewClientFilter(items, { _tag: "Repository", repository: "owner/repo" }, "me")).toEqual(items)
	})
})
