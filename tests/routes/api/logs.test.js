const request = require('supertest');
const express = require('express');
const logsRouter = require('../../../routes/api/logs');

describe('Logs API', () => {
  let app;
  let mockDal;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    mockDal = {
      all: jest.fn(),
      run: jest.fn(),
      get: jest.fn()
    };
    
    app.locals = {
      loggers: {
        api: {
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn()
        }
      }
    };
    
    app.use((req, res, next) => {
      req.dal = mockDal;
      next();
    });
    
    app.use('/api/logs', logsRouter);
  });

  describe('GET /', () => {
    it('should return paginated logs', async () => {
      mockDal.all.mockResolvedValue([
        { id: 1, message: 'Test log 1', severity: 'info', timestamp: Date.now() },
        { id: 2, message: 'Test log 2', severity: 'error', timestamp: Date.now() }
      ]);
      
      const response = await request(app)
        .get('/api/logs')
        .query({ page: 1, limit: 10 })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.logs)).toBe(true);
    });

    it('should filter logs by severity', async () => {
      mockDal.all.mockResolvedValue([
        { id: 1, message: 'Error log', severity: 'error', timestamp: Date.now() }
      ]);
      
      const response = await request(app)
        .get('/api/logs')
        .query({ severity: 'error' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(mockDal.all).toHaveBeenCalled();
    });

    it('should filter logs by time range', async () => {
      const startTime = Date.now() - 3600000;
      const endTime = Date.now();
      
      mockDal.all.mockResolvedValue([]);
      
      const response = await request(app)
        .get('/api/logs')
        .query({ start_time: startTime, end_time: endTime })
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /', () => {
    it('should create a new log entry', async () => {
      mockDal.run.mockResolvedValue({ lastID: 123 });
      
      const response = await request(app)
        .post('/api/logs')
        .send({
          message: 'Test log message',
          severity: 'info',
          source: 'test-suite'
        })
        .expect(201);
      
      expect(response.body.success).toBe(true);
      expect(response.body.id).toBe(123);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/logs')
        .send({})
        .expect(400);
      
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /:id', () => {
    it('should return a specific log entry', async () => {
      mockDal.get.mockResolvedValue({
        id: 1,
        message: 'Test log',
        severity: 'info',
        timestamp: Date.now()
      });
      
      const response = await request(app)
        .get('/api/logs/1')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.log.id).toBe(1);
    });

    it('should return 404 for non-existent log', async () => {
      mockDal.get.mockResolvedValue(null);
      
      const response = await request(app)
        .get('/api/logs/9999')
        .expect(404);
      
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /count', () => {
    it('should return log count', async () => {
      mockDal.get.mockResolvedValue({ count: 1500 });
      
      const response = await request(app)
        .get('/api/logs/count')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(1500);
    });
  });

  describe('GET /analytics', () => {
    it('should return log analytics', async () => {
      mockDal.all.mockResolvedValue([
        { severity: 'info', count: 100 },
        { severity: 'error', count: 10 }
      ]);
      
      const response = await request(app)
        .get('/api/logs/analytics')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.analytics).toBeDefined();
    });
  });
});
