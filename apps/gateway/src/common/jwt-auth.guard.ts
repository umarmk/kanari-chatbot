import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers['authorization'] as string | undefined;
    if (!auth || !auth.startsWith('Bearer ')) throw new UnauthorizedException();
    const token = auth.substring('Bearer '.length);
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      if (!payload?.sub) throw new UnauthorizedException();
      req.user = { sub: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}

