import { isAbsolute } from "node:path"

export const resolveInitialWorkingDirectory = (env: { readonly GHUI_WORKING_DIRECTORY?: string | undefined; readonly PWD?: string | undefined }, fallback: string): string => {
	const explicit = env.GHUI_WORKING_DIRECTORY?.trim()
	if (explicit && isAbsolute(explicit)) return explicit
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
