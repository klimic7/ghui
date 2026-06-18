import { readlinkSync, realpathSync, statSync } from "node:fs"

const readableDirectory = (path: string | undefined) => {
	if (!path) return null
	try {
		return statSync(path).isDirectory() ? realpathSync(path) : null
	} catch {
		return null
	}
}

const parentWorkingDirectory = (pid = process.ppid) => {
	if (process.platform !== "linux") return null
	try {
		return readlinkSync(`/proc/${pid}/cwd`)
	} catch {
		return null
	}
}

const unique = (paths: readonly (string | null)[]) => {
	const seen = new Set<string>()
	return paths.filter((path): path is string => {
		if (!path || seen.has(path)) return false
		seen.add(path)
		return true
	})
}

export const resolveInitialWorkingDirectoryCandidates = (env = process.env, cwd = process.cwd(), parentCwd = parentWorkingDirectory()) =>
	unique([
		readableDirectory(env.GHUI_STARTUP_CWD),
		readableDirectory(env.INIT_CWD),
		readableDirectory(env.PWD),
		readableDirectory(parentCwd ?? undefined),
		readableDirectory(cwd),
		readableDirectory(env.OLDPWD),
	])

export const resolveInitialWorkingDirectory = (env = process.env, cwd = process.cwd(), parentCwd = parentWorkingDirectory()) =>
	resolveInitialWorkingDirectoryCandidates(env, cwd, parentCwd)[0] ?? cwd

export const initialWorkingDirectory = resolveInitialWorkingDirectory()
export const initialWorkingDirectoryCandidates = resolveInitialWorkingDirectoryCandidates()
