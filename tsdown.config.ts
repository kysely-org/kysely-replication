import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'pathe'
import { defineConfig } from 'tsdown'

const DIST_REGEX = /^\.\/dist\//
const BUILT_FILE_EXTENSION_REGEX = /\.m?js$/
const __dirname__ = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	attw: {
		enabled: true,
		level: 'error',
		profile: 'esm-only',
	},
	clean: true,
	dts: true,
	entry: [
		'./src/index.ts',
		'./src/force/index.ts',
		'./src/strategy/random.ts',
		'./src/strategy/round-robin.ts',
	],
	exports: {
		enabled: 'local-only',
	},
	format: ['esm'],
	hooks: {
		// Runs after tsdown writes the generated `exports` map into package.json.
		// Mirror that map into jsr.json, pointing each subpath at its source file.
		'build:done': async () => {
			const packageJsonPath = resolve(__dirname__, 'package.json')
			const jsrJsonPath = resolve(__dirname__, 'jsr.json')

			const [packageJson, jsrJson] = await Promise.all([
				readFile(packageJsonPath, 'utf8').then(JSON.parse),
				readFile(jsrJsonPath, 'utf8').then(JSON.parse),
			])

			const jsrExports: Record<string, string> = {}

			for (const [subpath, target] of Object.entries(packageJson.exports)) {
				// jsr publishes source, and doesn't want a `./package.json` export.
				if (subpath === './package.json' || typeof target !== 'string') {
					continue
				}

				jsrExports[subpath] = target
					.replace(DIST_REGEX, './src/')
					.replace(BUILT_FILE_EXTENSION_REGEX, '.ts')
			}

			jsrJson.exports = jsrExports

			await writeFile(jsrJsonPath, `${JSON.stringify(jsrJson, null, '\t')}\n`)
		},
	},
	publint: {
		enabled: true,
	},
	shims: true,
	tsconfig: './tsconfig.prod.json',
})
