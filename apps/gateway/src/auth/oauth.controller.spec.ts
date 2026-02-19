import { BadRequestException } from '@nestjs/common';
import { OauthController } from './oauth.controller';

const prisma: any = { user: { findFirst: jest.fn() } };
const auth: any = { issueTokensForUser: jest.fn() };

function makeRes(signedCookies: Record<string, any> = {}) {
  const res: any = {
    req: { signedCookies },
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
  };
  // Nest passes Express Response; our controller reads res.req
  return res;
}

describe('OauthController (unit)', () => {
  const originalFetch = (global as any).fetch;
  afterEach(() => {
    (global as any).fetch = originalFetch;
  });

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.WEB_URL = 'https://app.example/base';
  });

  it('callback: throws invalid_state when cookies missing', async () => {
    const ctrl = new OauthController(prisma, auth);
    const res = makeRes();
    await expect(ctrl.callback(res as any, 'code123', 'state123', undefined)).rejects.toThrow(BadRequestException);
  });

  it('start: ignores absolute redirect URLs', async () => {
    const ctrl = new OauthController(prisma, auth);
    const res = makeRes();
    await ctrl.start(res as any, 'https://evil.example');
    const redirectCookieCalls = (res.cookie as any).mock.calls.filter((c: any[]) => c[0] === 'g_redirect');
    expect(redirectCookieCalls.length).toBe(0);
  });

  it('start: stores safe relative redirect paths', async () => {
    const ctrl = new OauthController(prisma, auth);
    const res = makeRes();
    await ctrl.start(res as any, '/safe/path');
    expect(res.cookie).toHaveBeenCalledWith('g_redirect', '/safe/path', expect.any(Object));
  });

  it('callback: uses stored safe redirect path under WEB_URL', async () => {
    const ctrl = new OauthController(prisma, auth);
    const res = makeRes({ g_state: 'state123', g_verifier: 'verifier123', g_redirect: '/safe/path' });

    (global as any).fetch = jest.fn(async (url: string) => {
      if (url.includes('oauth2.googleapis.com/token')) {
        return { ok: true, json: async () => ({ access_token: 'google_at' }) } as any;
      }
      if (url.includes('openidconnect.googleapis.com/v1/userinfo')) {
        return { ok: true, json: async () => ({ sub: 'sub123', email: 'x@y.z' }) } as any;
      }
      throw new Error(`unexpected_fetch:${url}`);
    });

    prisma.user.findFirst.mockResolvedValue({ id: 'u1' });
    auth.issueTokensForUser.mockResolvedValue({ access_token: 'at', refresh_token: 'rt' });

    await ctrl.callback(res as any, 'code123', 'state123', undefined);
    expect(res.redirect).toHaveBeenCalledWith('https://app.example/base/safe/path#access_token=at&refresh_token=rt');
  });

  it('callback: falls back to /auth/callback when stored redirect is invalid', async () => {
    const ctrl = new OauthController(prisma, auth);
    const res = makeRes({ g_state: 'state123', g_verifier: 'verifier123', g_redirect: 'https://evil.example' });

    (global as any).fetch = jest.fn(async (url: string) => {
      if (url.includes('oauth2.googleapis.com/token')) {
        return { ok: true, json: async () => ({ access_token: 'google_at' }) } as any;
      }
      if (url.includes('openidconnect.googleapis.com/v1/userinfo')) {
        return { ok: true, json: async () => ({ sub: 'sub123', email: 'x@y.z' }) } as any;
      }
      throw new Error(`unexpected_fetch:${url}`);
    });

    prisma.user.findFirst.mockResolvedValue({ id: 'u1' });
    auth.issueTokensForUser.mockResolvedValue({ access_token: 'at', refresh_token: 'rt' });

    await ctrl.callback(res as any, 'code123', 'state123', undefined);
    expect(res.redirect).toHaveBeenCalledWith('https://app.example/base/auth/callback#access_token=at&refresh_token=rt');
  });
});
