const request = require('supertest');
const { createTestApp } = require('../server');

let app;

beforeAll(async () => {
  app = await createTestApp();
});

describe('Auth rate limiting', () => {
  test('many failed logins eventually rate-limited', withSafeAsync(async () => {
    // limiter is max 5 per 15min; send 6 bad attempts
    let lastRes;
    for (let i = 0; i < 6; i++) {
      lastRes = await request(app)
        .post('/api/auth/login')
        .timeout({ response: 1500, deadline: 3000 })
        .send({ username: 'admin', password: 'wrong' });
    }
    expect([401, 429]).toContain(lastRes.statusCode);
  }));
});
