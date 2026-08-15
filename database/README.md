# Hostinger MySQL preparation

Stage 2 only prepares the database. The running application continues to use Firebase until a later, separately verified migration stage.

1. In Hostinger hPanel, create a MySQL database and database user.
2. Add the `MYSQL_*` variables shown in `.env.example` to the Hostinger application environment.
3. Run `npm run db:migrate` once from a terminal that can reach the Hostinger MySQL server.
4. Do not run any data-copy command yet. Stage 2 creates empty tables only.

Stage 3 performs a read-only Firebase snapshot and copies it into MySQL with:

`npm run db:migrate:firebase`

The copy never updates or deletes Firebase documents. It verifies every migrated user balance before marking the migration run as verified.

For a Hostinger Node.js deployment without an npm terminal, set `RUN_FIREBASE_MYSQL_MIGRATION_ON_START=true` and redeploy. The HTTP server starts first and the copy runs in the background. A MySQL advisory lock prevents simultaneous copies, while a verified `firebase_initial_v1` record prevents later restarts from copying again.

Wait for a log containing `"status": "verified"`, confirm that `balanceMismatches` is empty, then set the switch back to `false` and redeploy. If Firestore reports `RESOURCE_EXHAUSTED`, keep the switch off until the quota resets.

## Stage 4 runtime store

`MYSQL_RUNTIME_STORE_MODE=shadow` keeps Firebase as the read source while every new central store snapshot is also written to MySQL. MySQL failures are logged but do not block the Firebase fallback. Do not select `primary` until the shadow snapshot has been observed successfully in production and the Stage 5 cutover is approved.

After shadow verification, `MYSQL_RUNTIME_STORE_MODE=primary` loads and saves the central runtime snapshot through MySQL and stops writes to `ludo_store/main`. Firebase Auth plus explicit user, admin, agent, OTP, manual-transaction and matchmaking compatibility records remain enabled until their financial transaction paths are migrated separately.

The migration command is repeatable: every migration filename is recorded in `schema_migrations` and will not be applied twice.
