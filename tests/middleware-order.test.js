const request = require('supertest');
const { createTestApp } = require('../server');

let app;

beforeAll(async () => {
  app = await createTestApp();
});

describe('Middleware & Security Headers', () => {
  test('Health endpoint accessible without auth', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBeDefined();
  });

  test('Security headers present on login page', async () => {
    const res = await request(app).get('/login');
    expect([200,302]).toContain(res.statusCode); // May redirect if already logged in
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-xss-protection']).toBeDefined();
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  test('API route rejects unauthenticated access with JSON 401', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBeDefined();
  });
});
