import {
	type Dialect,
	type Generated,
	Kysely,
	PostgresAdapter,
	PostgresIntrospector,
	PostgresQueryCompiler,
	type QueryCreator,
	type QueryResult,
	type SchemaModule,
	type SqlBool,
	sql,
} from 'kysely'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { KyselyReplicationDialect } from '../src/index.js'
import { RoundRobinReplicaStrategy } from '../src/strategy/round-robin.js'

interface Database {
	users: {
		id: Generated<number>
		email: string
		is_verified: SqlBool
	}
}

describe('kysely-replication: round-robin', () => {
	let db: Kysely<Database>
	const executions: string[] = []

	beforeAll(() => {
		db = new Kysely({
			dialect: new KyselyReplicationDialect({
				primaryDialect: getDummyDialect('primary', executions),
				replicaDialects: new Array(3)
					.fill(null)
					.map((_, i) =>
						getDummyDialect(`replica-${i}`, executions),
					) as unknown as readonly [Dialect, ...Dialect[]],
				replicaStrategy: new RoundRobinReplicaStrategy({}),
			}),
		})
	})

	afterEach(() => {
		executions.length = 0 // clear executions
	})

	it('should use primary dialect for DDL queries', async () => {
		const queries = {
			alterTable: db.schema
				.alterTable('users')
				.addColumn('nickname', 'varchar'),
			createIndex: db.schema
				.createIndex('users_index')
				.on('users')
				.column('email'),
			createSchema: db.schema.createSchema('moshe'),
			createTable: db.schema
				.createTable('cakes')
				.addColumn('id', 'serial', (cb) => cb.primaryKey()),
			createType: db.schema
				.createType('cake_type')
				.asEnum(['chocolate', 'vanilla']),
			createView: db.schema
				.createView('users_view')
				.as(db.selectFrom('users').selectAll()),
			dropIndex: db.schema.dropIndex('users_index'),
			dropSchema: db.schema.dropSchema('moshe'),
			dropTable: db.schema.dropTable('cakes'),
			dropType: db.schema.dropType('cake_type'),
			dropView: db.schema.dropView('users_view'),
		} satisfies {
			[K in keyof Omit<SchemaModule, `with${string}`>]: {
				execute(): Promise<unknown>
			}
		}

		await Promise.all(Object.values(queries).map((query) => query.execute()))

		expect(executions).toEqual(Object.values(queries).map(() => 'primary'))
	})

	it('should use primary dialect for raw queries', async () => {
		await sql`select 1`.execute(db)

		expect(executions).toEqual(['primary'])
	})

	it('should use primary dialect for DML queries that mutate data', async () => {
		const queries = {
			deleteFrom: db.deleteFrom('users').where('id', '=', 1),
			insertInto: db
				.insertInto('users')
				.values({ email: 'info@example.com', is_verified: false }),
			mergeInto: db
				.mergeInto('users as u1')
				.using('users as u2', 'u1.id', 'u2.id')
				.whenMatched()
				.thenDoNothing(),
			replaceInto: db
				.replaceInto('users')
				.values({ email: 'info@example.com', is_verified: false }),
			updateTable: db
				.updateTable('users')
				.set('is_verified', true)
				.where('id', '=', 1),
			with: db
				.with('insert', (qb) =>
					qb
						.insertInto('users')
						.values({ email: 'info@example.com', is_verified: false })
						.returning('id'),
				)
				.selectFrom('users')
				.innerJoin('insert', 'insert.id', 'users.id')
				.selectAll(),
		} satisfies {
			[K in
				| keyof Omit<
						QueryCreator<Database>,
						`select${string}` | `with${string}`
				  >
				| 'with']: {
				execute(): Promise<unknown>
			}
		}

		await Promise.all(Object.values(queries).map((query) => query.execute()))

		expect(executions).toEqual(Object.values(queries).map(() => 'primary'))
	})

	it('should use replica dialects for DML queries that do not mutate data', async () => {
		const queries = {
			selectFrom: db.selectFrom('users').selectAll(),
			selectNoFrom: db
				.selectNoFrom((eb) => eb.selectFrom('users').selectAll().as('u'))
				.selectAll(),
			with: db
				.with('u1', (qb) => qb.selectFrom('users').selectAll())
				.selectFrom('u1')
				.selectAll(),
		} satisfies {
			[K in keyof Pick<
				QueryCreator<Database>,
				'selectFrom' | 'selectNoFrom' | 'with'
			>]: { execute(): Promise<unknown> }
		}

		await Promise.all([
			Object.values(queries).map((query) => query.execute()),
			db.selectFrom('users').selectAll().where('id', '=', 1).execute(),
			db.selectFrom('users').selectAll().where('id', '=', 2).execute(),
		])

		expect(executions).toEqual([
			'replica-0',
			'replica-1',
			'replica-2',
			'replica-0',
			'replica-1',
		])
	})
})

function getDummyDialect(name: string, executions: string[]): Dialect {
	return {
		createAdapter: () => new PostgresAdapter(),
		createDriver: () => ({
			acquireConnection: () => {
				executions.push(name)
				return Promise.resolve({
					executeQuery: () =>
						Promise.resolve({ rows: [] } satisfies QueryResult<unknown>),
					streamQuery: () => {
						throw new Error('Not implemented')
					},
				})
			},
			beginTransaction: () => Promise.resolve(),
			commitTransaction: () => Promise.resolve(),
			destroy: () => Promise.resolve(),
			init: () => Promise.resolve(),
			releaseConnection: () => Promise.resolve(),
			rollbackTransaction: () => Promise.resolve(),
		}),
		createIntrospector: (db) => new PostgresIntrospector(db),
		createQueryCompiler: () => new PostgresQueryCompiler(),
	}
}
