import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

// Simple stubs for dependencies
const jwt = { signAsync: jest.fn().mockResolvedValue('access.jwt') } as any;

function makePrisma(overrides: Partial<any> = {}) {
  return {
    user: { findUnique: jest.fn(), create: jest.fn() },
    session: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    ...overrides,
  } as any;
}

function makeUsers(prisma: any) {
  return {
    findByEmail: (email: string) => prisma.user.findUnique({ where: { email } }),
    create: (email: string, passwordHash: string) => prisma.user.create({ data: { email, passwordHash } }),
  } as any;
}

describe('AuthService (unit)', () => {
  beforeEach(() => jest.resetAllMocks());

  it('login: throws invalid_credentials when user not found', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(null);
    const users = makeUsers(prisma);
    const svc = new AuthService(jwt, prisma, users);

    await expect(svc.login('missing@example.com', 'pass')).rejects.toThrow(UnauthorizedException);
  });

  it('login: throws invalid_credentials when password mismatch', async () => {
    jest.spyOn(require('argon2'), 'verify').mockResolvedValue(false as any);
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.c', passwordHash: 'hashed' });
    const users = makeUsers(prisma);
    const svc = new AuthService(jwt, prisma, users);

    await expect(svc.login('a@b.c', 'wrong')).rejects.toThrow(UnauthorizedException);
  });

  it('refresh: rejects non-uuid token prefix', async () => {
    const prisma = makePrisma();
    const users = makeUsers(prisma);
    const svc = new AuthService(jwt, prisma, users);

    await expect(svc.refresh('not-a-uuid.suffix')).rejects.toThrow(UnauthorizedException);
  });

  it('refresh: maps Prisma P2023 to invalid_refresh_token', async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockRejectedValue({ code: 'P2023' });
    const users = makeUsers(prisma);
    const svc = new AuthService(jwt, prisma, users);

    // well-formed UUID prefix but prisma throws P2023
    const token = '123e4567-e89b-12d3-a456-426614174000.suf';
    await expect(svc.refresh(token)).rejects.toThrow(UnauthorizedException);
  });

  it('logout: deletes session by id from token prefix', async () => {
    const prisma = makePrisma();
    prisma.session.delete.mockResolvedValue(undefined);
    const users = makeUsers(prisma);
    const svc = new AuthService(jwt, prisma, users);
    await svc.logout('123e4567-e89b-12d3-a456-426614174000.abcd');
    expect(prisma.session.delete).toHaveBeenCalledWith({ where: { id: '123e4567-e89b-12d3-a456-426614174000' } });
  });
});

