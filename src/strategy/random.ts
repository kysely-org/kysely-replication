import type { ReplicaStrategy } from '../config.js'

export interface RandomReplicaStrategyOptions {
	onTransaction?: 'error' | 'warn' | 'allow'
}

export class RandomReplicaStrategy implements ReplicaStrategy {
	readonly #options?: RandomReplicaStrategyOptions

	constructor(options?: RandomReplicaStrategyOptions) {
		this.#options = { ...options }
	}

	async next(replicaCount: number): Promise<number> {
		return Math.floor(Math.random() * replicaCount)
	}

	get onTransaction(): 'error' | 'warn' | 'allow' | undefined {
		return this.#options?.onTransaction
	}
}
