// Idempotent seed (task 0.4): stage 0 has no data; it records one `seed.run` row by fixed id.
import { PrismaClient } from '@prisma/client';

export const SEED_RUN_ID = '00000000-0000-4000-8000-000000000001';

export async function seed(prisma: PrismaClient): Promise<void> {
  await prisma.auditLog.upsert({
    where: { id: SEED_RUN_ID },
    create: { id: SEED_RUN_ID, who: 'seed', what: 'seed.run', target: null },
    update: {},
  });
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seed(prisma)
    .then(() => console.log('seed: ok'))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => void prisma.$disconnect());
}
