// pg-boss 10 in the database varde under varde_app, schema pgboss (task 0.9, ADR-003).
import { Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import PgBoss from 'pg-boss';
import { type JobPayload, JobPayloadSchema, type JobType } from './job-config.js';

export class JobPayloadRejected extends Error {
  constructor(name: string) {
    super(`job payload rejected for ${name}: only {id: uuid, hash?: sha256 hex} is allowed`);
  }
}

export type JobHandler = (payload: JobPayload) => Promise<void>;

export interface JobsOptions {
  connectionString: string | undefined;
  /** pgboss_pool of config/db-budget.json. */
  max: number;
}

/** Retention of finished jobs (class pgboss_jobs in 0.19). */
export const ARCHIVE_COMPLETED_AFTER_SECONDS = 12 * 3600;
export const DELETE_AFTER_DAYS = 7;
const RESTART_DELAY_MS = 30_000;

export class JobsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('jobs');
  private readonly handlers = new Map<string, JobHandler>();
  private readonly types: Map<string, JobType>;
  private boss: PgBoss | undefined;
  private retryTimer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(
    types: JobType[],
    private readonly options: JobsOptions,
  ) {
    this.types = new Map(types.map((t) => [t.name, t]));
  }

  /** The app starts without a database: pg-boss starts in the background and retries. */
  onApplicationBootstrap(): void {
    if (this.options.connectionString === undefined || this.options.connectionString === '') {
      this.logger.warn('jobs disabled: DATABASE_URL is not set');
      return;
    }
    void this.startWithRetry();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  private async startWithRetry(): Promise<void> {
    try {
      await this.start();
    } catch (error) {
      this.logger.error(`start failed, retry in 30 s: ${(error as Error).message}`);
      await this.discard();
      if (!this.stopped)
        this.retryTimer = setTimeout(() => void this.startWithRetry(), RESTART_DELAY_MS);
    }
  }

  get running(): boolean {
    return this.boss !== undefined;
  }

  async start(): Promise<void> {
    const connectionString = this.options.connectionString;
    if (connectionString === undefined || connectionString === '') {
      throw new Error('DATABASE_URL is not set');
    }
    const boss = new PgBoss({
      connectionString,
      max: this.options.max,
      schema: 'pgboss',
      archiveCompletedAfterSeconds: ARCHIVE_COMPLETED_AFTER_SECONDS,
      deleteAfterDays: DELETE_AFTER_DAYS,
    });
    boss.on('error', (error: Error) => this.logger.error(error.message));
    this.boss = boss;
    await boss.start();
    for (const type of this.types.values()) {
      if ((await boss.getQueue(type.name)) === null) {
        await boss.createQueue(type.name, {
          name: type.name,
          policy: type.policy,
          ...queueLimits(type),
        });
      } else {
        await boss.updateQueue(type.name, {
          name: type.name,
          policy: type.policy,
          ...queueLimits(type),
        });
      }
    }
    for (const name of this.handlers.keys()) await this.work(name);
  }

  /** `settings` of a type from config/jobs.json (e.g. sleepSeconds, holdUrl). */
  settings(name: string): Record<string, unknown> {
    return this.type(name).settings;
  }

  /** Handler of a type; registered before or after start. */
  async register(name: string, handler: JobHandler): Promise<void> {
    this.type(name);
    this.handlers.set(name, handler);
    if (this.boss !== undefined) await this.work(name);
  }

  private async work(name: string): Promise<void> {
    const boss = this.requireBoss();
    const type = this.type(name);
    const handler = this.handlers.get(name);
    if (handler === undefined) return;
    for (let i = 0; i < type.concurrency; i += 1) {
      await boss.work<JobPayload>(
        name,
        { batchSize: 1, pollingIntervalSeconds: type.pollingIntervalSeconds },
        async ([job]) => {
          if (job !== undefined) await handler(JobPayloadSchema.parse(job.data));
        },
      );
    }
  }

  /** Validates the payload strictly; the singletonKey is the type's idempotency key. */
  async enqueue(name: string, payload: unknown): Promise<string | null> {
    const type = this.type(name);
    const parsed = JobPayloadSchema.safeParse(payload);
    if (!parsed.success) throw new JobPayloadRejected(name);
    return this.requireBoss().send(name, parsed.data, {
      singletonKey: type.idempotency(parsed.data),
      ...queueLimits(type),
    });
  }

  async getJob(name: string, id: string): Promise<PgBoss.JobWithMetadata<JobPayload> | null> {
    return this.requireBoss().getJobById<JobPayload>(name, id, { includeArchive: true });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    const boss = this.boss;
    this.boss = undefined;
    if (boss !== undefined) await boss.stop({ graceful: false, wait: true });
  }

  private async discard(): Promise<void> {
    const boss = this.boss;
    this.boss = undefined;
    if (boss !== undefined) await boss.stop({ graceful: false, wait: true }).catch(() => undefined);
  }

  private type(name: string): JobType {
    const type = this.types.get(name);
    if (type === undefined) throw new Error(`unknown job type: ${name}`);
    return type;
  }

  private requireBoss(): PgBoss {
    if (this.boss === undefined) throw new Error('jobs are not running');
    return this.boss;
  }
}

function queueLimits(type: JobType): PgBoss.RetryOptions & PgBoss.ExpirationOptions {
  return {
    retryLimit: type.retryLimit,
    retryDelay: type.retryDelaySeconds,
    retryBackoff: type.retryBackoff === 'exponential',
    expireInSeconds: type.timeoutSeconds,
  };
}
