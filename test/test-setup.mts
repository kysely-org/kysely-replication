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
import { KyselyReplicationDialect } from '../src/dialect.mjs'
import type { RandomReplicaStrategy } from '../src/strategy/random.mjs'
import type { RoundRobinReplicaStrategy } from '../src/strategy/round-robin.mjs'

export interface Database {
	users: {
		id: Generated<number>
		email: string
		is_verified: SqlBool
	}
}

export function getKysely(
	replicaStrategy: RandomReplicaStrategy | RoundRobinReplicaStrategy,
	executions: string[],
): Kysely<Database> {
	return new Kysely({
		dialect: new KyselyReplicationDialect({
			primaryDialect: getDummyDialect('primary', executions),
			replicaDialects: new Array(3)
				.fill(null)
				.map((_, i) =>
					getDummyDialect(`replica-${i}`, executions),
				) as unknown as readonly [Dialect, ...Dialect[]],
			replicaStrategy,
		}),
	})
}

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

export function getDDLQueries(getSchemaModule: () => SchemaModule) {
	return {
		alterTable: getSchemaModule()
			.alterTable('users')
			.addColumn('nickname', 'varchar'),
		createIndex: getSchemaModule()
			.createIndex('users_index')
			.on('users')
			.column('email'),
		createSchema: getSchemaModule().createSchema('moshe'),
		createTable: getSchemaModule()
			.createTable('cakes')
			.addColumn('id', 'serial', (cb) => cb.primaryKey()),
		createType: getSchemaModule()
			.createType('cake_type')
			.asEnum(['chocolate', 'vanilla']),
		createView: getSchemaModule()
			.createView('users_view')
			.as(sql`select * from users`),
		dropIndex: getSchemaModule().dropIndex('users_index'),
		dropSchema: getSchemaModule().dropSchema('moshe'),
		dropTable: getSchemaModule().dropTable('cakes'),
		dropType: getSchemaModule().dropType('cake_type'),
		dropView: getSchemaModule().dropView('users_view'),
		refreshMaterializedView:
			getSchemaModule().refreshMaterializedView('users_view'),
	} satisfies {
		[K in keyof Omit<SchemaModule, `with${string}`>]: {
			execute(): Promise<unknown>
		}
	}
}

export function getMutationQueries(getDb: () => QueryCreator<Database>) {
	return {
		deleteFrom: getDb().deleteFrom('users').where('id', '=', 1),
		insertInto: getDb()
			.insertInto('users')
			.values({ email: 'info@example.com', is_verified: false }),
		mergeInto: getDb()
			.mergeInto('users as u1')
			.using('users as u2', 'u1.id', 'u2.id')
			.whenMatched()
			.thenDoNothing(),
		replaceInto: getDb()
			.replaceInto('users')
			.values({ email: 'info@example.com', is_verified: false }),
		updateTable: getDb()
			.updateTable('users')
			.set('is_verified', true)
			.where('id', '=', 1),
		with: getDb()
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
			| keyof Omit<QueryCreator<Database>, `select${string}` | `with${string}`>
			| 'with']: {
			execute(): Promise<unknown>
		}
	}
}

export function getReadQueries(getDb: () => QueryCreator<Database>) {
	return {
		selectFrom: getDb().selectFrom('users').selectAll(),
		selectNoFrom: getDb()
			.selectNoFrom((eb) => eb.selectFrom('users').selectAll().as('u'))
			.selectAll(),
		with: getDb()
			.with('u1', (qb) => qb.selectFrom('users').selectAll())
			.selectFrom('u1')
			.selectAll(),
	} satisfies {
		[K in keyof Pick<
			QueryCreator<Database>,
			'selectFrom' | 'selectNoFrom' | 'with'
		>]: { execute(): Promise<unknown> }
	}
}
