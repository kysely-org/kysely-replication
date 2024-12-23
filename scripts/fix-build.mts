import { copyFile, cp, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(
	fileURLToPath(
		// @ts-ignore
		import.meta.url,
	),
)

const rootPath = join(__dirname, '../')
export const rootStrategyPath = join(rootPath, 'strategy')
const distPath = join(__dirname, '../dist')
const distStrategyPath = join(distPath, 'strategy')

export async function fixBuild(): Promise<void> {
	await cp(distStrategyPath, rootStrategyPath, { recursive: true })

	const distFolder = await readdir(distPath, { withFileTypes: true })
	for (const dirent of distFolder) {
		if (dirent.isFile() && dirent.name.startsWith('config-')) {
			await copyFile(join(distPath, dirent.name), join(rootPath, dirent.name))
		}
	}
}

fixBuild()
