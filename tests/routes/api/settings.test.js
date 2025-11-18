const request = require('supertest');
const express = require('express');
const settingsRouter = require('../../../routes/api/settings');

describe('Settings API', () => {
  let app;
  let mockDal;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Mock database access layer
    mockDal = {
      all: jest.fn(),
      run: jest.fn(),
      get: jest.fn()
    };
    
    // Mock loggers
    app.locals = {
      loggers: {
        api: {
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn()
        }
      }
    };
    
    // Attach mock DAL to requests
    app.use((req, res, next) => {
      req.dal = mockDal;
      next();
    });
    
    app.use('/api/settings', settingsRouter);
  });

  describe('GET /', () => {
    it('should return default settings when database is empty', async () => {
      mockDal.all.mockResolvedValue([]);
      
      const response = await request(app)
        .get('/api/settings')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.settings).toHaveProperty('system');
      expect(response.body.settings).toHaveProperty('alerts');
      expect(response.body.settings).toHaveProperty('ingestion');
    });

    it('should merge database settings with defaults', async () => {
      mockDal.all.mockResolvedValue([
        { setting_key: 'system.retention_days', setting_value: '60', category: 'system' }
      ]);
      
      const response = await request(app)
        .get('/api/settings')
        .expect(200);
      
      expect(response.body.settings.system.retention_days).toBe(60);
    });

    it('should handle database errors gracefully', async () => {
      mockDal.all.mockRejectedValue(new Error('Database error'));
      
      const response = await request(app)
        .get('/api/settings')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.settings).toBeDefined();
    });
  });

  describe('PUT /', () => {
    it('should update settings successfully', async () => {
      mockDal.run.mockResolvedValue({ changes: 1 });
      
      const response = await request(app)
        .put('/api/settings')
        .send({
          category: 'system',
          settings: {
            retention_days: 90
          }
        })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(mockDal.run).toHaveBeenCalled();
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .put('/api/settings')
        .send({})
        .expect(400);
      
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /settings/export', () => {
    it('should export all settings', async () => {
      mockDal.all.mockResolvedValue([
        { setting_key: 'system.retention_days', setting_value: '30', category: 'system' }
      ]);
      
      const response = await request(app)
        .get('/api/settings/settings/export')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.settings).toBeDefined();
    });
  });
});
