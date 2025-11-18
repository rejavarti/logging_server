const request = require('supertest');
const { createTestApp } = require('../server');

let app; let token;

beforeAll(async () => {
  app = await createTestApp();
  const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: process.env.AUTH_PASSWORD || 'testAdmin123!' });
  token = login.body.token;
});

describe('Ingestion parse & stats', () => {
  test('parse syslog message (fallback ok)', withSafeAsync(async () => {
    const message = '<34>Oct 11 22:14:15 myhost su: test message';
    const res = await request(app)
      .post('/api/ingestion/ingestion/test-parse')
      .set('Authorization', `Bearer ${token}`)
      .timeout({ response: 2000, deadline: 4000 })
      .send({ message, format: 'syslog' });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.parsed).toHaveProperty('message');
  }));

  test('parse invalid json fails validation', withSafeAsync(async () => {
    const res = await request(app)
      .post('/api/ingestion/ingestion/test-parse')
      .set('Authorization', `Bearer ${token}`)
      .timeout({ response: 2000, deadline: 4000 })
      .send({ message: '{bad json', format: 'json' });
    expect(res.statusCode).toBe(200);
    expect(res.body.validation.valid).toBe(false);
  }));

  test('ingestion stats shape', withSafeAsync(async () => {
    const res = await request(app)
      .get('/api/ingestion/ingestion/stats?period=1h')
      .set('Authorization', `Bearer ${token}`)
      .timeout({ response: 2000, deadline: 4000 });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.stats).toHaveProperty('by_protocol');
  }));
});
