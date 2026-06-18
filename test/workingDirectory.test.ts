import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resolveInitialWorkingDirectory, resolveInitialWorkingDirectoryCandidates } from "../src/workingDirectory.ts"

describe("workingDirectory", () => {
	test("prefers the ghui startup cwd over shell and process cwd", async () => {
		const startupDir = await mkdtemp(join(tmpdir(), "ghui-startup-cwd-"))
		const shellDir = await mkdtemp(join(tmpdir(), "ghui-shell-cwd-"))
		const processDir = await mkdtemp(join(tmpdir(), "ghui-process-cwd-"))
		try {
			expect(resolveInitialWorkingDirectory({ GHUI_STARTUP_CWD: startupDir, PWD: shellDir }, processDir)).toBe(startupDir)
		} finally {
			await rm(startupDir, { recursive: true, force: true })
			await rm(shellDir, { recursive: true, force: true })
			await rm(processDir, { recursive: true, force: true })
		}
	})

	test("prefers the shell PWD over the process cwd", async () => {
		const shellDir = await mkdtemp(join(tmpdir(), "ghui-shell-cwd-"))
		const processDir = await mkdtemp(join(tmpdir(), "ghui-process-cwd-"))
		try {
			expect(resolveInitialWorkingDirectory({ PWD: shellDir }, processDir)).toBe(shellDir)
		} finally {
			await rm(shellDir, { recursive: true, force: true })
			await rm(processDir, { recursive: true, force: true })
		}
	})

	test("uses parent cwd before process cwd when shell env is unavailable", async () => {
		const parentDir = await mkdtemp(join(tmpdir(), "ghui-parent-cwd-"))
		const processDir = await mkdtemp(join(tmpdir(), "ghui-process-cwd-"))
		try {
			expect(resolveInitialWorkingDirectoryCandidates({}, processDir, parentDir)).toEqual([parentDir, processDir])
			expect(resolveInitialWorkingDirectory({}, processDir, parentDir)).toBe(parentDir)
		} finally {
			await rm(parentDir, { recursive: true, force: true })
			await rm(processDir, { recursive: true, force: true })
		}
	})

	test("falls back to process cwd when PWD is not a directory", async () => {
		const processDir = await mkdtemp(join(tmpdir(), "ghui-process-cwd-"))
		try {
			expect(resolveInitialWorkingDirectory({ PWD: join(processDir, "missing") }, processDir, null)).toBe(processDir)
		} finally {
			await rm(processDir, { recursive: true, force: true })
		}
	})
})
