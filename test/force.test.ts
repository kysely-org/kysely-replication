import { type Kysely, type QueryCreator, sql } from 'kysely'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { RoundRobinReplicaStrategy } from '../src/strategy/round-robin.js'
import {
	type Database,
	getDDLQueries,
	getKysely,
	getMutationQueries,
	getReadQueries,
} from './test-setup.js'
import '../src/force/index.js'

describe.each([
	{ dialect: 'primary' },
	{ dialect: 'replica', replicaIndex: 1 },
] as const)('force: with $dialect', ({ dialect, replicaIndex }) => {
	const executions: string[] = []
	let db: Kysely<Database>
	let method: 'withPrimary' | 'withReplica'
	let expectedDialect: string

	beforeAll(() => {
		db = getKysely(new RoundRobinReplicaStrategy(), executions)
		method = `with${dialect.slice(0, 1).toUpperCase()}${dialect.slice(1)}` as
			| 'withPrimary'
			| 'withReplica'
		expectedDialect =
			dialect === 'primary' ? dialect : `replica-${replicaIndex}`
	})

	afterEach(() => {
		executions.length = 0 // clear executions
	})

	it(`should use ${dialect} dialect for DML queries`, async () => {
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
			Object.values(queries).map(() => expectedDialect),
		)
	})

	it(`should use ${dialect} dialect for DDL queries`, async () => {
		const queries = getDDLQueries(() => db.schema[method](replicaIndex))

		await Promise.all(Object.values(queries).map((query) => query.execute()))

		expect(executions).toEqual(
			Object.values(queries).map(() => expectedDialect),
		)
	})

	it('should use primary dialect for raw queries', async () => {
		await sql`select 1`.execute(db[method](replicaIndex))

		expect(executions).toEqual([expectedDialect])
	})
})
