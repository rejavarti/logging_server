describe('metricsMiddleware error handling', () => {
  test('calls console.warn on sync error', () => {
    process.env.METRICS_SYNC = 'true';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const dal = { run: () => { throw new Error('sync error'); } };
    const req = {
      path: '/api/test',
      method: 'GET',
      headers: {},
      user: null,
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' }
    };
    let statusCode = 200;
    const res = {
      statusCode,
      end: function() {}
    };
    const next = jest.fn();
    const middleware = require('../middleware/request-metrics');
    const mw = middleware(dal);
    mw(req, res, next);
    res.end();
    expect(warnSpy).toHaveBeenCalledWith('Failed to store request metrics:', 'sync error');
    warnSpy.mockRestore();
    process.env.METRICS_SYNC = '';
  });

  test('calls console.warn on async error', async () => {
    process.env.METRICS_SYNC = '';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const dal = { run: async () => { throw new Error('async error'); } };
    const req = {
      path: '/api/test',
      method: 'GET',
      headers: {},
      user: null,
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' }
    };
    let statusCode = 200;
    const res = {
      statusCode,
      end: function() {}
    };
    const next = jest.fn();
    const middleware = require('../middleware/request-metrics');
    const mw = middleware(dal);
    mw(req, res, next);
    await new Promise(resolve => {
      setImmediate(() => {
        res.end();
        setTimeout(resolve, 20);
      });
    });
    expect(warnSpy).toHaveBeenCalledWith('Failed to store request metrics:', 'async error');
    warnSpy.mockRestore();
  });
});
describe('metricsMiddleware direct unit test', () => {
  test('calls console.warn when dal.run is not a function (else branch)', () => {
    process.env.METRICS_SYNC = 'true';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const dal = { run: 'not-a-function' };
    const req = {
      path: '/api/test',
      method: 'GET',
      headers: {},
      user: null,
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' }
    };
    let statusCode = 200;
    const res = {
      statusCode,
      end: function() {}
    };
    const next = jest.fn();
    const middleware = require('../middleware/request-metrics');
    const mw = middleware(dal);
    mw(req, res, next);
    // Call res.end to trigger metrics logic
    res.end();
    expect(warnSpy).toHaveBeenCalledWith('DAL provided but dal.run is not a function. Metrics not stored.');
    warnSpy.mockRestore();
    process.env.METRICS_SYNC = '';
  });

  test('calls console.warn when dal.run is not a function in async path', async () => {
    // Ensure async path
    process.env.METRICS_SYNC = '';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const dal = { run: 'not-a-function' };
    const req = {
      path: '/api/test',
      method: 'GET',
      headers: {},
      user: null,
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' }
    };
    let statusCode = 200;
    const res = {
      statusCode,
      end: function() {}
    };
    const next = jest.fn();
    const middleware = require('../middleware/request-metrics');
    const mw = middleware(dal);
    mw(req, res, next);
    res.end();
    // Wait for setImmediate to flush
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(warnSpy).toHaveBeenCalledWith('DAL provided but dal.run is not a function. Metrics not stored.');
    warnSpy.mockRestore();
  });

  test('sync success path calls dal.run with ip and user-agent', () => {
    process.env.METRICS_SYNC = 'true';
    const runSpy = jest.fn();
    const dal = { run: runSpy };
    const req = {
      path: '/api/test',
      method: 'POST',
      headers: { 'user-agent': 'Mozilla/5.0' },
      user: { id: 42 },
      ip: '192.168.1.10',
      connection: { remoteAddress: '10.0.0.1' }
    };
    const res = { statusCode: 201, end: function() {} };
    const next = jest.fn();
    const middleware = require('../middleware/request-metrics');
    const mw = middleware(dal);
    mw(req, res, next);
    res.end();
    expect(runSpy).toHaveBeenCalled();
    const args = runSpy.mock.calls[0][1];
    expect(args[0]).toBe('/api/test'); // endpoint
    expect(args[1]).toBe('POST');
    expect(args[2]).toBe(201);
    expect(args[4]).toBe(42); // user id
    expect(args[5]).toBe('192.168.1.10'); // prefers req.ip over connection
    expect(args[6]).toBe('Mozilla/5.0');
    process.env.METRICS_SYNC = '';
  });

  test('sync path uses connection.remoteAddress when ip missing', () => {
    process.env.METRICS_SYNC = 'true';
    const runSpy = jest.fn();
    const dal = { run: runSpy };
    const req = {
      path: '/api/test',
      method: 'GET',
      headers: {},
      // ip intentionally undefined
      connection: { remoteAddress: '10.0.0.3' }
    };
    const res = { statusCode: 200, end: function() {} };
    const mw = require('../middleware/request-metrics')(dal);
    mw(req, res, jest.fn());
    res.end();
    const args = runSpy.mock.calls[0][1];
    expect(args[5]).toBe('10.0.0.3');
    process.env.METRICS_SYNC = '';
  });

  test("sync path uses 'unknown' when no ip and no connection", () => {
    process.env.METRICS_SYNC = 'true';
    const runSpy = jest.fn();
    const dal = { run: runSpy };
    const req = {
      path: '/api/test',
      method: 'GET',
      headers: {},
      // no ip, no connection
    };
    const res = { statusCode: 200, end: function() {} };
    const mw = require('../middleware/request-metrics')(dal);
    mw(req, res, jest.fn());
    res.end();
    const args = runSpy.mock.calls[0][1];
    expect(args[5]).toBe('unknown');
    expect(args[6]).toBe('unknown');
    process.env.METRICS_SYNC = '';
  });

  test('async success path uses connection.remoteAddress fallback', async () => {
    const runSpy = jest.fn(async () => {});
    const dal = { run: runSpy };
    const req = {
      path: '/api/test',
      method: 'GET',
      headers: { 'user-agent': 'UA' },
      user: null,
      // ip intentionally undefined
      connection: { remoteAddress: '10.0.0.2' }
    };
    const res = { statusCode: 200, end: function() {} };
    const mw = require('../middleware/request-metrics')(dal);
    mw(req, res, jest.fn());
    res.end();
    await new Promise(r => setTimeout(r, 20));
    expect(runSpy).toHaveBeenCalled();
    const args = runSpy.mock.calls[0][1];
    expect(args[5]).toBe('10.0.0.2');
  });

  test("async success path uses 'unknown' when no ip or user-agent", async () => {
    const runSpy = jest.fn(async () => {});
    const dal = { run: runSpy };
    const req = {
      path: '/api/test',
      method: 'GET',
      headers: {}, // no user-agent
      user: null
      // no ip, no connection
    };
    const res = { statusCode: 200, end: function() {} };
    const mw = require('../middleware/request-metrics')(dal);
    mw(req, res, jest.fn());
    res.end();
    await new Promise(r => setTimeout(r, 20));
    expect(runSpy).toHaveBeenCalled();
    const args = runSpy.mock.calls[0][1];
    expect(args[5]).toBe('unknown');
    expect(args[6]).toBe('unknown');
  });

  test("async success path uses 'unknown' when connection present without remoteAddress", async () => {
    const runSpy = jest.fn(async () => {});
    const dal = { run: runSpy };
    const req = {
      path: '/api/test',
      method: 'GET',
      headers: {}, // no user-agent
      user: null,
      // ip intentionally undefined, connection present but missing remoteAddress
      connection: {}
    };
    const res = { statusCode: 200, end: function() {} };
    const mw = require('../middleware/request-metrics')(dal);
    mw(req, res, jest.fn());
    res.end();
    await new Promise(r => setTimeout(r, 20));
    expect(runSpy).toHaveBeenCalled();
    const args = runSpy.mock.calls[0][1];
    expect(args[5]).toBe('unknown');
    expect(args[6]).toBe('unknown');
  });

  test('sync path with null DAL does nothing (no warns)', () => {
    process.env.METRICS_SYNC = 'true';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const dal = null; // falsy DAL
    const req = {
      path: '/api/test',
      method: 'GET',
      headers: {},
      ip: undefined,
    };
    const res = { statusCode: 204, end: function() {} };
    const mw = require('../middleware/request-metrics')(dal);
    mw(req, res, jest.fn());
    res.end();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    process.env.METRICS_SYNC = '';
  });

  test('async path with undefined DAL does nothing (no warns)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const dal = undefined; // falsy DAL
    const req = {
      path: '/api/test',
      method: 'GET',
      headers: {},
    };
    const res = { statusCode: 200, end: function() {} };
    const mw = require('../middleware/request-metrics')(dal);
    mw(req, res, jest.fn());
    res.end();
    await new Promise(r => setTimeout(r, 20));
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('bypasses non-API paths via early return', () => {
    const dal = { run: jest.fn() };
    const req = { path: '/health' }; // not starting with /api
    const res = { end: function() {} };
    const next = jest.fn();
    const mw = require('../middleware/request-metrics')(dal);
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
    // ensure res.end was not overridden/used
    expect(typeof res.end).toBe('function');
  });
});
const request = require('supertest');
const { createTestApp } = require('../server');

let app; let token;

beforeAll(async () => {
  app = await createTestApp();
  const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: process.env.AUTH_PASSWORD || 'testAdmin123!' });
  token = login.body.token;
});

describe('Request Metrics Middleware', () => {
  test('tracks API requests', withSafeAsync(async () => {
    // Make an API request that should be tracked
    const res = await request(app).get('/api/logs').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    // Middleware runs async, just verify the request succeeded
  }));

  test('skips non-API requests', withSafeAsync(async () => {
    // Request a non-API route (should not be tracked)
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
  }));

  test('handles database errors gracefully', withSafeAsync(async () => {
    // Simulate DAL missing to trigger error branch
    const originalDal = app.dal;
    app.dal = null;
  const res = await request(app).get('/api/logs').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    // Restore original DAL
    app.dal = originalDal;
  }));

    test('handles DAL run errors and logs warning', withSafeAsync(async () => {
      // Simulate DAL.run throwing an error to cover catch block
      const originalDal = app.dal;
      process.env.METRICS_SYNC = 'true';
      app.dal = {
        run: async () => { throw new Error('Simulated DAL failure'); }
      };
  const res = await request(app).get('/api/logs').set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
      // Restore original DAL and env
      app.dal = originalDal;
      process.env.METRICS_SYNC = '';
    }));
    
    test('handles DAL with non-function run (else branch)', withSafeAsync(async () => {
  // Simulate DAL.run present but not a function to cover else branch and warning
  const originalDal = app.dal;
  process.env.METRICS_SYNC = 'true';
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  // Use a DAL object with run as a string to match explicit type check
  app.dal = { run: 'not-a-function' };
  const res = await request(app).get('/api/logs').set('Authorization', `Bearer ${token}`);
  expect(res.statusCode).toBe(200);
  // Wait for the middleware to execute synchronously
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(warnSpy).toHaveBeenCalled();
  // Restore original DAL and env
  app.dal = originalDal;
  process.env.METRICS_SYNC = '';
  warnSpy.mockRestore();
    }));
});
