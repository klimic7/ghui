import { isAbsolute } from "node:path"
import { readlinkSync } from "node:fs"

export const parentProcessWorkingDirectory = (): string | null => {
	try {
		const cwd = readlinkSync(`/proc/${process.ppid}/cwd`)
		return isAbsolute(cwd) ? cwd : null
	} catch {
		return null
	}
}

export const resolveInitialWorkingDirectory = (
	env: { readonly GHUI_WORKING_DIRECTORY?: string | undefined; readonly PWD?: string | undefined },
	fallback: string,
	parentCwd: string | null = parentProcessWorkingDirectory(),
): string => {
	const explicit = env.GHUI_WORKING_DIRECTORY?.trim()
	if (explicit && isAbsolute(explicit)) return explicit
	if (parentCwd && isAbsolute(parentCwd)) return parentCwd
	const pwd = env.PWD?.trim()
	if (pwd && isAbsolute(pwd)) return pwd
	return fallback
}

export const initialWorkingDirectory = resolveInitialWorkingDirectory(
	{
		GHUI_WORKING_DIRECTORY: process.env.GHUI_WORKING_DIRECTORY,
		PWD: process.env.PWD,
	},
	process.cwd(),
)
