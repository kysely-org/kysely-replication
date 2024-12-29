# kysely-replication

Production systems often use multiple database replicas to distribute read load 
and increase availability. `kysely-replication` is a set of ideas and utilities 
for building a replication-aware Kysely instance.

## Installation

```sh
npm install kysely kysely-replication
```

## Usage

This example demonstrates how to create a Kysely instance that uses a primary dialect 
for writes and 2 replica dialects for reads. The `RoundRobinReplicaStrategy` 
is used to distribute read queries evenly between the replicas. Alternatively,
the `RandomReplicaStrategy` can be imported from `kysely-replication/strategy/random` 
and used to randomly select a replica for each query.

The strategy is (optionally) configured to throw an error if a transaction is started 
on a replica connection - this can occur when using `db.connection()` and the first 
query is a read query. The error is thrown to prevent the transaction from being 
started on a replica connection, which could lead to inconsistencies in the database 
state.

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

await db.destroy() // destroys all sub-dialects
```

## Executes on Primary

### DDL Queries

DDL (Data Definition Language) queries execute on the primary dialect, as they 
change the structure of the database.

Basically, anything on `db.schema` is included.

### Raw Queries

We don't currently parse raw queries to determine if they are read or write queries. 
As a measure of caution, all raw queries execute on the primary dialect.

So anything that starts with `sql` template tag, as main query, or as subquery 
in a `with` clause.

### Write Queries

Write queries execute on the primary dialect, as they change the state of the database.

Basically, `db.insertInto`, `db.updateTable`, `db.deleteFrom`, `db.mergeInto`, `db.replaceInto` 
as the main query or as a subquery in a `with` clause.

### Transactions

Transactions more often than not contain write queries. They also more often than 
not obtain locks on the database to ensure consistency. For these reasons, transactions 
execute on the primary dialect.

As mentioned above, the `onTransaction` option in replica strategies can be used 
to throw an error if a transaction is started on a replica connection - a rare 
case that can occur when using `db.connection()` and the first query is a read 
query.

## Executes on Replicas

### Read Queries

Read queries execute on replica dialects, as you'd expect.

Basically, `db.selectFrom` and `db.selectNoFrom` queries that do not contain write 
queries in a `with` clause.
