import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

// SSE parser that finishes early when it sees [DONE]
function sseParser(res: any, callback: any) {
  res.setEncoding('utf8');
  let data = '';
  let finished = false;
  const onData = (chunk: string) => {
    data += chunk;
    if (!finished && data.includes('[DONE]')) {
      finished = true;
      try { res.removeListener('data', onData); res.removeListener('end', onEnd); } catch {}
      try { (res as any).text = data; } catch {}
      callback(null, data);
      try { res.destroy(); } catch {}
    }
  };
  const onEnd = () => {
    if (!finished) {
      try { (res as any).text = data; } catch {}
      callback(null, data);
    }
  };
  res.on('data', onData);
  res.on('end', onEnd);
}

describe('SSE stream smoke test (no OpenRouter key)', () => {
  let app: INestApplication;
  let http: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => { await app.close(); });

  it('streams stubbed tokens and completes with [DONE]', async () => {
    const unique = Date.now();
    // Register user
    const reg = await request(http)
      .post('/auth/register')
      .send({ email: `sse${unique}@example.com`, password: 'SuperStrongPassw0rd!' })
      .expect(201);
    const access = reg.body.access_token as string;

    // Create project
    const proj = await request(http)
      .post('/projects')
      .set('Authorization', `Bearer ${access}`)
      .send({ name: 'SSEProj' })
      .expect(201);
    const projectId = proj.body.id as string;

    // Create chat
    const chat = await request(http)
      .post(`/projects/${projectId}/chats`)
      .set('Authorization', `Bearer ${access}`)
      .send({ title: 'SSE Chat' })
      .expect(201);
    const chatId = chat.body.id as string;

    // Hit stream endpoint (no x-openrouter-key; env OPENROUTER_API_KEY not set in tests)
    const resp = await request(http)
      .get(`/chats/${chatId}/stream`)
      .set('Authorization', `Bearer ${access}`)
      .set('Accept', 'text/event-stream')
      .query({ content: 'Hello there' })
      .buffer(true)
      .parse(sseParser)
      .expect(200);

    const text: string = (resp as any).text || '';
    // Expect SSE lines with data: ... and a [DONE]
    const dataCount = (text.match(/\n\s*data:/g) || []).length;
    expect(dataCount).toBeGreaterThanOrEqual(2);
    expect(text).toContain('[DONE]');
  });
});

