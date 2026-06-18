import { describe, expect, test } from "bun:test"
import { resolveInitialWorkingDirectory } from "../src/workingDirectory.js"

describe("resolveInitialWorkingDirectory", () => {
	test("prefers explicit ghui working directory", () => {
		expect(resolveInitialWorkingDirectory({ GHUI_WORKING_DIRECTORY: "/workspace/project", PWD: "/workspace/other" }, "/runtime/cwd")).toBe("/workspace/project")
	})

	test("uses shell PWD before runtime cwd", () => {
		expect(resolveInitialWorkingDirectory({ PWD: "/workspace/project" }, "/runtime/cwd")).toBe("/workspace/project")
	})

	test("falls back to runtime cwd for relative or missing values", () => {
		expect(resolveInitialWorkingDirectory({ PWD: "relative/path" }, "/runtime/cwd")).toBe("/runtime/cwd")
		expect(resolveInitialWorkingDirectory({}, "/runtime/cwd")).toBe("/runtime/cwd")
	})
})
