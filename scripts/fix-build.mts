import { copyFile, cp, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(
	fileURLToPath(
		// @ts-expect-error
		import.meta.url,
	),
)

const rootPath = join(__dirname, '../')
const distPath = join(__dirname, '../dist')

export async function fixBuild(): Promise<void> {
	await copySubfolderToRoot('force')
	await copySubfolderToRoot('strategy')

	const distFolder = await readdir(distPath, { withFileTypes: true })
	for (const dirent of distFolder) {
		if (dirent.isFile() && dirent.name.startsWith('config-')) {
			await copyFile(join(distPath, dirent.name), join(rootPath, dirent.name))
		}
	}
}

async function copySubfolderToRoot(folderName: string): Promise<void> {
	await cp(join(distPath, folderName), join(rootPath, folderName), {
		recursive: true,
	})
}

fixBuild()
