import type { ReplicaStrategy } from '../config.js'

export interface RoundRobinReplicaStrategyOptions {
	onTransaction?: 'error' | 'warn' | 'allow'
}

export class RoundRobinReplicaStrategy implements ReplicaStrategy {
	readonly #options: RoundRobinReplicaStrategyOptions
	#lastReplica = -1

	constructor(options: RoundRobinReplicaStrategyOptions) {
		this.#options = { ...options }
	}

	async next(replicaCount: number): Promise<number> {
		this.#lastReplica = (this.#lastReplica + 1) % replicaCount
		return this.#lastReplica
	}

	get onTransaction(): 'error' | 'warn' | 'allow' | undefined {
		return this.#options.onTransaction
	}
}
