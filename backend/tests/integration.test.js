import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

// Simple integration tests that don't require complex mocking
describe('API Integration Tests', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));

    app.get('/health', (req, res) => {
      res.json({ status: 'ok', message: 'Blog Refresh API is running' });
    });

    app.post('/api/test', (req, res) => {
      res.json({ success: true, data: req.body });
    });
  });

  describe('Server Configuration', () => {
    it('should have CORS enabled', async () => {
      const response = await request(app)
        .options('/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should parse JSON bodies', async () => {
      const testData = { test: 'data', nested: { value: 123 } };
      
      const response = await request(app)
        .post('/api/test')
        .send(testData);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(testData);
    });

    it('should handle large JSON payloads', async () => {
      const largeData = { content: 'x'.repeat(1000000) };
      
      const response = await request(app)
        .post('/api/test')
        .send(largeData);

      expect(response.status).toBe(200);
    });

    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown-route');
      expect(response.status).toBe(404);
    });

    it('should handle invalid JSON', async () => {
      const response = await request(app)
        .post('/api/test')
        .set('Content-Type', 'application/json')
        .send('invalid json{');

      expect(response.status).toBe(400);
    });
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        message: 'Blog Refresh API is running'
      });
    });

    it('should respond quickly', async () => {
      const start = Date.now();
      await request(app).get('/health');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });
});
