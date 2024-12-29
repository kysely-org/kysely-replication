import { readdir, rm, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(
	fileURLToPath(
		// @ts-ignore
		import.meta.url,
	),
)
const rootPath = join(__dirname, '../')

export async function clean() {
	try {
		await deleteRootedSubfolder('force')
		await deleteRootedSubfolder('strategy')
	} catch {}

	const rootFolder = await readdir(rootPath, { withFileTypes: true })
	for (const dirent of rootFolder) {
		if (dirent.isFile() && dirent.name.startsWith('config-')) {
			await unlink(join(rootPath, dirent.name))
		}
	}
}

async function deleteRootedSubfolder(folderName: string): Promise<void> {
	await rm(join(rootPath, folderName), { recursive: true })
}