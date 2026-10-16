// Guard of the presenter routes (3.4, ADR-008): the presenter key of a seminar, as a bearer. No key
// or an unknown key → 401; a revoked key, or a key outside the day before, on and after the seminar
// → 403. The key reaches only /api/presenter/* (its own poll); every other route ignores it.
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  type PresenterAccess,
  presenterBearer,
  PresenterTokenService,
} from './presenter-token.service.js';

export type PresenterRequest = FastifyRequest & { presenter?: PresenterAccess };

@Injectable()
export class PresenterGuard implements CanActivate {
  constructor(private readonly keys: PresenterTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PresenterRequest>();
    const access = await this.keys.resolve(presenterBearer(request));
    if (access === 'missing' || access === 'unknown')
      throw new UnauthorizedException('Lenkja til storskjermen er ikkje gyldig.');
    if (access === 'revoked')
      throw new ForbiddenException('Lenkja til storskjermen er trekt tilbake. Be om ei ny.');
    if (access === 'outside')
      throw new ForbiddenException(
        'Lenkja til storskjermen verkar berre frå dagen før til dagen etter seminaret.',
      );
    if (access === 'no-poll') throw new NotFoundException('Seminaret har ingen live-spørsmål.');
    request.presenter = access;
    return true;
  }
}
