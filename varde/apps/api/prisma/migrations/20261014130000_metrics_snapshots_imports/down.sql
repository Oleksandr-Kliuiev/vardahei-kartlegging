-- Down migration for 20261014130000_metrics_snapshots_imports (hand-written; test databases and
-- rollback of an empty deployment only: released snapshots and the deletion ledger are dropped).
DROP TRIGGER IF EXISTS "aggregate_snapshot_released" ON "aggregate_snapshot";
DROP FUNCTION IF EXISTS "aggregate_snapshot_released"();
DROP TABLE IF EXISTS "deletion_tombstone";
DROP TABLE IF EXISTS "deletion_request";
DROP TABLE IF EXISTS "import_manifest";
DROP TABLE IF EXISTS "finding";
DROP TABLE IF EXISTS "finding_rule";
DROP TABLE IF EXISTS "round_metric_set";
DROP TABLE IF EXISTS "aggregate_snapshot";
DROP TABLE IF EXISTS "metric_definition";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261014130000_metrics_snapshots_imports';
