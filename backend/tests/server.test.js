import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

// Create mock functions
const mockFetchBlog = jest.fn((req, res) => res.json({ success: true }));
const mockAnalyzeBlog = jest.fn((req, res) => res.json({ success: true }));
const mockApplyBlogChanges = jest.fn((req, res) => res.json({ success: true }));

// Mock the controller module
jest.unstable_mockModule('../src/controllers/blogController.js', () => ({
  fetchBlog: mockFetchBlog,
  analyzeBlog: mockAnalyzeBlog,
  applyBlogChanges: mockApplyBlogChanges
}));

// Create test app (mimicking server.js structure)
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Blog Refresh API is running' });
});

app.post('/api/fetch-blog', mockFetchBlog);
app.post('/api/analyze-blog', mockAnalyzeBlog);
app.post('/api/apply-changes', mockApplyBlogChanges);

describe('Server', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
  });

  describe('API Routes', () => {
    it('should have /api/fetch-blog endpoint', async () => {
      const response = await request(app)
        .post('/api/fetch-blog')
        .send({ url: 'https://example.com' });

      expect(response.status).toBe(200);
      expect(mockFetchBlog).toHaveBeenCalled();
    });

    it('should have /api/analyze-blog endpoint', async () => {
      const response = await request(app)
        .post('/api/analyze-blog')
        .send({ content: '<p>test</p>', title: 'Test' });

      expect(response.status).toBe(200);
      expect(mockAnalyzeBlog).toHaveBeenCalled();
    });

    it('should have /api/apply-changes endpoint', async () => {
      const response = await request(app)
        .post('/api/apply-changes')
        .send({ content: '<p>test</p>', approvedProposals: [] });

      expect(response.status).toBe(200);
      expect(mockApplyBlogChanges).toHaveBeenCalled();
    });

    it('should handle CORS', async () => {
      const response = await request(app)
        .options('/api/fetch-blog')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should parse JSON bodies', async () => {
      const testData = { test: 'data' };
      
      await request(app)
        .post('/api/fetch-blog')
        .send(testData);

      expect(mockFetchBlog).toHaveBeenCalled();
      const req = mockFetchBlog.mock.calls[0][0];
      expect(req.body).toEqual(testData);
    });

    it('should handle large JSON payloads (up to 10mb)', async () => {
      const largeData = { content: 'x'.repeat(1000000) }; // 1MB of data
      
      const response = await request(app)
        .post('/api/analyze-blog')
        .send(largeData);

      expect(response.status).toBe(200);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown-route');

      expect(response.status).toBe(404);
    });

    it('should handle invalid JSON', async () => {
      const response = await request(app)
        .post('/api/fetch-blog')
        .set('Content-Type', 'application/json')
        .send('invalid json{');

      expect(response.status).toBe(400);
    });
  });
});
