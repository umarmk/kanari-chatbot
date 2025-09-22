import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Stage 3 — Chats & Messages (e2e)', () => {
  let app: INestApplication;
  let http: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('register → create project → create chat → list chats → add message → list messages', async () => {
    const unique = Date.now();
    // Register
    const reg = await request(http)
      .post('/auth/register')
      .send({ email: `user${unique}@example.com`, password: 'SuperStrongPassw0rd!' })
      .expect(201);

    const access = reg.body.access_token as string;

    // Create project
    const created = await request(http)
      .post('/projects')
      .set('Authorization', `Bearer ${access}`)
      .send({ name: 'ChatProj' })
      .expect(201);

    const projectId = created.body.id as string;

    // Create chat
    const chatRes = await request(http)
      .post(`/projects/${projectId}/chats`)
      .set('Authorization', `Bearer ${access}`)
      .send({ title: 'My Chat' })
      .expect(201);

    const chatId = chatRes.body.id as string;

    // List chats
    const chats = await request(http)
      .get(`/projects/${projectId}/chats`)
      .set('Authorization', `Bearer ${access}`)
      .expect(200);
    expect(Array.isArray(chats.body)).toBe(true);
    expect(chats.body.find((c: any) => c.id === chatId)).toBeTruthy();

    // Add user message
    const msg = await request(http)
      .post(`/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${access}`)
      .send({ content: 'Hello there' })
      .expect(201);
    expect(msg.body.role).toBe('user');

    // List messages
    const mlist = await request(http)
      .get(`/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${access}`)
      .expect(200);
    expect(Array.isArray(mlist.body)).toBe(true);
    expect(mlist.body.some((m: any) => m.id === msg.body.id)).toBe(true);
  });
});

