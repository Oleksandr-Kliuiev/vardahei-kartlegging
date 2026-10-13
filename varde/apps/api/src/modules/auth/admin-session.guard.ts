// Guard of every admin route (0.7; used from 0.15 on): a valid server-side session of this
// listener, otherwise 401.
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { SessionService } from './session.service.js';
import type { StoredSession } from './session.store.js';

export type AdminRequest = FastifyRequest & { adminSession?: StoredSession };

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const session = await this.sessions.resolve(request);
    if (session === null) throw new UnauthorizedException();
    request.adminSession = session;
    return true;
  }
}
