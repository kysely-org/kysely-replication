import { type Kysely, type QueryCreator, sql } from 'kysely'
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
