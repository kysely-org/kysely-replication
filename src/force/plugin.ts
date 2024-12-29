import type {
	KyselyPlugin,
	PluginTransformQueryArgs,
	PluginTransformResultArgs,
	QueryResult,
	RootOperationNode,
	UnknownRow,
} from 'kysely'

export class WithDialectPlugin implements KyselyPlugin {
	readonly #dialect: 'primary' | 'replica'
	readonly #replicaIndex?: number

	constructor(dialect: 'primary')
	constructor(dialect: 'replica', replicaIndex?: number)
	constructor(dialect: 'primary' | 'replica', replicaIndex?: number) {
		this.#dialect = dialect
		this.#replicaIndex = replicaIndex
	}

	transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
		return {
			...args.node,
			// @ts-ignore
			__dialect__: this.#dialect,
			__replicaIndex__: this.#replicaIndex,
		}
	}

	async transformResult(
		args: PluginTransformResultArgs,
	): Promise<QueryResult<UnknownRow>> {
		return args.result
	}
}
