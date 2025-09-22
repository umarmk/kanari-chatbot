import { BadRequestException } from '@nestjs/common';
import { OauthController } from './oauth.controller';

const prisma: any = {};
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
  it('callback: throws invalid_state when cookies missing', async () => {
    const ctrl = new OauthController(prisma, auth);
    const res = makeRes();
    await expect(ctrl.callback(res as any, 'code123', 'state123', undefined)).rejects.toThrow(BadRequestException);
  });
});

