# prisma/migrations

Сгенерировано, не читать целиком: `migration.sql` создаёт `prisma migrate diff` / `migrate dev`.

- У каждой миграции есть рукописный `down.sql` рядом; его последняя строка — `DELETE FROM "_prisma_migrations" WHERE migration_name = '<имя папки>';`, иначе повторный `migrate deploy` ответит «No pending migrations».
- Вперёд/назад проверяет `apps/api/test/migrations.test.ts` (down.sql в обратном порядке → пустая база → снова deploy → нет разницы со схемой).
- Схема — `../schema.prisma`; сами миграции не входят в context-budget.
