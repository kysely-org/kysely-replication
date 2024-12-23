# kysely-replication

```ts
import { Kysely, PostgresDialect } from 'kysely'
import { KyselyReplicationDialect } from 'kysely-replication'
import { RoundRobinReplicaStrategy } from 'kysely-replication/strategy/round-robin'
import { Pool } from 'pg'

const primaryDialect = new PostgresDialect({
    pool: new Pool({ connectionString: process.env.DATABASE_URL_PRIMARY })
})
const replicaDialects = [
    new PostgresDialect({
        pool: new Pool({ connectionString: process.env.DATABASE_URL_REPLICA_1 })
    }),
    new PostgresDialect({
        pool: new Pool({ connectionString: process.env.DATABASE_URL_REPLICA_2 })
    })
] as const

const db = new Kysely({
    dialect: new KyselyReplicationDialect({
        primaryDialect,
        replicaDialects,
        replicaStrategy: new RoundRobinReplicaStrategy({ onTransaction: 'error' })
    })
})

await db.selectFrom('person').selectAll().execute() // executes on replica
await db.insertInto('person').values({ name: 'Alice' }).execute() // executes on primary

await db.destroy()
```
