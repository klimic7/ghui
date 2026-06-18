import { describe, expect, test } from "bun:test"
import { resolveInitialWorkingDirectory } from "../src/workingDirectory.js"

describe("resolveInitialWorkingDirectory", () => {
	test("prefers explicit ghui working directory", () => {
		expect(resolveInitialWorkingDirectory({ GHUI_WORKING_DIRECTORY: "/workspace/project", PWD: "/workspace/other" }, "/runtime/cwd", "/workspace/parent")).toBe(
			"/workspace/project",
		)
	})

	test("uses parent process cwd before shell PWD and runtime cwd", () => {
		expect(resolveInitialWorkingDirectory({ PWD: "/workspace/project" }, "/runtime/cwd", "/workspace/parent")).toBe("/workspace/parent")
	})

	test("uses shell PWD when parent cwd is unavailable", () => {
		expect(resolveInitialWorkingDirectory({ PWD: "/workspace/project" }, "/runtime/cwd", null)).toBe("/workspace/project")
	})

	test("falls back to runtime cwd for relative or missing values", () => {
		expect(resolveInitialWorkingDirectory({ PWD: "relative/path" }, "/runtime/cwd", null)).toBe("/runtime/cwd")
		expect(resolveInitialWorkingDirectory({}, "/runtime/cwd", null)).toBe("/runtime/cwd")
	})
})
