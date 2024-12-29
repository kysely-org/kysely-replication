import type {
	CompiledQuery,
	DatabaseConnection,
	Driver,
	TransactionSettings,
} from 'kysely'
import type { ReplicaStrategy } from './config.js'
import { KyselyReplicationConnection } from './connection.js'

export class KyselyReplicationDriver implements Driver {
	readonly #primaryDriver: Driver
	readonly #replicaDrivers: readonly Driver[]
	readonly #replicaStrategy: ReplicaStrategy

	constructor(
		primaryDriver: Driver,
		replicaDrivers: readonly Driver[],
		replicaStrategy: ReplicaStrategy,
	) {
		this.#primaryDriver = primaryDriver
		this.#replicaDrivers = replicaDrivers
		this.#replicaStrategy = replicaStrategy
	}

	async acquireConnection(): Promise<DatabaseConnection> {
		return new KyselyReplicationConnection(
			this.#primaryDriver,
			async (compiledQuery: CompiledQuery) => {
				const replicaIndex =
					'__replicaIndex__' in compiledQuery.query
						? (compiledQuery.query.__replicaIndex__ as number)
						: await this.#replicaStrategy.next(this.#replicaDrivers.length)

				const replicaDriver = this.#replicaDrivers[replicaIndex]

				if (!replicaDriver) {
					throw new Error(
						`KyselyReplication: no replicas found at index ${replicaIndex}!`,
					)
				}

				return replicaDriver
			},
			this.#replicaStrategy.onTransaction || 'error',
		)
	}

	async beginTransaction(
		connection: KyselyReplicationConnection,
		settings: TransactionSettings,
	): Promise<void> {
		await connection.beginTransaction(settings)
	}

	async commitTransaction(
		connection: KyselyReplicationConnection,
	): Promise<void> {
		await connection.commitTransaction()
	}

	async destroy(): Promise<void> {
		const results = await Promise.allSettled([
			this.#primaryDriver.destroy(),
			...this.#replicaDrivers.map((replica) => replica.destroy()),
		])

		const errors = this.#compileErrors(results)

		if (errors.length) {
			throw new AggregateError(
				errors,
				'KyselyReplicationDriver.destroy failed!',
			)
		}
	}

	async init(): Promise<void> {
		const results = await Promise.allSettled([
			this.#primaryDriver.init(),
			...this.#replicaDrivers.map((replica) => replica.init()),
		])

		const errors = this.#compileErrors(results)

		if (errors.length) {
			throw new AggregateError(errors, 'KyselyReplicationDriver.init failed!')
		}
	}

	async releaseConnection(
		connection: KyselyReplicationConnection,
	): Promise<void> {
		await connection.release()
	}

	async rollbackTransaction(
		connection: KyselyReplicationConnection,
	): Promise<void> {
		await connection.rollbackTransaction()
	}

	#compileErrors(results: PromiseSettledResult<unknown>[]): string[] {
		return results
			.map((result, index) =>
				result.status === 'fulfilled'
					? null
					: `${!index ? 'primary' : `replica-${index - 1}`}: ${result.reason}`,
			)
			.filter(Boolean) as string[]
	}
}
