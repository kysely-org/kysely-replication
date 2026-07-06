import { isCI } from 'std-env'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		allowOnly: !isCI,
		clearMocks: true,
		typecheck: {
			enabled: true,
			ignoreSourceErrors: true,
		},
	},
})
