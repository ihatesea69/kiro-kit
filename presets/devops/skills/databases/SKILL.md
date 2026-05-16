---
name: databases
description: Work with databases (PostgreSQL, MySQL, MongoDB) for schema design, query optimization, migrations, and administration. Use when dealing with data layer concerns.
---

# Databases

Activate this skill when working with database systems.

## When to Use

- Designing database schemas
- Writing or optimizing queries
- Planning migrations
- Configuring replication or backups
- Troubleshooting performance issues
- Managing database users and permissions

## Supported Systems

- PostgreSQL: relational, SQL, psql CLI
- MySQL/MariaDB: relational, SQL
- MongoDB: document database, aggregation pipelines
- Redis: key-value store, caching

## Rules

- Always use parameterized queries (prevent SQL injection)
- Test migrations in non-production first
- Include rollback scripts for every migration
- Use EXPLAIN ANALYZE for query optimization
- Follow least-privilege for database users
- Back up before destructive operations
- Index based on actual query patterns, not assumptions
