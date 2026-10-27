-- Row count of every table, one "schema.table<TAB>count" line each: backup.sh writes it into meta.json from
-- the dump's snapshot, restore-check.sh compares the restored database with it.
SELECT n.nspname || '.' || c.relname || E'\t' ||
  (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
ORDER BY 1;
