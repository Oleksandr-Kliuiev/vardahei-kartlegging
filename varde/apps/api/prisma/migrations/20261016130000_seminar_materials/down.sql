-- Down migration for 20261016130000_seminar_materials (hand-written; test databases and rollback
-- only: the material links of seminars are dropped).
DROP TABLE IF EXISTS "seminar_material";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261016130000_seminar_materials';
