import { QueryCreator, SchemaModule } from 'kysely'
import { WithDialectPlugin } from './plugin.js'

declare module 'kysely' {
	export interface QueryCreator<DB> {
		/**
		 * Use the primary dialect for the next queries.
		 */
		withPrimary(): this

		/**
		 * Use a replica dialect for the next queries.
		 *
		 * @param replicaIndex - The index of the replica to use. If not provided, defaults to replica strategy.
		 */
		withReplica(replicaIndex?: number): this
	}

	export interface SchemaModule {
		/**
		 * Use the primary dialect for the next queries.
		 */
		withPrimary(): this

		/**
		 * Use a replica dialect for the next queries.
		 *
		 * @param replicaIndex - The index of the replica to use. If not provided, defaults to replica strategy.
		 */
		withReplica(replicaIndex?: number): this
	}
}

QueryCreator.prototype.withPrimary = function (this: QueryCreator<unknown>) {
	return this.withPlugin(new WithDialectPlugin('primary'))
}

QueryCreator.prototype.withReplica = function (
	this: QueryCreator<unknown>,
	replicaIndex?: number,
) {
	return this.withPlugin(new WithDialectPlugin('replica', replicaIndex))
}

SchemaModule.prototype.withPrimary = function (this: SchemaModule) {
	return this.withPlugin(new WithDialectPlugin('primary'))
}

SchemaModule.prototype.withReplica = function (
	this: SchemaModule,
	replicaIndex?: number,
) {
	return this.withPlugin(new WithDialectPlugin('replica', replicaIndex))
}
