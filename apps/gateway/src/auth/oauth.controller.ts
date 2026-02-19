import { Controller, Get, Query, Res, BadRequestException } from '@nestjs/common';
import type { Response, Request } from 'express';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

// Google OAuth (PKCE) controller.
// - Uses signed, short-lived cookies to store state + code_verifier between /start and /callback.
// - Restricts optional `redirect` to safe, root-relative paths to prevent token exfiltration via open redirects.
function base64url(input: Buffer) {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function oauthCookieOpts() {
  return { httpOnly: true, signed: true as const, sameSite: 'lax' as const, maxAge: 10 * 60 * 1000 };
}

// Only allow root-relative paths like `/some/page`.
// Reject absolute URLs, scheme-relative URLs (`//evil.example`), fragments, and control characters.
function normalizeRedirectPath(input?: string): string | null {
  if (!input) return null;
  const v = String(input);
  if (v.length > 2048) return null;
  // Must be a root-relative path; disallow scheme-relative URLs like //evil.example
  if (!v.startsWith('/') || v.startsWith('//')) return null;
  // Reject control chars and backslashes
  if (/[\u0000-\u001F\u007F\\]/.test(v)) return null;
  // Drop any fragment; we'll attach our own for tokens.
  return v.split('#')[0];
}

function pkceChallenge(verifier: string) {
  const hash = createHash('sha256').update(verifier).digest();
  return base64url(hash);
}

@Controller('auth/google')
export class OauthController {
  constructor(private readonly prisma: PrismaService, private readonly auth: AuthService) {}

  @Get('start')
  async start(@Res() res: Response, @Query('redirect') redirect?: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const redirectUri = `${process.env.GATEWAY_PUBLIC_URL ?? 'http://localhost:3000'}/auth/google/callback`;

    if (!clientId) throw new BadRequestException('google_not_configured');

    const state = base64url(randomBytes(16));
    const verifier = base64url(randomBytes(32));
    const challenge = pkceChallenge(verifier);

    // Short-lived, signed, httpOnly cookies to keep state and verifier
    const cookieOpts = oauthCookieOpts();
    res.cookie('g_state', state, cookieOpts);
    res.cookie('g_verifier', verifier, cookieOpts);
    const redirectPath = normalizeRedirectPath(redirect);
    if (redirectPath) res.cookie('g_redirect', redirectPath, cookieOpts);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      include_granted_scopes: 'true',
      access_type: 'offline',
      prompt: 'consent',
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return res.redirect(url);
  }

  @Get('callback')
  async callback(@Res() res: Response, @Query('code') code?: string, @Query('state') state?: string, @Query('error') error?: string) {
    if (error) throw new BadRequestException(error);
    if (!code || !state) throw new BadRequestException('invalid_callback');

    const req = res.req as Request;
    const savedState = (req as any).signedCookies?.['g_state'];
    const verifier = (req as any).signedCookies?.['g_verifier'];
    const redirectAfter = normalizeRedirectPath((req as any).signedCookies?.['g_redirect']);

    if (!savedState || !verifier || state !== savedState) throw new BadRequestException('invalid_state');

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = `${process.env.GATEWAY_PUBLIC_URL ?? 'http://localhost:3000'}/auth/google/callback`;

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
    });

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!tokenResp.ok) throw new BadRequestException('token_exchange_failed');
    const tokenJson = await tokenResp.json();

    // Get profile (email, sub, name) via userinfo endpoint
    const userResp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!userResp.ok) throw new BadRequestException('userinfo_failed');
    const profile = (await userResp.json()) as { sub: string; email?: string };

    // Upsert user and oauth account
    let user = await this.prisma.user.findFirst({
      where: { oauthAccounts: { some: { provider: 'google', providerUserId: profile.sub } } },
    });
    if (!user) {
      if (profile.email) {
        user = await this.prisma.user.findUnique({ where: { email: profile.email } });
      }
      if (!user) {
        user = await this.prisma.user.create({ data: { email: profile.email ?? `g_${profile.sub}@users.local` } });
      }
      await this.prisma.oauthAccount.upsert({
        where: { provider_providerUserId: { provider: 'google', providerUserId: profile.sub } },
        create: { provider: 'google', providerUserId: profile.sub, userId: user.id },
        update: {},
      });
    }

    const tokens = await this.auth.issueTokensForUser(user.id);

    // Clear cookies and redirect with tokens in URL fragment for SPA to pick up
    const cookieOpts = oauthCookieOpts();
    res.clearCookie('g_state', cookieOpts);
    res.clearCookie('g_verifier', cookieOpts);
    res.clearCookie('g_redirect', cookieOpts);

    const webUrlEnv = process.env.WEB_URL;
    const frontendBase = (webUrlEnv ? webUrlEnv.split(',')[0].trim() : '') || 'http://localhost:5173';
    if (process.env.NODE_ENV === 'production' && !webUrlEnv) {
      throw new BadRequestException('web_url_not_configured');
    }

    const base = frontendBase.endsWith('/') ? frontendBase.slice(0, -1) : frontendBase;
    const path = redirectAfter || '/auth/callback';
    const fragment = new URLSearchParams(tokens as any).toString();
    return res.redirect(`${base}${path}#${fragment}`);
  }
}
