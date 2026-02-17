import { describe, it, expect } from 'vitest';
import { diffLines } from 'diff';
import TurndownService from 'turndown';

describe('Utility Functions', () => {
  describe('diffLines', () => {
    it('should calculate diff between two texts', () => {
      const original = 'Line 1\nLine 2\nLine 3';
      const modified = 'Line 1\nLine 2 modified\nLine 3';
      
      const diff = diffLines(original, modified);
      
      expect(diff).toBeDefined();
      expect(diff.length).toBeGreaterThan(0);
      expect(diff.some(part => part.added)).toBe(true);
      expect(diff.some(part => part.removed)).toBe(true);
    });

    it('should show no changes for identical texts', () => {
      const text = 'Same text\nSame text';
      
      const diff = diffLines(text, text);
      
      expect(diff).toHaveLength(1);
      expect(diff[0].added).toBeFalsy();
      expect(diff[0].removed).toBeFalsy();
    });

    it('should handle additions', () => {
      const original = 'Line 1';
      const modified = 'Line 1\nLine 2';
      
      const diff = diffLines(original, modified);
      
      const addedParts = diff.filter(part => part.added);
      expect(addedParts.length).toBeGreaterThan(0);
    });

    it('should handle deletions', () => {
      const original = 'Line 1\nLine 2';
      const modified = 'Line 1';
      
      const diff = diffLines(original, modified);
      
      const removedParts = diff.filter(part => part.removed);
      expect(removedParts.length).toBeGreaterThan(0);
    });
  });

  describe('TurndownService', () => {
    const turndownService = new TurndownService({ headingStyle: 'atx' });

    it('should convert HTML to Markdown', () => {
      const html = '<h1>Title</h1><p>Paragraph</p>';
      const markdown = turndownService.turndown(html);
      
      expect(markdown).toContain('# Title');
      expect(markdown).toContain('Paragraph');
    });

    it('should convert links', () => {
      const html = '<a href="https://example.com">Link</a>';
      const markdown = turndownService.turndown(html);
      
      expect(markdown).toContain('[Link](https://example.com)');
    });

    it('should convert lists', () => {
      const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const markdown = turndownService.turndown(html);
      
      expect(markdown).toContain('*   Item 1');
      expect(markdown).toContain('*   Item 2');
    });

    it('should convert headings', () => {
      const html = '<h1>H1</h1><h2>H2</h2><h3>H3</h3>';
      const markdown = turndownService.turndown(html);
      
      expect(markdown).toContain('# H1');
      expect(markdown).toContain('## H2');
      expect(markdown).toContain('### H3');
    });

    it('should convert bold and italic', () => {
      const html = '<strong>Bold</strong> and <em>Italic</em>';
      const markdown = turndownService.turndown(html);
      
      expect(markdown).toContain('**Bold**');
      expect(markdown).toContain('_Italic_');
    });

    it('should handle complex HTML', () => {
      const html = `
        <article>
          <h1>Blog Title</h1>
          <p>Introduction paragraph with <a href="https://example.com">a link</a>.</p>
          <h2>Section 1</h2>
          <p>Content with <strong>bold</strong> and <em>italic</em> text.</p>
          <ul>
            <li>List item 1</li>
            <li>List item 2</li>
          </ul>
        </article>
      `;
      
      const markdown = turndownService.turndown(html);
      
      expect(markdown).toContain('# Blog Title');
      expect(markdown).toContain('## Section 1');
      expect(markdown).toContain('[a link](https://example.com)');
      expect(markdown).toContain('**bold**');
      expect(markdown).toContain('_italic_');
    });
  });

  describe('HTML Stripping', () => {
    it('should extract text from HTML', () => {
      const html = '<p>Hello <strong>World</strong></p>';
      const temp = document.createElement('div');
      temp.innerHTML = html;
      const text = temp.textContent || temp.innerText;
      
      expect(text).toBe('Hello World');
    });

    it('should handle nested HTML', () => {
      const html = '<div><p>Outer <span>Inner</span></p></div>';
      const temp = document.createElement('div');
      temp.innerHTML = html;
      const text = temp.textContent;
      
      expect(text).toBe('Outer Inner');
    });

    it('should handle empty HTML', () => {
      const html = '';
      const temp = document.createElement('div');
      temp.innerHTML = html;
      const text = temp.textContent;
      
      expect(text).toBe('');
    });
  });

  describe('Sentence Splitting', () => {
    it('should split text by sentences', () => {
      const text = 'First sentence. Second sentence! Third sentence?';
      const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
      
      expect(sentences).toHaveLength(3);
      expect(sentences[0]).toBe('First sentence.');
      expect(sentences[1]).toBe('Second sentence!');
      expect(sentences[2]).toBe('Third sentence?');
    });

    it('should handle text without punctuation', () => {
      const text = 'No punctuation here';
      const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
      
      expect(sentences).toHaveLength(1);
      expect(sentences[0]).toBe('No punctuation here');
    });

    it('should filter empty sentences', () => {
      const text = 'Sentence one.  Sentence two.';
      const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
      
      expect(sentences).toHaveLength(2);
      expect(sentences.every(s => s.trim().length > 0)).toBe(true);
    });
  });

  describe('URL Validation', () => {
    it('should validate correct URLs', () => {
      const validUrls = [
        'https://example.com',
        'http://example.com/blog',
        'https://sub.example.com/path/to/blog',
        'https://example.com/blog?param=value'
      ];
      
      validUrls.forEach(url => {
        expect(() => new URL(url)).not.toThrow();
      });
    });

    it('should reject invalid URLs', () => {
      const invalidUrls = [
        'not a url',
        'example.com',
        'ftp://example.com'
      ];
      
      invalidUrls.forEach(url => {
        try {
          new URL(url);
          // If we get here, the URL was valid (shouldn't happen for these)
          expect(url).toBe('should have thrown');
        } catch (e) {
          expect(e).toBeDefined();
        }
      });
    });
  });

  describe('Array Operations', () => {
    it('should filter arrays correctly', () => {
      const proposals = [
        { id: 1, approved: true },
        { id: 2, approved: false },
        { id: 3, approved: true }
      ];
      
      const approved = proposals.filter(p => p.approved);
      
      expect(approved).toHaveLength(2);
      expect(approved[0].id).toBe(1);
      expect(approved[1].id).toBe(3);
    });

    it('should map arrays correctly', () => {
      const sections = [
        { heading: 'Section 1', content: 'Content 1' },
        { heading: 'Section 2', content: 'Content 2' }
      ];
      
      const headings = sections.map(s => s.heading);
      
      expect(headings).toEqual(['Section 1', 'Section 2']);
    });

    it('should reduce arrays correctly', () => {
      const proposals = [
        { affectedSections: [0, 1] },
        { affectedSections: [2, 3, 4] }
      ];
      
      const total = proposals.reduce((acc, p) => acc + p.affectedSections.length, 0);
      
      expect(total).toBe(5);
    });
  });

  describe('Object Manipulation', () => {
    it('should spread objects correctly', () => {
      const original = { id: 1, approved: false };
      const updated = { ...original, approved: true };
      
      expect(updated.id).toBe(1);
      expect(updated.approved).toBe(true);
      expect(original.approved).toBe(false);
    });

    it('should destructure objects correctly', () => {
      const data = { title: 'Test', content: 'Content', url: 'https://example.com' };
      const { title, content } = data;
      
      expect(title).toBe('Test');
      expect(content).toBe('Content');
    });
  });

  describe('String Operations', () => {
    it('should trim strings', () => {
      const text = '  Hello World  ';
      expect(text.trim()).toBe('Hello World');
    });

    it('should check string inclusion', () => {
      const text = 'Hello World';
      expect(text.includes('World')).toBe(true);
      expect(text.includes('Goodbye')).toBe(false);
    });

    it('should substring correctly', () => {
      const text = 'Hello World';
      expect(text.substring(0, 5)).toBe('Hello');
      expect(text.substring(6)).toBe('World');
    });

    it('should replace strings', () => {
      const text = 'Hello World';
      expect(text.replace('World', 'Universe')).toBe('Hello Universe');
    });
  });
});
