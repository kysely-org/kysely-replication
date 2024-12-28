import {
	type CompiledQuery,
	type DatabaseConnection,
	type Driver,
	type OperationNode,
	type QueryResult,
	type RootOperationNode,
	SelectQueryNode,
	type TransactionSettings,
} from 'kysely'

const PRIMARY_OPERATION_NODE_KINDS: Record<
	Exclude<RootOperationNode['kind'], 'SelectQueryNode'>,
	true
> = {
	AlterTableNode: true,
	CreateIndexNode: true,
	CreateSchemaNode: true,
	CreateTableNode: true,
	CreateTypeNode: true,
	CreateViewNode: true,
	DeleteQueryNode: true,
	DropIndexNode: true,
	DropSchemaNode: true,
	DropTableNode: true,
	DropTypeNode: true,
	DropViewNode: true,
	InsertQueryNode: true,
	MergeQueryNode: true,
	RawNode: true,
	UpdateQueryNode: true,
}

export class KyselyReplicationConnection implements DatabaseConnection {
	readonly #primaryDriver: Driver
	readonly #getReplicaDriver: () => Promise<Driver>
	readonly #onReplicaTransaction: 'error' | 'warn' | 'allow'
	#connection: DatabaseConnection | null
	#driver: Driver | null

	constructor(
		primary: Driver,
		getReplica: () => Promise<Driver>,
		onReplicaTransaction: 'error' | 'warn' | 'allow',
	) {
		this.#primaryDriver = primary
		this.#getReplicaDriver = getReplica
		this.#onReplicaTransaction = onReplicaTransaction
		this.#connection = null
		this.#driver = null
	}

	async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
		const { connection } = await this.#acquireDriverAndConnection(compiledQuery)

		return await connection.executeQuery(compiledQuery)
	}

	async *streamQuery<R>(
		compiledQuery: CompiledQuery,
		chunkSize: number,
	): AsyncIterableIterator<QueryResult<R>> {
		const { connection } = await this.#acquireDriverAndConnection(compiledQuery)

		for await (const result of connection.streamQuery<R>(
			compiledQuery,
			chunkSize,
		)) {
			yield result
		}
	}

	async beginTransaction(settings: TransactionSettings): Promise<void> {
		const { connection, driver } =
			await this.#acquireDriverAndConnection('transaction')

		if (driver !== this.#primaryDriver) {
			const message =
				'KyselyReplication: transaction started with replica connection!'

			if (this.#onReplicaTransaction === 'error') {
				throw new Error(message)
			}

			if (this.#onReplicaTransaction === 'warn') {
				console.warn(message)
			}
		}

		await driver.beginTransaction(connection, settings)
	}

	async commitTransaction(): Promise<void> {
		if (!this.#connection) {
			throw new Error('commitTransaction called without a transaction')
		}

		await this.#driver?.commitTransaction(this.#connection)
	}

	async rollbackTransaction(): Promise<void> {
		if (!this.#connection) {
			throw new Error('rollbackTransaction called without a transaction')
		}

		await this.#driver?.rollbackTransaction(this.#connection)
	}

	async release(): Promise<void> {
		if (!this.#connection) return

		await this.#driver?.releaseConnection(this.#connection)
	}

	async #acquireDriverAndConnection(
		compiledQueryOrContext: CompiledQuery | 'transaction',
	): Promise<{ connection: DatabaseConnection; driver: Driver }> {
		if (this.#connection && this.#driver) {
			return { connection: this.#connection, driver: this.#driver }
		}

		this.#driver =
			compiledQueryOrContext === 'transaction' ||
			this.#isQueryForPrimary(compiledQueryOrContext)
				? this.#primaryDriver
				: await this.#getReplicaDriver()

		this.#connection = await this.#driver.acquireConnection()

		return { connection: this.#connection, driver: this.#driver }
	}

	#isQueryForPrimary(compiledQuery: CompiledQuery): boolean {
		const { query } = compiledQuery

		return (
			this.#isOperationNodeForPrimary(query) ||
			(SelectQueryNode.is(query) &&
				Boolean(
					query.with?.expressions.some((e) =>
						this.#isOperationNodeForPrimary(e.expression),
					),
				))
		)
	}

	#isOperationNodeForPrimary(node: OperationNode): boolean {
		return PRIMARY_OPERATION_NODE_KINDS[
			node.kind as keyof typeof PRIMARY_OPERATION_NODE_KINDS
		]
	}
}
