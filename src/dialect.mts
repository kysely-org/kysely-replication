import type {
	DatabaseIntrospector,
	Dialect,
	DialectAdapter,
	Driver,
	Kysely,
	QueryCompiler,
} from 'kysely'
import type { KyselyReplicationDialectConfig } from './config.mjs'
import { KyselyReplicationDriver } from './driver.mjs'

export class KyselyReplicationDialect implements Dialect {
	readonly #config: KyselyReplicationDialectConfig

	constructor(config: KyselyReplicationDialectConfig) {
		this.#config = {
			...config,
			replicaDialects: [...config.replicaDialects],
		}
	}

	createAdapter(): DialectAdapter {
		return this.#config.primaryDialect.createAdapter()
	}

	createDriver(): Driver {
		return new KyselyReplicationDriver(
			this.#config.primaryDialect.createDriver(),
			this.#config.replicaDialects.map((replica) => replica.createDriver()),
			this.#config.replicaStrategy,
		)
	}

	createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
		return this.#config.primaryDialect.createIntrospector(db)
	}

	createQueryCompiler(): QueryCompiler {
		return this.#config.primaryDialect.createQueryCompiler()
	}
}
