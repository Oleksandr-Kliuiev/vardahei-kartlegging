// Global exception filter (task 0.6): neither the log nor the response carries a query string.
// Nest's default "Cannot GET /path?c=…" message is rebuilt from the path only; unexpected
// errors are logged with their stack, queries stripped.
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { pathOnly, stripQueries } from './request-log.js';

@Catch()
export class QuerySafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('error');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const reply = http.getResponse<FastifyReply>();
    const request = http.getRequest<FastifyRequest>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        status === 404 && typeof body === 'object' && /^Cannot /.test(exception.message)
          ? `Cannot ${request.method} ${pathOnly(request.url)}`
          : stripQueries(exception.message);
      const payload =
        typeof body === 'object' && body !== null
          ? { ...(body as Record<string, unknown>), message }
          : { statusCode: status, message };
      void reply.status(status).send(payload);
      return;
    }
    const error = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(stripQueries(error.stack ?? error.message));
    void reply
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .send({ statusCode: 500, message: 'Internal server error' });
  }
}
