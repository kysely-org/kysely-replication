import type { Dialect } from 'kysely'

export interface KyselyReplicationDialectConfig {
	primaryDialect: Dialect
	replicaDialects: readonly [Dialect, ...Dialect[]]
	replicaStrategy: ReplicaStrategy
}

export interface ReplicaStrategy {
	next(replicaCount: number): Promise<number>
	onTransaction?: 'error' | 'warn' | 'allow' | undefined
}
