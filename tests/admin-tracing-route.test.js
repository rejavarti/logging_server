const request = require('supertest');
const { createTestApp } = require('../server');

let app;
let token;

beforeAll(async () => {
  app = await createTestApp();
  // Login via API to obtain a Bearer token we can reuse for protected routes
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: process.env.AUTH_PASSWORD || 'testAdmin123!' });
  expect(loginRes.status).toBe(200);
  token = loginRes.body.token;
  expect(typeof token).toBe('string');
  expect(token.length).toBeGreaterThan(10);
});

describe('Admin Tracing UI and API', () => {
  test('GET /admin/tracing renders the tracing page (200)', async () => {
    const res = await request(app)
      .get('/admin/tracing')
      // RequireAuth accepts Bearer token for non-API routes too
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('Distributed Tracing & Observability');
  });

  test('GET /api/tracing/status returns success JSON', async () => {
    const res = await request(app)
      .get('/api/tracing/status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    // New API shape nests status details under "status"
    expect(res.body).toHaveProperty(['status','enabled']);
    expect(res.body).toHaveProperty(['status','service_name']);
  });
});
