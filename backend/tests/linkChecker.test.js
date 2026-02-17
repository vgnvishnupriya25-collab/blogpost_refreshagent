import { jest } from '@jest/globals';

// Create mocks
const mockHead = jest.fn();
const mockGet = jest.fn();

// Mock axios before importing
jest.unstable_mockModule('axios', () => ({
  default: {
    head: mockHead,
    get: mockGet
  }
}));

// Import after mocking
const { evaluateLinks } = await import('../src/helpers/linkChecker.js');

describe('LinkChecker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('evaluateLinks', () => {
    it('should evaluate working standard links', async () => {
      const links = [
        { id: 'link-1', url: 'https://example.com', text: 'Example' }
      ];

      mockHead.mockResolvedValue({ status: 200 });

      const result = await evaluateLinks(links);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'link-1',
        url: 'https://example.com',
        status: 200,
        working: true,
        issue: null,
        method: 'HEAD'
      });
    });

    it('should handle broken links (404)', async () => {
      const links = [
        { id: 'link-1', url: 'https://example.com/404', text: 'Broken' }
      ];

      mockHead.mockResolvedValue({ status: 404 });

      const result = await evaluateLinks(links);

      expect(result[0]).toMatchObject({
        status: 404,
        working: false,
        issue: 'Page not found',
        method: 'HEAD'
      });
    });

    it('should fallback to GET when HEAD returns 405', async () => {
      const links = [
        { id: 'link-1', url: 'https://example.com', text: 'Example' }
      ];

      mockHead.mockResolvedValue({ status: 405 });
      mockGet.mockResolvedValue({ 
        status: 200,
        data: { destroy: jest.fn() }
      });

      const result = await evaluateLinks(links);

      expect(result[0]).toMatchObject({
        status: 200,
        working: true,
        method: 'GET'
      });
      expect(mockGet).toHaveBeenCalled();
    });

    it('should handle network errors', async () => {
      const links = [
        { id: 'link-1', url: 'https://nonexistent.com', text: 'Error' }
      ];

      mockHead.mockRejectedValue({ code: 'ENOTFOUND' });
      mockGet.mockRejectedValue({ code: 'ENOTFOUND' });

      const result = await evaluateLinks(links);

      expect(result[0]).toMatchObject({
        status: 0,
        working: false,
        issue: 'Domain not found - URL may be invalid or site is down'
      });
    });

    it('should handle PDF files specially', async () => {
      const links = [
        { id: 'link-1', url: 'https://example.com/document.pdf', text: 'PDF' }
      ];

      mockHead.mockResolvedValue({ status: 200 });

      const result = await evaluateLinks(links);

      expect(result[0]).toMatchObject({
        status: 200,
        working: true,
        method: 'HEAD-SPECIAL'
      });
    });

    it('should handle Google Drive URLs', async () => {
      const links = [
        { id: 'link-1', url: 'https://drive.google.com/file/d/123abc/view', text: 'Drive' }
      ];

      mockHead.mockResolvedValue({ status: 200 });

      const result = await evaluateLinks(links);

      expect(result[0]).toMatchObject({
        status: 200,
        working: true,
        method: 'HEAD-SPECIAL'
      });
    });

    it('should handle private Google Drive files (403)', async () => {
      const links = [
        { id: 'link-1', url: 'https://drive.google.com/file/d/123abc/view', text: 'Private' }
      ];

      mockHead.mockResolvedValue({ status: 403 });

      const result = await evaluateLinks(links);

      expect(result[0]).toMatchObject({
        status: 200,
        working: true,
        issue: 'Private file (access restricted)',
        method: 'HEAD-SPECIAL'
      });
    });

    it('should convert Google Drive sharing URLs', async () => {
      const links = [
        { id: 'link-1', url: 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit', text: 'Share' }
      ];

      mockHead.mockResolvedValue({ status: 200 });

      await evaluateLinks(links);

      expect(mockHead).toHaveBeenCalledWith(
        'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/view',
        expect.any(Object)
      );
    });

    it('should handle special URL GET fallback', async () => {
      const links = [
        { id: 'link-1', url: 'https://example.com/doc.pdf', text: 'PDF' }
      ];

      mockHead.mockResolvedValue({ status: 405 });
      mockGet.mockResolvedValue({ 
        status: 200,
        data: { destroy: jest.fn() }
      });

      const result = await evaluateLinks(links);

      expect(result[0]).toMatchObject({
        status: 200,
        working: true,
        method: 'GET-SPECIAL'
      });
    });

    it('should handle range not satisfiable (416) as working', async () => {
      const links = [
        { id: 'link-1', url: 'https://example.com', text: 'Range' }
      ];

      mockHead.mockResolvedValue({ status: 405 });
      mockGet.mockResolvedValue({ 
        status: 416,
        data: { destroy: jest.fn() }
      });

      const result = await evaluateLinks(links);

      expect(result[0]).toMatchObject({
        status: 200,
        working: true,
        method: 'GET'
      });
    });

    it('should limit to 20 links maximum', async () => {
      const links = Array.from({ length: 25 }, (_, i) => ({
        id: `link-${i}`,
        url: `https://example.com/${i}`,
        text: `Link ${i}`
      }));

      mockHead.mockResolvedValue({ status: 200 });

      const result = await evaluateLinks(links);

      expect(result).toHaveLength(20);
      expect(mockHead).toHaveBeenCalledTimes(20);
    });

    it('should handle empty links array', async () => {
      const result = await evaluateLinks([]);
      expect(result).toHaveLength(0);
    });

    // HTTP Status Codes
    it('should handle 301 redirects', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockResolvedValue({ status: 301 });
      const result = await evaluateLinks(links);
      expect(result[0].working).toBe(true);
    });

    it('should handle 302 redirects', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockResolvedValue({ status: 302 });
      const result = await evaluateLinks(links);
      expect(result[0].working).toBe(true);
    });

    it('should handle 400 bad request', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockResolvedValue({ status: 400 });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'Bad request' });
    });

    it('should handle 401 authentication required', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockResolvedValue({ status: 401 });
      mockGet.mockResolvedValue({ status: 401, data: { destroy: jest.fn() } });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'Authentication required' });
    });

    it('should handle 403 forbidden', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockResolvedValue({ status: 403 });
      mockGet.mockResolvedValue({ status: 403, data: { destroy: jest.fn() } });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'Access forbidden' });
    });

    it('should handle 408 timeout', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockResolvedValue({ status: 408 });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'Request timeout' });
    });

    it('should handle 410 gone', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockResolvedValue({ status: 410 });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'Page permanently removed' });
    });

    it('should handle 429 rate limit', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockResolvedValue({ status: 429 });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'Too many requests (rate limited)' });
    });

    it('should handle 500 server error', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockResolvedValue({ status: 500 });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'Server error' });
    });

    it('should handle 502 bad gateway', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockResolvedValue({ status: 502 });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'Bad gateway' });
    });

    it('should handle 503 service unavailable', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockResolvedValue({ status: 503 });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'Service unavailable' });
    });

    it('should handle 504 gateway timeout', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockResolvedValue({ status: 504 });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'Gateway timeout' });
    });

    // Network Errors
    it('should handle ECONNREFUSED', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockRejectedValue({ code: 'ECONNREFUSED' });
      mockGet.mockRejectedValue({ code: 'ECONNREFUSED' });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'Connection refused by server' });
    });

    it('should handle ECONNRESET', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockRejectedValue({ code: 'ECONNRESET' });
      mockGet.mockRejectedValue({ code: 'ECONNRESET' });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'Connection was reset' });
    });

    it('should handle ETIMEDOUT', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockRejectedValue({ code: 'ETIMEDOUT' });
      mockGet.mockRejectedValue({ code: 'ETIMEDOUT' });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'Request timed out' });
    });

    it('should handle ECONNABORTED', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockRejectedValue({ code: 'ECONNABORTED' });
      mockGet.mockRejectedValue({ code: 'ECONNABORTED' });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'Connection was aborted' });
    });

    it('should handle SSL certificate errors', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockRejectedValue({ code: 'ERR_TLS_CERT' });
      mockGet.mockRejectedValue({ code: 'ERR_TLS_CERT' });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'SSL certificate error' });
    });

    it('should handle self-signed certificates', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockRejectedValue({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
      mockGet.mockRejectedValue({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'Self-signed SSL certificate' });
    });

    it('should handle expired certificates', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockRejectedValue({ code: 'CERT_HAS_EXPIRED' });
      mockGet.mockRejectedValue({ code: 'CERT_HAS_EXPIRED' });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'SSL certificate has expired' });
    });

    it('should handle unknown errors', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockRejectedValue({ code: 'UNKNOWN', message: 'Unknown error' });
      mockGet.mockRejectedValue({ code: 'UNKNOWN', message: 'Unknown error' });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'Connection failed (UNKNOWN)' });
    });

    // Special URL Types
    it('should detect Google Docs URLs', async () => {
      const links = [{ id: 'test', url: 'https://docs.google.com/document/d/123', text: 'Docs' }];
      mockHead.mockResolvedValue({ status: 200 });
      const result = await evaluateLinks(links);
      expect(result[0].method).toBe('HEAD-SPECIAL');
    });

    it('should detect Dropbox URLs', async () => {
      const links = [{ id: 'test', url: 'https://dropbox.com/s/abc/file.pdf', text: 'Dropbox' }];
      mockHead.mockResolvedValue({ status: 200 });
      const result = await evaluateLinks(links);
      expect(result[0].method).toBe('HEAD-SPECIAL');
    });

    it('should detect OneDrive URLs', async () => {
      const links = [{ id: 'test', url: 'https://onedrive.live.com/view.aspx?resid=123', text: 'OneDrive' }];
      mockHead.mockResolvedValue({ status: 200 });
      const result = await evaluateLinks(links);
      expect(result[0].method).toBe('HEAD-SPECIAL');
    });

    it('should detect SharePoint URLs', async () => {
      const links = [{ id: 'test', url: 'https://company.sharepoint.com/sites/team', text: 'SharePoint' }];
      mockHead.mockResolvedValue({ status: 200 });
      const result = await evaluateLinks(links);
      expect(result[0].method).toBe('HEAD-SPECIAL');
    });

    it('should detect S3 URLs', async () => {
      const links = [{ id: 'test', url: 'https://bucket.s3.amazonaws.com/file.pdf', text: 'S3' }];
      mockHead.mockResolvedValue({ status: 200 });
      const result = await evaluateLinks(links);
      expect(result[0].method).toBe('HEAD-SPECIAL');
    });

    it('should detect GitHub file URLs', async () => {
      const links = [{ id: 'test', url: 'https://github.com/user/repo/blob/main/README.md', text: 'GitHub' }];
      mockHead.mockResolvedValue({ status: 200 });
      const result = await evaluateLinks(links);
      expect(result[0].method).toBe('HEAD-SPECIAL');
    });

    // Special URL Error Handling
    it('should handle special URL with 401 in GET fallback for Google services', async () => {
      const links = [{ id: 'test', url: 'https://drive.google.com/file/d/123/view', text: 'Drive' }];
      mockHead.mockResolvedValue({ status: 405 });
      mockGet.mockResolvedValue({ status: 401, data: { destroy: jest.fn() } });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ status: 200, working: true, issue: 'Private file (access restricted)', method: 'GET-SPECIAL' });
    });

    it('should handle special URL with 403 in GET fallback', async () => {
      const links = [{ id: 'test', url: 'https://drive.google.com/file/d/123/view', text: 'Drive' }];
      mockHead.mockResolvedValue({ status: 405 });
      mockGet.mockResolvedValue({ status: 403, data: { destroy: jest.fn() } });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ status: 200, working: true, issue: 'Private file (access restricted)', method: 'GET-SPECIAL' });
    });

    it('should handle special URL with network error in GET fallback', async () => {
      const links = [{ id: 'test', url: 'https://example.com/file.pdf', text: 'PDF' }];
      mockHead.mockResolvedValue({ status: 405 });
      mockGet.mockRejectedValue({ code: 'ENOTFOUND' });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'Domain not found - URL may be invalid or site is down', method: 'GET-SPECIAL' });
    });

    it('should handle unknown HTTP status', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockResolvedValue({ status: 999 });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'HTTP error (status 999)' });
    });
  });
});


  describe('Additional Coverage', () => {
    it('should handle special URL with 404 error', async () => {
      const links = [{ id: 'test', url: 'https://example.com/file.pdf', text: 'PDF' }];
      mockHead.mockResolvedValue({ status: 404 });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'Page not found', method: 'HEAD-SPECIAL' });
    });

    it('should handle special URL with 500 error in GET fallback', async () => {
      const links = [{ id: 'test', url: 'https://example.com/file.pdf', text: 'PDF' }];
      mockHead.mockResolvedValue({ status: 405 });
      mockGet.mockResolvedValue({ status: 500, data: { destroy: jest.fn() } });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'Server error', method: 'GET-SPECIAL' });
    });

    it('should handle standard URL with unknown error without code', async () => {
      const links = [{ id: 'test', url: 'https://example.com', text: 'Test' }];
      mockHead.mockRejectedValue({ message: 'Unknown error' });
      mockGet.mockRejectedValue({ message: 'Unknown error' });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false });
    });

    it('should handle Google Drive URL with 404', async () => {
      const links = [{ id: 'test', url: 'https://drive.google.com/file/d/123/view', text: 'Drive' }];
      mockHead.mockResolvedValue({ status: 404 });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'Page not found' });
    });

    it('should handle special URL with 401 error in HEAD', async () => {
      const links = [{ id: 'test', url: 'https://drive.google.com/file/d/123/view', text: 'Drive' }];
      mockHead.mockResolvedValue({ status: 401 });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ status: 401, working: false, issue: 'Authentication required' });
    });

    it('should handle special URL network error in HEAD', async () => {
      const links = [{ id: 'test', url: 'https://example.com/file.pdf', text: 'PDF' }];
      mockHead.mockRejectedValue({ code: 'ECONNREFUSED' });
      mockGet.mockRejectedValue({ code: 'ECONNREFUSED' });
      const result = await evaluateLinks(links);
      expect(result[0]).toMatchObject({ working: false, issue: 'Connection refused by server' });
    });


      // const result = await evaluateLinks(links);
      // expect(result[0].method).toBe('HEAD-SPECIAL');
    });
  

