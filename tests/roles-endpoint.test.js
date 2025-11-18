const request = require('supertest');
const path = require('path');

describe('Roles Endpoint', () => {
  let app;
  let token;

  beforeAll(async () => {
    process.env.AUTH_PASSWORD = 'testAdmin123!';
    process.env.NODE_ENV = 'test';
    const srvPath = path.join(__dirname, '..', 'server.js');
    const exported = require(srvPath);
    if (exported.createTestApp) {
      app = await exported.createTestApp();
    } else {
      app = exported.app || exported;
    }
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: process.env.AUTH_PASSWORD });
    expect(loginRes.status).toBe(200);
    token = loginRes.body.token;
  });

  test('returns seeded roles with permissions array', async () => {
    const res = await request(app)
      .get('/api/users/roles')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.roles)).toBe(true);
    const adminRole = res.body.roles.find(r => r.name === 'admin');
    expect(adminRole).toBeTruthy();
    expect(Array.isArray(adminRole.permissions)).toBe(true);
    expect(adminRole.permissions.length).toBeGreaterThan(0);
  });
});
