import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Create mocks before importing modules
const mockAxiosGet = jest.fn();
const mockEvaluateLinks = jest.fn();
const mockAnalyzeStructure = jest.fn();
const mockGenerateProposals = jest.fn();
const mockApplyChanges = jest.fn();

// Mock modules
jest.unstable_mockModule('axios', () => ({
  default: {
    get: mockAxiosGet,
    post: jest.fn()
  }
}));

jest.unstable_mockModule('../src/helpers/linkChecker.js', () => ({
  evaluateLinks: mockEvaluateLinks
}));

jest.unstable_mockModule('../src/helpers/aiAnalyzer.js', () => ({
  analyzeStructure: mockAnalyzeStructure,
  generateProposals: mockGenerateProposals,
  applyChanges: mockApplyChanges
}));

// Import after mocking
const { fetchBlog, analyzeBlog, applyBlogChanges } = await import('../src/controllers/blogController.js');

// Create test app
const app = express();
app.use(express.json());
app.post('/fetch-blog', fetchBlog);
app.post('/analyze-blog', analyzeBlog);
app.post('/apply-changes', applyBlogChanges);

describe('Blog Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchBlog', () => {
    it('should fetch blog content successfully', async () => {
      const mockHtml = `
        <html>
          <head><title>Test Blog</title></head>
          <body>
            <h1>Main Title</h1>
            <article>
              <h2>Section 1</h2>
              <p>Content 1</p>
            </article>
          </body>
        </html>
      `;

      mockAxiosGet.mockResolvedValue({ data: mockHtml });

      const response = await request(app)
        .post('/fetch-blog')
        .send({ url: 'https://example.com/blog' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('title');
      expect(response.body.data).toHaveProperty('content');
      expect(response.body.data.title).toBe('Main Title');
    });

    it('should return 400 if URL is missing', async () => {
      const response = await request(app)
        .post('/fetch-blog')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('URL is required');
    });

    it('should handle fetch errors', async () => {
      mockAxiosGet.mockRejectedValue(new Error('Network error'));

      const response = await request(app)
        .post('/fetch-blog')
        .send({ url: 'https://example.com/blog' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to fetch blog content');
    });

    it('should extract content from article tag', async () => {
      const mockHtml = `
        <html>
          <body>
            <h1>Title</h1>
            <article><p>Article content</p></article>
          </body>
        </html>
      `;

      mockAxiosGet.mockResolvedValue({ data: mockHtml });

      const response = await request(app)
        .post('/fetch-blog')
        .send({ url: 'https://example.com/blog' });

      expect(response.body.data.content).toContain('Article content');
    });

    it('should fallback to main tag if article not found', async () => {
      const mockHtml = `
        <html>
          <body>
            <h1>Title</h1>
            <main><p>Main content</p></main>
          </body>
        </html>
      `;

      mockAxiosGet.mockResolvedValue({ data: mockHtml });

      const response = await request(app)
        .post('/fetch-blog')
        .send({ url: 'https://example.com/blog' });

      expect(response.body.data.content).toContain('Main content');
    });

    it('should handle timeout errors', async () => {
      mockAxiosGet.mockRejectedValue({ code: 'ETIMEDOUT', message: 'Timeout' });

      const response = await request(app)
        .post('/fetch-blog')
        .send({ url: 'https://example.com/blog' });

      expect(response.status).toBe(500);
    });

    it('should extract title from h1 tag', async () => {
      const mockHtml = '<html><body><h1>My Blog Title</h1><article>Content</article></body></html>';
      mockAxiosGet.mockResolvedValue({ data: mockHtml });

      const response = await request(app)
        .post('/fetch-blog')
        .send({ url: 'https://example.com/blog' });

      expect(response.body.data.title).toBe('My Blog Title');
    });

    it('should fallback to title tag if h1 not found', async () => {
      const mockHtml = '<html><head><title>Page Title</title></head><body><article>Content</article></body></html>';
      mockAxiosGet.mockResolvedValue({ data: mockHtml });

      const response = await request(app)
        .post('/fetch-blog')
        .send({ url: 'https://example.com/blog' });

      expect(response.body.data.title).toBe('Page Title');
    });
  });

  describe('analyzeBlog', () => {
    const mockContent = `
      <h1>Test Blog</h1>
      <h2>Section 1</h2>
      <p>Content 1</p>
      <a href="https://example.com">Link 1</a>
      <h2>Section 2</h2>
      <p>Content 2</p>
      <a href="https://broken.com">Broken Link</a>
    `;

    it('should analyze blog content successfully', async () => {
      mockEvaluateLinks.mockResolvedValue([
        { id: 'link-0', url: 'https://example.com', working: true },
        { id: 'link-1', url: 'https://broken.com', working: false }
      ]);

      mockAnalyzeStructure.mockResolvedValue({
        needsRestructuring: true,
        currentSectionCount: 2,
        suggestions: []
      });

      mockGenerateProposals.mockReturnValue([
        {
          id: 'proposal-1',
          type: 'link-fixes',
          title: 'Fix Broken Links',
          affectedLinks: [{ url: 'https://broken.com' }]
        }
      ]);

      const response = await request(app)
        .post('/analyze-blog')
        .send({ content: mockContent, title: 'Test Blog' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('sections');
      expect(response.body.data).toHaveProperty('linkEvaluations');
      expect(response.body.data).toHaveProperty('proposals');
      expect(response.body.data.sections).toHaveLength(2);
    });

    it('should return 400 if content is missing', async () => {
      const response = await request(app)
        .post('/analyze-blog')
        .send({ title: 'Test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Content is required');
    });

    it('should handle content with no sections', async () => {
      const noSectionContent = '<p>Just a paragraph</p>';

      mockEvaluateLinks.mockResolvedValue([]);
      mockGenerateProposals.mockReturnValue([]);

      const response = await request(app)
        .post('/analyze-blog')
        .send({ content: noSectionContent, title: 'Test' });

      expect(response.status).toBe(200);
      expect(response.body.data.sections).toHaveLength(0);
    });

    it('should extract links correctly', async () => {
      mockEvaluateLinks.mockResolvedValue([]);
      mockAnalyzeStructure.mockResolvedValue({
        needsRestructuring: false,
        suggestions: []
      });
      mockGenerateProposals.mockReturnValue([]);

      const response = await request(app)
        .post('/analyze-blog')
        .send({ content: mockContent, title: 'Test' });

      expect(mockEvaluateLinks).toHaveBeenCalled();
      const linksArg = mockEvaluateLinks.mock.calls[0][0];
      expect(linksArg).toHaveLength(2);
      expect(linksArg[0].url).toBe('https://example.com');
    });

    it('should continue if structure analysis fails', async () => {
      mockEvaluateLinks.mockResolvedValue([]);
      mockAnalyzeStructure.mockRejectedValue(new Error('AI Error'));
      mockGenerateProposals.mockReturnValue([]);

      const response = await request(app)
        .post('/analyze-blog')
        .send({ content: mockContent, title: 'Test' });

      expect(response.status).toBe(200);
      expect(response.body.data.structureAnalysis.needsRestructuring).toBe(false);
    });

    it('should handle analysis errors', async () => {
      mockEvaluateLinks.mockRejectedValue(new Error('Link check failed'));

      const response = await request(app)
        .post('/analyze-blog')
        .send({ content: mockContent, title: 'Test' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to analyze blog');
    });

    it('should filter out non-http links', async () => {
      const contentWithRelativeLinks = `
        <h2>Section</h2>
        <a href="https://example.com">External</a>
        <a href="/relative">Relative</a>
        <a href="#anchor">Anchor</a>
      `;

      mockEvaluateLinks.mockResolvedValue([]);
      mockAnalyzeStructure.mockResolvedValue({ needsRestructuring: false, suggestions: [] });
      mockGenerateProposals.mockReturnValue([]);

      await request(app)
        .post('/analyze-blog')
        .send({ content: contentWithRelativeLinks, title: 'Test' });

      const linksArg = mockEvaluateLinks.mock.calls[0][0];
      expect(linksArg).toHaveLength(1);
      expect(linksArg[0].url).toBe('https://example.com');
    });

    it('should handle empty content', async () => {
      mockEvaluateLinks.mockResolvedValue([]);
      mockGenerateProposals.mockReturnValue([]);

      const response = await request(app)
        .post('/analyze-blog')
        .send({ content: '<p></p>', title: 'Test' });

      expect(response.status).toBe(200);
    });
  });

  describe('applyBlogChanges', () => {
    const mockContent = '<h1>Test</h1><p>Content</p>';
    const mockProposals = [
      {
        type: 'link-fixes',
        affectedLinks: [{ url: 'https://broken.com' }]
      }
    ];

    it('should apply changes successfully', async () => {
      mockApplyChanges.mockResolvedValue('<h1>Test</h1><p>Refreshed content</p>');

      const response = await request(app)
        .post('/apply-changes')
        .send({
          content: mockContent,
          approvedProposals: mockProposals,
          originalSections: []
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('refreshedContent');
    });

    it('should return 400 if content is missing', async () => {
      const response = await request(app)
        .post('/apply-changes')
        .send({ approvedProposals: mockProposals });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required data');
    });

    it('should return 400 if approvedProposals is missing', async () => {
      const response = await request(app)
        .post('/apply-changes')
        .send({ content: mockContent });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required data');
    });

    it('should handle apply changes errors', async () => {
      mockApplyChanges.mockRejectedValue(new Error('AI Error'));

      const response = await request(app)
        .post('/apply-changes')
        .send({
          content: mockContent,
          approvedProposals: mockProposals,
          originalSections: []
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to apply changes');
    });

    it('should handle empty proposals', async () => {
      mockApplyChanges.mockResolvedValue(mockContent);

      const response = await request(app)
        .post('/apply-changes')
        .send({
          content: mockContent,
          approvedProposals: [],
          originalSections: []
        });

      expect(response.status).toBe(200);
    });
  });
});
