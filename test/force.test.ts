import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { type Kysely, type QueryCreator, sql } from 'kysely'
import { dirname, resolve } from 'pathe'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { RoundRobinReplicaStrategy } from '../src/strategy/round-robin'
import {
	type Database,
	getDDLQueries,
	getKysely,
	getMutationQueries,
	getReadQueries,
} from './test-setup'
import '../src/force'

describe.each([
	{
		expectedDialect: 'primary',
		method: 'withPrimary',
	},
	{
		expectedDialect: 'replica-\\d+',
		method: 'withReplica',
		replicaIndex: undefined,
	},
	{
		expectedDialect: 'replica-0',
		method: 'withReplica',
		replicaIndex: 0,
	},
	{
		expectedDialect: 'replica-1',
		method: 'withReplica',
		replicaIndex: 1,
	},
	{
		expectedDialect: 'replica-2',
		method: 'withReplica',
		replicaIndex: -1,
	},
] as const)('force: $method (index $replicaIndex)', ({
	expectedDialect,
	method,
	replicaIndex,
}) => {
	const executions: string[] = []
	let db: Kysely<Database>

	beforeAll(() => {
		db = getKysely(new RoundRobinReplicaStrategy(), executions)
	})

	afterEach(() => {
		executions.length = 0 // clear executions
	})

	it(`should use ${expectedDialect} dialect for DML queries`, async () => {
		const getDb = () => db[method](replicaIndex)

		const queries = {
			...getMutationQueries(getDb),
			...getReadQueries(getDb),
		} satisfies {
			[K in keyof Omit<QueryCreator<Database>, `with${string}`> | 'with']: {
				execute(): Promise<unknown>
			}
		}

		await Promise.all(Object.values(queries).map((query) => query.execute()))

		expect(executions).toEqual(
			Object.values(queries).map(() => expect.stringMatching(expectedDialect)),
		)
	})

	it(`should use ${expectedDialect} dialect for DDL queries`, async () => {
		const queries = getDDLQueries(() => db.schema[method](replicaIndex))

		await Promise.all(Object.values(queries).map((query) => query.execute()))

		expect(executions).toEqual(
			Object.values(queries).map(() => expect.stringMatching(expectedDialect)),
		)
	})

	it('should use primary dialect for raw queries', async () => {
		await sql`select 1`.execute(db[method](replicaIndex))

		expect(executions).toEqual([expect.stringMatching(expectedDialect)])
	})
})

describe('force: consumer bundler-friendliness (issue #16)', () => {
	const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
	const forceDistPath = resolve(rootDir, 'dist/force/index.mjs')

	beforeAll(() => {
		// The consumer scenario can only be verified against the *built* artifact,
		// since it depends on the published `sideEffects` paths and the bundler's
		// own tree-shaking. Build on demand (via the package script, so this stays
		// agnostic to whatever build tool we use) so `pnpm test` works without a
		// prior `pnpm build`; CI builds before testing, so this is usually a no-op.
		if (!existsSync(forceDistPath)) {
			execFileSync('pnpm', ['build'], { cwd: rootDir, stdio: 'ignore' })
		}

		if (!existsSync(forceDistPath)) {
			throw new Error(
				`Expected \`pnpm build\` to emit ${forceDistPath}. ` +
					'Run `pnpm install && pnpm build` first.',
			)
		}
	})

	it('survives tree-shaking in a consumer bundle', async () => {
		// Mimic a consumer's side-effect-only `import 'kysely-replication/force'`.
		// If `sideEffects` doesn't mark the built file, the bundler drops the whole
		// import and `db.withPrimary()`/`db.withReplica()` are never defined.
		const { outputFiles } = await build({
			stdin: {
				contents: `import ${JSON.stringify(forceDistPath)}`,
				resolveDir: rootDir,
				sourcefile: 'consumer.mjs',
			},
			absWorkingDir: rootDir,
			bundle: true,
			format: 'esm',
			treeShaking: true,
			external: ['kysely'],
			write: false,
			logLevel: 'silent',
		})

		const bundled = outputFiles[0]?.text ?? ''

		expect(bundled).not.toBe('')
		expect(bundled).toContain('QueryCreator.prototype.withPrimary')
		expect(bundled).toContain('QueryCreator.prototype.withReplica')
		expect(bundled).toContain('SchemaModule.prototype.withPrimary')
		expect(bundled).toContain('SchemaModule.prototype.withReplica')
	})
})
