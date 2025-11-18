const request = require('supertest');
const { createTestApp } = require('../server');


let app;
let token;
beforeAll(async () => {
  app = await createTestApp();
  // Authenticate and get JWT token
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: process.env.AUTH_PASSWORD || 'testAdmin123!' });
  token = loginRes.body.token;
});

describe('API Smoke Tests', () => {

  test('GET /api/logs returns success and logs array', async () => {
    const res = await request(app)
      .get('/api/logs')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('pageSize');
  });


  test('POST /api/webhooks creates webhook and returns success', async () => {
    const webhookData = { name: 'Test Webhook', url: 'http://localhost/test' };
    const res = await request(app)
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${token}`)
      .send(webhookData);
    expect(res.status).toBe(201); // Webhook creation returns 201 Created
    expect(res.body.success).toBe(true);
    expect(res.body.webhook).toBeDefined();
    expect(res.body.webhook.name).toBe(webhookData.name);
  });


  test('GET /api/stats returns success and stats object', async () => {
    const res = await request(app)
      .get('/api/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.stats).toBe('object');
  });
});
