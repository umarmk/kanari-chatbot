import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { randomBytes } from 'crypto';

const ACCESS_EXPIRES = '15m';
const REFRESH_DAYS = 7; // session expiry
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  private signAccessToken(userId: string) {
    const payload = { sub: userId };
    return this.jwt.signAsync(payload, { expiresIn: ACCESS_EXPIRES });
  }

  private async createSession(userId: string) {
    // Create session first to get UUID id
    const session = await this.prisma.session.create({
      data: {
        userId,
        expiresAt: addDays(new Date(), REFRESH_DAYS),
      },
    });

    const tokenSuffix = randomBytes(32).toString('base64url');
    const refreshToken = `${session.id}.${tokenSuffix}`;
    const refreshTokenHash = await argon2.hash(refreshToken, { type: argon2.argon2id });

    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash },
    });

    return { sessionId: session.id, refreshToken };
  }

  private async rotateSession(sessionId: string, userId: string) {
    const tokenSuffix = randomBytes(32).toString('base64url');
    const refreshToken = `${sessionId}.${tokenSuffix}`;
    const refreshTokenHash = await argon2.hash(refreshToken, { type: argon2.argon2id });
    const expiresAt = addDays(new Date(), REFRESH_DAYS);

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { refreshTokenHash, expiresAt },
    });

    return { refreshToken };
  }

  async register(email: string, password: string) {
    const existing = await this.users.findByEmail(email);
    if (existing) throw new BadRequestException('email_already_in_use');

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await this.users.create(email, passwordHash);

    const access_token = await this.signAccessToken(user.id);
    const { refreshToken } = await this.createSession(user.id);

    return { access_token, refresh_token: refreshToken };
  }

  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user || !user.passwordHash) throw new UnauthorizedException('invalid_credentials');

    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException('invalid_credentials');

    return this.issueTokensForUser(user.id);
  }

  async issueTokensForUser(userId: string) {
    const access_token = await this.signAccessToken(userId);
    const { refreshToken } = await this.createSession(userId);
    return { access_token, refresh_token: refreshToken };
  }

  async refresh(refreshToken: string) {
    const sessionId = refreshToken.split('.')[0];
    if (!sessionId || !UUID_RE.test(sessionId)) throw new UnauthorizedException('invalid_refresh_token');

    let session;
    try {
      session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    } catch (e: any) {
      if (e?.code === 'P2023') throw new UnauthorizedException('invalid_refresh_token');
      throw e;
    }
    if (!session) throw new UnauthorizedException('invalid_refresh_token');
    if (session.expiresAt < new Date()) throw new UnauthorizedException('session_expired');

    const ok = session.refreshTokenHash
      ? await argon2.verify(session.refreshTokenHash, refreshToken)
      : false;
    if (!ok) throw new UnauthorizedException('invalid_refresh_token');

    const access_token = await this.signAccessToken(session.userId);
    const { refreshToken: newRefresh } = await this.rotateSession(session.id, session.userId);

    return { access_token, refresh_token: newRefresh };
  }

  async logout(refreshToken: string) {
    const sessionId = refreshToken.split('.')[0];
    if (!sessionId) return;
    await this.prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined);
  }
}

