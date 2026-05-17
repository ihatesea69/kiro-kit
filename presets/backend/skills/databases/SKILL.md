---
name: databases
description: >-
  Work with PostgreSQL, MongoDB, and Redis for schema design, query
  optimization, migrations, and data modeling. Use when designing or optimizing
  data layers.
license: MIT
---

# Databases

Activate this skill when working with database design, queries, migrations, or optimization.

## When to Use

- Designing database schemas and relationships
- Writing complex queries or aggregation pipelines
- Optimizing slow queries with indexes and execution plans
- Planning and executing database migrations
- Configuring replication, backups, or sharding
- Choosing between SQL and NoSQL for a use case

## PostgreSQL

- Use EXPLAIN ANALYZE for query optimization
- Create indexes based on WHERE, JOIN, and ORDER BY patterns
- Use partial indexes for filtered queries
- Prefer UUID or ULID for distributed primary keys
- Use transactions for multi-statement operations
- Implement row-level security for multi-tenant apps

## MongoDB

- Design schemas around access patterns (embed vs reference)
- Use compound indexes matching query patterns
- Leverage aggregation pipeline for complex transformations
- Use change streams for real-time data sync
- Implement schema validation at the database level

## Redis

- Use appropriate data structures (strings, hashes, sorted sets, streams)
- Set TTL on all cache entries
- Use Redis transactions (MULTI/EXEC) for atomic operations
- Implement pub/sub for real-time messaging
- Use Redis Streams for reliable message queues

## Migration Rules

- Migrations must be reversible (up and down)
- Never modify a deployed migration -- create a new one
- Test migrations against production-like data volumes
- Use zero-downtime migration patterns for live systems
- Back up data before destructive migrations
