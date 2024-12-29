import { type Kysely, sql } from 'kysely'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { RandomReplicaStrategy } from '../src/strategy/random.js'
import { RoundRobinReplicaStrategy } from '../src/strategy/round-robin.js'
import {
	type Database,
	getDDLQueries,
	getKysely,
	getMutationQueries,
	getReadQueries,
} from './test-setup.js'

const randomSpy = vi.spyOn(global.Math, 'random')
const warnSpy = vi.spyOn(global.console, 'warn')

describe.each(
	(['error', 'warn'] as const).flatMap((onTransaction) => [
		{
			onTransaction,
			replicaAssertion: (executions: string[]) =>
				expect(executions).toEqual([
					'replica-0',
					'replica-1',
					'replica-2',
					'replica-0',
					'replica-1',
				]),
			Strategy: RoundRobinReplicaStrategy,
		},
		{
			onTransaction,
			replicaAssertion: (executions: string[]) =>
				expect(randomSpy).toHaveBeenCalledTimes(executions.length),
			Strategy: RandomReplicaStrategy,
		},
	]),
)(
	'kysely-replication: $Strategy.name (onTransaction: $onTransaction)',
	({ onTransaction, replicaAssertion, Strategy }) => {
		let db: Kysely<Database>
		const executions: string[] = []

		beforeAll(() => {
			db = getKysely(new Strategy({ onTransaction }), executions)
		})

		afterEach(() => {
			executions.length = 0 // clear executions
		})

		it('should use primary dialect for DDL queries', async () => {
			const queries = getDDLQueries(() => db.schema)

			await Promise.all(Object.values(queries).map((query) => query.execute()))

			expect(executions).toEqual(Object.values(queries).map(() => 'primary'))
		})

		it('should use primary dialect for raw queries', async () => {
			await sql`select 1`.execute(db)

			expect(executions).toEqual(['primary'])
		})

		it('should use primary dialect for DML queries that mutate data', async () => {
			const queries = getMutationQueries(() => db)

			await Promise.all(Object.values(queries).map((query) => query.execute()))

			expect(executions).toEqual(Object.values(queries).map(() => 'primary'))
		})

		it('should use primary dialect for transactions', async () => {
			await db.transaction().execute(async (trx) => {
				await trx.selectFrom('users').selectAll().execute()
			})

			expect(executions).toEqual(['primary'])
		})

		it('should use replica dialects for DML queries that do not mutate data', async () => {
			const queries = getReadQueries(() => db)

			// with extra queries to test round-robin
			await Promise.all([
				Object.values(queries).map((query) => query.execute()),
				db.selectFrom('users').selectAll().execute(),
				db.selectFrom('users').selectAll().execute(),
			])

			replicaAssertion(executions)
		})

		const message =
			'KyselyReplication: transaction started with replica connection!'

		if (onTransaction === 'error') {
			it('should throw an error when a transaction is started with a replica connection', async () => {
				await expect(
					db.connection().execute(async (con) => {
						await con.selectFrom('users').selectAll().execute()

						await con.transaction().execute(async (trx) => {
							await trx.selectFrom('users').selectAll().execute()
						})
					}),
				).rejects.toThrow(message)
			})
		} else {
			it('should warn when a transaction is started with a replica connection', async () => {
				await db.connection().execute(async (con) => {
					await con.selectFrom('users').selectAll().execute()

					await con.transaction().execute(async (trx) => {
						await trx.selectFrom('users').selectAll().execute()
					})
				})

				expect(warnSpy).toHaveBeenCalledTimes(1)
				expect(warnSpy).toHaveBeenCalledWith(message)
			})
		}
	},
)
