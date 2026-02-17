import { jest } from '@jest/globals';

// Create mock
const mockGenerateContent = jest.fn();

// Mock Google GenAI
jest.unstable_mockModule('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent
    }
  }))
}));

// Import after mocking
const { analyzeStructure, generateProposals, applyChanges } = await import('../src/helpers/aiAnalyzer.js');

describe('AI Analyzer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeStructure', () => {
    const mockSections = [
      { heading: 'Introduction', content: 'Intro content' },
      { heading: 'Main Topic', content: 'Main content' },
      { heading: 'Conclusion', content: 'Conclusion content' }
    ];

    it('should analyze structure and return parsed response', async () => {
      const mockResponse = {
        text: JSON.stringify({
          needsRestructuring: true,
          currentSectionCount: 3,
          restructuringReason: 'Sections can be merged for better flow',
          suggestions: [
            {
              action: 'merge',
              affectedSections: [0, 1],
              newHeading: 'Introduction and Main Topic',
              rationale: 'These sections flow better together',
              confidenceLevel: 'high'
            }
          ]
        })
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await analyzeStructure(mockSections, 'Test Blog');

      expect(result).toEqual({
        needsRestructuring: true,
        currentSectionCount: 3,
        restructuringReason: 'Sections can be merged for better flow',
        suggestions: [
          {
            action: 'merge',
            affectedSections: [0, 1],
            newHeading: 'Introduction and Main Topic',
            rationale: 'These sections flow better together',
            confidenceLevel: 'high'
          }
        ]
      });
    });

    it('should filter out low confidence suggestions', async () => {
      const mockResponse = {
        text: JSON.stringify({
          needsRestructuring: true,
          currentSectionCount: 3,
          restructuringReason: 'Some improvements possible',
          suggestions: [
            {
              action: 'merge',
              affectedSections: [0, 1],
              newHeading: 'Merged Section',
              rationale: 'High confidence merge',
              confidenceLevel: 'high'
            },
            {
              action: 'merge',
              affectedSections: [1, 2],
              newHeading: 'Another Merge',
              rationale: 'Low confidence merge',
              confidenceLevel: 'low'
            }
          ]
        })
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await analyzeStructure(mockSections, 'Test Blog');

      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].confidenceLevel).toBe('high');
    });

    it('should mark as no restructuring needed when no high/medium confidence suggestions remain', async () => {
      const mockResponse = {
        text: JSON.stringify({
          needsRestructuring: true,
          currentSectionCount: 3,
          restructuringReason: 'Some improvements possible',
          suggestions: [
            {
              action: 'merge',
              affectedSections: [0, 1],
              newHeading: 'Low Confidence Merge',
              rationale: 'Not very confident about this',
              confidenceLevel: 'low'
            }
          ]
        })
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await analyzeStructure(mockSections, 'Test Blog');

      expect(result.needsRestructuring).toBe(false);
      expect(result.suggestions).toHaveLength(0);
    });

    it('should handle malformed JSON response', async () => {
      const mockResponse = {
        text: 'This is not valid JSON'
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await analyzeStructure(mockSections, 'Test Blog');

      expect(result).toEqual({
        needsRestructuring: false,
        currentSectionCount: 3,
        restructuringReason: 'Unable to parse AI response',
        suggestions: []
      });
    });

    it('should handle API errors', async () => {
      mockGenerateContent.mockRejectedValue(new Error('API Error'));

      await expect(analyzeStructure(mockSections, 'Test Blog')).rejects.toThrow('API Error');
    });

    it('should handle response with JSON wrapped in text', async () => {
      const mockResponse = {
        text: `Here's the analysis:
        {
          "needsRestructuring": false,
          "currentSectionCount": 3,
          "restructuringReason": "Structure is already good",
          "suggestions": []
        }
        That's my recommendation.`
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await analyzeStructure(mockSections, 'Test Blog');

      expect(result.needsRestructuring).toBe(false);
      expect(result.currentSectionCount).toBe(3);
    });

    it('should keep medium confidence suggestions', async () => {
      const mockResponse = {
        text: JSON.stringify({
          needsRestructuring: true,
          currentSectionCount: 3,
          restructuringReason: 'Medium confidence improvements',
          suggestions: [
            {
              action: 'rewrite',
              affectedSections: [1],
              rationale: 'Could be improved',
              confidenceLevel: 'medium'
            }
          ]
        })
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await analyzeStructure(mockSections, 'Test Blog');

      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].confidenceLevel).toBe('medium');
    });
  });

  describe('generateProposals', () => {
    const mockSections = [
      { heading: 'Section 1', content: 'Content 1' },
      { heading: 'Section 2', content: 'Content 2' },
      { heading: 'Section 3', content: 'Content 3' }
    ];

    it('should generate link fix proposals for broken links', () => {
      const linkEvals = [
        { id: 'link-1', url: 'https://broken.com', working: false, text: 'Broken Link' },
        { id: 'link-2', url: 'https://working.com', working: true, text: 'Working Link' }
      ];

      const structureAnalysis = {
        needsRestructuring: false,
        suggestions: []
      };

      const proposals = generateProposals(mockSections, linkEvals, structureAnalysis);

      expect(proposals).toHaveLength(1);
      expect(proposals[0]).toMatchObject({
        type: 'link-fixes',
        title: 'Fix Broken Links',
        description: 'Found 1 broken or inaccessible links that should be updated or removed.',
        affectedLinks: [linkEvals[0]],
        approved: false
      });
    });

    it('should generate structure proposals for high/medium confidence suggestions', () => {
      const linkEvals = [];
      const structureAnalysis = {
        needsRestructuring: true,
        suggestions: [
          {
            action: 'merge',
            affectedSections: [0, 1],
            newHeading: 'Combined Section',
            rationale: 'Better flow',
            confidenceLevel: 'high'
          },
          {
            action: 'rewrite',
            affectedSections: [2],
            rationale: 'Needs improvement',
            confidenceLevel: 'medium'
          }
        ]
      };

      const proposals = generateProposals(mockSections, linkEvals, structureAnalysis);

      expect(proposals).toHaveLength(2);
      expect(proposals[0]).toMatchObject({
        type: 'structure',
        action: 'merge',
        title: 'Combined Section',
        affectedSections: [0, 1],
        confidenceLevel: 'high'
      });
      expect(proposals[1]).toMatchObject({
        type: 'structure',
        action: 'rewrite',
        affectedSections: [2],
        confidenceLevel: 'medium'
      });
    });

    it('should skip bulk merges (more than 3 sections)', () => {
      const linkEvals = [];
      const structureAnalysis = {
        needsRestructuring: true,
        suggestions: [
          {
            action: 'merge',
            affectedSections: [0, 1, 2, 3, 4],
            newHeading: 'Bulk Merge',
            rationale: 'Merge everything',
            confidenceLevel: 'high'
          }
        ]
      };

      const proposals = generateProposals(mockSections, linkEvals, structureAnalysis);

      expect(proposals).toHaveLength(0);
    });

    it('should skip suggestions with no affected sections', () => {
      const linkEvals = [];
      const structureAnalysis = {
        needsRestructuring: true,
        suggestions: [
          {
            action: 'merge',
            affectedSections: [],
            newHeading: 'Invalid',
            rationale: 'No sections',
            confidenceLevel: 'high'
          }
        ]
      };

      const proposals = generateProposals(mockSections, linkEvals, structureAnalysis);

      expect(proposals).toHaveLength(0);
    });

    it('should handle no broken links and no structure changes', () => {
      const linkEvals = [
        { id: 'link-1', url: 'https://working.com', working: true }
      ];
      const structureAnalysis = {
        needsRestructuring: false,
        suggestions: []
      };

      const proposals = generateProposals(mockSections, linkEvals, structureAnalysis);

      expect(proposals).toHaveLength(0);
    });

    it('should handle multiple broken links', () => {
      const linkEvals = [
        { id: 'link-1', url: 'https://broken1.com', working: false },
        { id: 'link-2', url: 'https://broken2.com', working: false },
        { id: 'link-3', url: 'https://broken3.com', working: false }
      ];
      const structureAnalysis = { needsRestructuring: false, suggestions: [] };

      const proposals = generateProposals(mockSections, linkEvals, structureAnalysis);

      expect(proposals).toHaveLength(1);
      expect(proposals[0].affectedLinks).toHaveLength(3);
    });

    it('should create proposals with proper IDs', () => {
      const linkEvals = [{ id: 'link-1', url: 'https://broken.com', working: false }];
      const structureAnalysis = {
        needsRestructuring: true,
        suggestions: [
          { action: 'merge', affectedSections: [0, 1], newHeading: 'Test', rationale: 'Test', confidenceLevel: 'high' }
        ]
      };

      const proposals = generateProposals(mockSections, linkEvals, structureAnalysis);

      expect(proposals[0].id).toBe('proposal-links');
      expect(proposals[1].id).toBe('proposal-structure-0');
    });
  });

  describe('applyChanges', () => {
    const originalContent = `
      <h1>Test Blog</h1>
      <h2>Section 1</h2>
      <p>Content 1</p>
      <a href="https://broken.com">Broken Link</a>
      <h2>Section 2</h2>
      <p>Content 2</p>
    `;

    const originalSections = [
      { heading: 'Section 1', content: '<p>Content 1</p>' },
      { heading: 'Section 2', content: '<p>Content 2</p>' }
    ];

    it('should apply link fixes only', async () => {
      const approvedProposals = [
        {
          type: 'link-fixes',
          affectedLinks: [
            { url: 'https://broken.com', text: 'Broken Link' }
          ]
        }
      ];

      const result = await applyChanges(originalContent, approvedProposals, originalSections);

      expect(result).toContain('href="#"');
      expect(result).toContain('class="broken-link-removed"');
    });

    it('should apply structure changes with AI', async () => {
      const approvedProposals = [
        {
          type: 'structure',
          action: 'merge',
          description: 'Merge sections',
          rationale: 'Better flow',
          affectedSections: [0, 1],
          newHeading: 'Combined Section'
        }
      ];

      const mockResponse = {
        text: `
          <h1>Test Blog</h1>
          <h2>Combined Section</h2>
          <p>Content 1</p>
          <p>Content 2</p>
        `
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await applyChanges(originalContent, approvedProposals, originalSections);

      expect(result).toContain('Combined Section');
    });

    it('should strip markdown code blocks from AI response', async () => {
      const approvedProposals = [
        {
          type: 'structure',
          action: 'merge',
          description: 'Merge sections',
          rationale: 'Better flow',
          affectedSections: [0, 1]
        }
      ];

      const mockResponse = {
        text: '```html\n<h1>Test</h1>\n<p>Content</p>\n```'
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await applyChanges(originalContent, approvedProposals, originalSections);

      expect(result).toBe('<h1>Test</h1>\n<p>Content</p>');
      expect(result).not.toContain('```');
    });

    it('should handle both link fixes and structure changes', async () => {
      const approvedProposals = [
        {
          type: 'link-fixes',
          affectedLinks: [
            { url: 'https://broken.com', text: 'Broken Link' }
          ]
        },
        {
          type: 'structure',
          action: 'merge',
          description: 'Merge sections',
          rationale: 'Better flow',
          affectedSections: [0, 1]
        }
      ];

      const mockResponse = {
        text: '<h1>Test Blog</h1><h2>Merged</h2><p>Combined content</p>'
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await applyChanges(originalContent, approvedProposals, originalSections);

      expect(result).toContain('Merged');
    });

    it('should handle AI errors', async () => {
      const approvedProposals = [
        {
          type: 'structure',
          action: 'merge',
          description: 'Merge sections',
          rationale: 'Better flow',
          affectedSections: [0, 1]
        }
      ];

      mockGenerateContent.mockRejectedValue(new Error('AI API Error'));

      await expect(applyChanges(originalContent, approvedProposals, originalSections)).rejects.toThrow('AI API Error');
    });

    it('should return original content with link fixes when no structure changes', async () => {
      const approvedProposals = [
        {
          type: 'link-fixes',
          affectedLinks: [
            { url: 'https://broken.com', text: 'Broken Link' }
          ]
        }
      ];

      const result = await applyChanges(originalContent, approvedProposals, originalSections);

      expect(result).toContain('href="#"');
      expect(result).toContain('class="broken-link-removed"');
    });

    it('should handle empty proposals', async () => {
      const result = await applyChanges(originalContent, [], originalSections);

      expect(result).toBeDefined();
    });

    it('should strip ```html and ``` from response', async () => {
      const approvedProposals = [
        {
          type: 'structure',
          action: 'merge',
          description: 'Test',
          rationale: 'Test',
          affectedSections: [0]
        }
      ];

      mockGenerateContent.mockResolvedValue({
        text: '```html\n<div>Test</div>\n```'
      });

      const result = await applyChanges(originalContent, approvedProposals, originalSections);

      expect(result).toBe('<div>Test</div>');
    });
  });
});
