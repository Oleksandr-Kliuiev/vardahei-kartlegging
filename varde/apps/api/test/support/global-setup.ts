import { databaseUrl, prisma } from './prisma-cli.js';

export default function setup(): void {
  const result = prisma(['migrate', 'deploy'], databaseUrl());
  if (result.status !== 0) throw new Error(`migrate deploy failed:\n${result.output}`);
}
