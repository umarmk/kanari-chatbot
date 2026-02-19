import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';
import { randomBytes, randomUUID } from 'crypto';

const ACCESS_EXPIRES = '15m';
const REFRESH_DAYS = 7; // session expiry
const REFRESH_SECONDS = REFRESH_DAYS * 24 * 60 * 60; // 7 days in seconds

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly users: UsersService,
  ) {}

  private signAccessToken(userId: string) {
    const payload = { sub: userId };
    return this.jwt.signAsync(payload, { expiresIn: ACCESS_EXPIRES });
  }

  private async createSession(userId: string) {
    // Generate a unique session ID
    const sessionId = randomUUID();
    const tokenSuffix = randomBytes(32).toString('base64url');
    const refreshToken = `${sessionId}.${tokenSuffix}`;
    const refreshTokenHash = await argon2.hash(refreshToken, { type: argon2.argon2id });

    // Store session in Redis with TTL
    const sessionData = JSON.stringify({
      userId,
      refreshTokenHash,
      createdAt: new Date().toISOString(),
    });

    await this.redis.set(`session:${sessionId}`, sessionData, REFRESH_SECONDS);

    return { sessionId, refreshToken };
  }

  private async rotateSession(sessionId: string, userId: string) {
    const tokenSuffix = randomBytes(32).toString('base64url');
    const refreshToken = `${sessionId}.${tokenSuffix}`;
    const refreshTokenHash = await argon2.hash(refreshToken, { type: argon2.argon2id });

    // Update session in Redis with new hash and reset TTL
    const sessionData = JSON.stringify({
      userId,
      refreshTokenHash,
      createdAt: new Date().toISOString(),
    });

    await this.redis.set(`session:${sessionId}`, sessionData, REFRESH_SECONDS);

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
    if (!sessionId) throw new UnauthorizedException('invalid_refresh_token');

    // Get session from Redis
    const sessionDataStr = await this.redis.get(`session:${sessionId}`);
    if (!sessionDataStr) throw new UnauthorizedException('invalid_refresh_token');

    const sessionData = JSON.parse(sessionDataStr) as {
      userId: string;
      refreshTokenHash: string;
      createdAt: string;
    };

    // Verify refresh token hash
    const ok = await argon2.verify(sessionData.refreshTokenHash, refreshToken);
    if (!ok) throw new UnauthorizedException('invalid_refresh_token');

    // Issue new tokens
    const access_token = await this.signAccessToken(sessionData.userId);
    const { refreshToken: newRefresh } = await this.rotateSession(sessionId, sessionData.userId);

    return { access_token, refresh_token: newRefresh };
  }

  async logout(refreshToken: string) {
    const sessionId = refreshToken.split('.')[0];
    if (!sessionId) return;
    await this.redis.del(`session:${sessionId}`).catch(() => undefined);
  }
}

