# Hostinger MySQL preparation

Stage 2 only prepares the database. The running application continues to use Firebase until a later, separately verified migration stage.

1. In Hostinger hPanel, create a MySQL database and database user.
2. Add the `MYSQL_*` variables shown in `.env.example` to the Hostinger application environment.
3. Run `npm run db:migrate` once from a terminal that can reach the Hostinger MySQL server.
4. Do not run any data-copy command yet. Stage 2 creates empty tables only.

Stage 3 performs a read-only Firebase snapshot and copies it into MySQL with:

`npm run db:migrate:firebase`

The copy never updates or deletes Firebase documents. It verifies every migrated user balance before marking the migration run as verified.

The migration command is repeatable: every migration filename is recorded in `schema_migrations` and will not be applied twice.
