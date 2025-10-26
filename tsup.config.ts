import { defineConfig } from 'tsup'
import { clean } from './scripts/clean-build.mjs'

clean()

export default defineConfig({
	clean: true,
	dts: true,
	entry: [
		'./src/index.mts',
		'./src/force/index.mts',
		'./src/strategy/random.mts',
		'./src/strategy/round-robin.mts',
	],
	format: ['cjs', 'esm'],
	skipNodeModulesBundle: true,
	sourcemap: true,
})
