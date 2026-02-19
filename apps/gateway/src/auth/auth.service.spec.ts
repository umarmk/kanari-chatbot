import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
const argon2 = require('argon2');

// Simple stubs for dependencies
const jwt = { signAsync: jest.fn().mockResolvedValue('access.jwt') } as any;
const prisma: any = {}; // injected but currently unused
const redis = { set: jest.fn(), get: jest.fn(), del: jest.fn() } as any;
const users = { findByEmail: jest.fn(), create: jest.fn() } as any;

describe('AuthService (unit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jwt.signAsync.mockResolvedValue('access.jwt');
  });

  it('login: throws invalid_credentials when user not found', async () => {
    users.findByEmail.mockResolvedValue(null);
    const svc = new AuthService(jwt, prisma, redis, users);
    await expect(svc.login('missing@example.com', 'pass')).rejects.toThrow(UnauthorizedException);
  });

  it('login: throws invalid_credentials when password mismatch', async () => {
    jest.spyOn(argon2, 'verify').mockResolvedValue(false as any);
    users.findByEmail.mockResolvedValue({ id: 'u1', email: 'a@b.c', passwordHash: 'hashed' });
    const svc = new AuthService(jwt, prisma, redis, users);
    await expect(svc.login('a@b.c', 'wrong')).rejects.toThrow(UnauthorizedException);
  });

  it('refresh: rejects when session is missing in redis', async () => {
    redis.get.mockResolvedValue(null);
    const svc = new AuthService(jwt, prisma, redis, users);
    await expect(svc.refresh('session1.suffix')).rejects.toThrow(UnauthorizedException);
  });

  it('refresh: rejects when refresh token hash mismatch', async () => {
    jest.spyOn(argon2, 'verify').mockResolvedValue(false as any);
    redis.get.mockResolvedValue(JSON.stringify({ userId: 'u1', refreshTokenHash: 'hash', createdAt: new Date().toISOString() }));
    const svc = new AuthService(jwt, prisma, redis, users);
    await expect(svc.refresh('session1.suffix')).rejects.toThrow(UnauthorizedException);
  });

  it('refresh: rotates session and returns new refresh token', async () => {
    jest.spyOn(argon2, 'verify').mockResolvedValue(true as any);
    jest.spyOn(argon2, 'hash').mockResolvedValue('newhash' as any);
    redis.get.mockResolvedValue(JSON.stringify({ userId: 'u1', refreshTokenHash: 'hash', createdAt: new Date().toISOString() }));
    redis.set.mockResolvedValue(undefined);

    const svc = new AuthService(jwt, prisma, redis, users);
    const res = await svc.refresh('session1.suffix');
    expect(res.access_token).toBe('access.jwt');
    expect(res.refresh_token).toMatch(/^session1\./);
    expect(redis.set).toHaveBeenCalledWith(expect.stringMatching(/^session:session1$/), expect.any(String), expect.any(Number));
  });

  it('logout: deletes session in redis', async () => {
    redis.del.mockResolvedValue(undefined);
    const svc = new AuthService(jwt, prisma, redis, users);
    await svc.logout('session1.suffix');
    expect(redis.del).toHaveBeenCalledWith('session:session1');
  });
});
