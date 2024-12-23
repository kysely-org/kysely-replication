import { defineConfig } from 'tsup'
import { clean } from './scripts/clean-build.mjs'

clean()

export default defineConfig({
	clean: true,
	dts: true,
	entry: [
		'./src/index.ts',
		'./src/strategy/random.ts',
		'./src/strategy/round-robin.ts',
	],
	format: ['cjs', 'esm'],
	skipNodeModulesBundle: true,
	sourcemap: true,
})
