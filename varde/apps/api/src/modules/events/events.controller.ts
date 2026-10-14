import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AdminSessionGuard, type AdminRequest } from '../auth/admin-session.guard.js';
import { SessionService } from '../auth/session.service.js';
import { EventsService } from './events.service.js';

@Controller('/api/admin/events')
@UseGuards(AdminSessionGuard)
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly sessions: SessionService,
  ) {}

  @Get()
  stream(@Req() request: AdminRequest, @Res() reply: FastifyReply): void {
    reply.hijack();
    const response = reply.raw;
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.write('retry: 1000\n\n');
    const unsubscribe = this.events.subscribe(response);
    const expiry = setTimeout(
      () => response.end(),
      Math.max(0, request.adminSession!.expiresAt.getTime() - Date.now()),
    );
    const ping = setInterval(() => {
      void this.sessions
        .resolve(request)
        .then((session) => {
          if (!session) response.end();
          else response.write(': ping\n\n');
        })
        .catch(() => response.end());
    }, 25_000);
    expiry.unref();
    ping.unref();
    response.once('close', () => {
      clearInterval(ping);
      clearTimeout(expiry);
      unsubscribe();
    });
  }
}
