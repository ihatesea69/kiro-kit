---
name: databases
description: >-
  Work with PostgreSQL, MongoDB, and Redis for schema design, query
  optimization, migrations, and data modeling. Use when designing or optimizing
  data layers.
license: MIT
---

# Databases

Activate when working with database design, queries, migrations, or optimization.

## When to Use

- Designing database schemas and relationships
- Writing complex queries or aggregation pipelines
- Optimizing slow queries with indexes and execution plans
- Planning and executing database migrations
- Configuring replication, backups, or sharding

## PostgreSQL

- Use EXPLAIN ANALYZE for query optimization
- Create indexes based on WHERE, JOIN, ORDER BY patterns
- Use partial indexes for filtered queries
- Prefer UUID or ULID for distributed primary keys
- Use transactions for multi-statement operations

## Migration Rules

- Migrations must be reversible (up and down)
- Never modify a deployed migration -- create a new one
- Test migrations against production-like data volumes
- Use zero-downtime migration patterns for live systems
- Back up data before destructive migrations

## Redis

- Use appropriate data structures (strings, hashes, sorted sets)
- Set TTL on all cache entries
- Use Redis transactions (MULTI/EXEC) for atomic operations
- Implement pub/sub for real-time messaging
