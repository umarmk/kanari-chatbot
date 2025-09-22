import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Stage 2 — Projects & Files (e2e)', () => {
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

  it('register → create project → upload file → list → delete', async () => {
    const unique = Date.now();
    // Register
    const reg = await request(http)
      .post('/auth/register')
      .send({ email: `user${unique}@example.com`, password: 'SuperStrongPassw0rd!' })
      .expect(201);

    const access = reg.body.access_token as string;
    expect(typeof access).toBe('string');

    // Create project
    const created = await request(http)
      .post('/projects')
      .set('Authorization', `Bearer ${access}`)
      .send({ name: 'My Project', system_prompt: 'You are helpful.' })
      .expect(201);

    const projectId = created.body.id as string;
    expect(projectId).toMatch(/[0-9a-f-]{36}/i);

    // List projects
    const list = await request(http)
      .get('/projects')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);

    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.find((p: any) => p.id === projectId)).toBeTruthy();

    // Upload a file (buffer)
    const up = await request(http)
      .post('/files')
      .set('Authorization', `Bearer ${access}`)
      .query({ project_id: projectId })
      .attach('file', Buffer.from('hello world'), 'hello.txt')
      .expect(201);

    const fileId = up.body.id as string;
    expect(fileId).toMatch(/[0-9a-f-]{36}/i);

    // List files
    const flist = await request(http)
      .get('/files')
      .set('Authorization', `Bearer ${access}`)
      .query({ project_id: projectId })
      .expect(200);

    expect(Array.isArray(flist.body)).toBe(true);
    expect(flist.body.some((f: any) => f.id === fileId)).toBe(true);

    // Delete file
    await request(http)
      .delete(`/files/${fileId}`)
      .set('Authorization', `Bearer ${access}`)
      .expect(200);
  });
});

