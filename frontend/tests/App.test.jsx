import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import App from '../src/app';

// Mock axios
vi.mock('axios');

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Render', () => {
    it('should render the app header', () => {
      render(<App />);
      expect(screen.getByText('📝 Blog Refresh System')).toBeInTheDocument();
      expect(screen.getByText(/Improve blog posts with AI-assisted analysis/i)).toBeInTheDocument();
    });

    it('should show input step by default', () => {
      render(<App />);
      expect(screen.getByText('Enter Blog Content')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('https://example.com/blog-post')).toBeInTheDocument();
    });

    it('should have URL mode selected by default', () => {
      render(<App />);
      const urlButton = screen.getByText('📎 URL');
      expect(urlButton).toHaveClass('active');
    });
  });

  describe('Input Mode Toggle', () => {
    it('should switch to HTML mode', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      const htmlButton = screen.getByText('📄 HTML');
      await user.click(htmlButton);
      
      expect(htmlButton).toHaveClass('active');
      expect(screen.getByPlaceholderText('Paste HTML content here...')).toBeInTheDocument();
    });

    it('should switch back to URL mode', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      const htmlButton = screen.getByText('📄 HTML');
      await user.click(htmlButton);
      
      const urlButton = screen.getByText('📎 URL');
      await user.click(urlButton);
      
      expect(urlButton).toHaveClass('active');
      expect(screen.getByPlaceholderText('https://example.com/blog-post')).toBeInTheDocument();
    });
  });

  describe('Fetch Blog (URL Mode)', () => {
    it('should show error if URL is empty', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      const analyzeButton = screen.getByText('Analyze Blog');
      await user.click(analyzeButton);
      
      expect(screen.getByText(/Please enter a valid URL/i)).toBeInTheDocument();
    });

    it('should fetch blog successfully', async () => {
      const mockBlogData = {
        data: {
          success: true,
          data: {
            title: 'Test Blog',
            content: '<h2>Section 1</h2><p>Content</p>',
            url: 'https://example.com/blog'
          }
        }
      };

      const mockAnalysisData = {
        data: {
          success: true,
          data: {
            sections: [{ id: 'section-0', heading: 'Section 1', content: '<p>Content</p>' }],
            linkEvaluations: [],
            structureAnalysis: { needsRestructuring: false, suggestions: [] },
            proposals: []
          }
        }
      };

      axios.post
        .mockResolvedValueOnce(mockBlogData)
        .mockResolvedValueOnce(mockAnalysisData);

      const user = userEvent.setup();
      render(<App />);
      
      const input = screen.getByPlaceholderText('https://example.com/blog-post');
      await user.type(input, 'https://example.com/blog');
      
      const analyzeButton = screen.getByText('Analyze Blog');
      await user.click(analyzeButton);
      
      await waitFor(() => {
        expect(screen.getByText('🔍 Analyzing blog post...')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('Blog Analysis Complete')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should handle fetch errors', async () => {
      axios.post.mockRejectedValueOnce({
        response: { data: { error: 'Failed to fetch blog' } }
      });

      const user = userEvent.setup();
      render(<App />);
      
      const input = screen.getByPlaceholderText('https://example.com/blog-post');
      await user.type(input, 'https://example.com/blog');
      
      const analyzeButton = screen.getByText('Analyze Blog');
      await user.click(analyzeButton);
      
      await waitFor(() => {
        expect(screen.getByText(/Failed to fetch blog/i)).toBeInTheDocument();
      });
    });
  });

  describe('Analyze Blog', () => {
    const setupAnalysisStep = async () => {
      const mockBlogData = {
        data: {
          success: true,
          data: {
            title: 'Test Blog',
            content: '<h2>Section 1</h2><p>Content</p><a href="https://broken.com">Link</a>',
            url: 'https://example.com/blog'
          }
        }
      };

      const mockAnalysisData = {
        data: {
          success: true,
          data: {
            sections: [
              { id: 'section-0', heading: 'Section 1', content: '<p>Content</p>' },
              { id: 'section-1', heading: 'Section 2', content: '<p>More content</p>' }
            ],
            linkEvaluations: [
              { id: 'link-0', url: 'https://broken.com', working: false }
            ],
            structureAnalysis: {
              needsRestructuring: true,
              suggestions: [
                {
                  action: 'merge',
                  affectedSections: [0, 1],
                  newHeading: 'Combined Section',
                  rationale: 'Better flow',
                  confidenceLevel: 'high'
                }
              ]
            },
            proposals: [
              {
                id: 'proposal-1',
                type: 'link-fixes',
                title: 'Fix Broken Links',
                description: 'Found 1 broken link',
                affectedLinks: [{ url: 'https://broken.com', text: 'Link' }],
                rationale: 'Broken links harm UX',
                approved: false
              },
              {
                id: 'proposal-2',
                type: 'structure',
                action: 'merge',
                title: 'Combined Section',
                description: 'Merge sections',
                affectedSections: [0, 1],
                rationale: 'Better flow',
                approved: false
              }
            ]
          }
        }
      };

      axios.post
        .mockResolvedValueOnce(mockBlogData)
        .mockResolvedValueOnce(mockAnalysisData);

      const user = userEvent.setup();
      render(<App />);
      
      const input = screen.getByPlaceholderText('https://example.com/blog-post');
      await user.type(input, 'https://example.com/blog');
      
      const analyzeButton = screen.getByText('Analyze Blog');
      await user.click(analyzeButton);
      
      await waitFor(() => {
        expect(screen.getByText('Blog Analysis Complete')).toBeInTheDocument();
      }, { timeout: 3000 });

      return user;
    };

    it('should display analysis results', async () => {
      await setupAnalysisStep();
      
      expect(screen.getByText('Test Blog')).toBeInTheDocument();
      expect(screen.getByText(/2 sections found/i)).toBeInTheDocument();
      expect(screen.getByText('Proposed Improvements')).toBeInTheDocument();
    });

    it('should display proposals', async () => {
      await setupAnalysisStep();
      
      expect(screen.getByText('Fix Broken Links')).toBeInTheDocument();
      expect(screen.getByText('Combined Section')).toBeInTheDocument();
    });

    it('should toggle proposal approval', async () => {
      const user = await setupAnalysisStep();
      
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes[0]).not.toBeChecked();
      
      await user.click(checkboxes[0]);
      expect(checkboxes[0]).toBeChecked();
      
      await user.click(checkboxes[0]);
      expect(checkboxes[0]).not.toBeChecked();
    });

    it('should disable apply button when no changes approved', async () => {
      const user = await setupAnalysisStep();
      
      const applyButton = screen.getByText(/Apply 0 Approved Changes/i);
      expect(applyButton).toBeDisabled();
    });

    it('should show preview when changes are approved', async () => {
      const user = await setupAnalysisStep();
      
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]);
      
      await waitFor(() => {
        expect(screen.getByText(/Preview: Projected Final Structure/i)).toBeInTheDocument();
      });
    });
  });

  describe('Apply Changes', () => {
    const setupApplyStep = async () => {
      const mockBlogData = {
        data: {
          success: true,
          data: {
            title: 'Test Blog',
            content: '<h2>Section 1</h2><p>Content</p>',
            url: 'https://example.com/blog'
          }
        }
      };

      const mockAnalysisData = {
        data: {
          success: true,
          data: {
            sections: [{ id: 'section-0', heading: 'Section 1', content: '<p>Content</p>' }],
            linkEvaluations: [],
            structureAnalysis: { needsRestructuring: false, suggestions: [] },
            proposals: [
              {
                id: 'proposal-1',
                type: 'link-fixes',
                title: 'Fix Broken Links',
                description: 'Found 1 broken link',
                affectedLinks: [{ url: 'https://broken.com' }],
                rationale: 'Broken links harm UX',
                approved: false
              }
            ]
          }
        }
      };

      const mockRefreshedData = {
        data: {
          success: true,
          data: {
            refreshedContent: '<h2>Section 1</h2><p>Refreshed content</p>'
          }
        }
      };

      axios.post
        .mockResolvedValueOnce(mockBlogData)
        .mockResolvedValueOnce(mockAnalysisData)
        .mockResolvedValueOnce(mockRefreshedData);

      const user = userEvent.setup();
      render(<App />);
      
      const input = screen.getByPlaceholderText('https://example.com/blog-post');
      await user.type(input, 'https://example.com/blog');
      
      const analyzeButton = screen.getByText('Analyze Blog');
      await user.click(analyzeButton);
      
      await waitFor(() => {
        expect(screen.getByText('Blog Analysis Complete')).toBeInTheDocument();
      }, { timeout: 3000 });

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);
      
      const applyButton = screen.getByText(/Apply 1 Approved Changes/i);
      await user.click(applyButton);
      
      await waitFor(() => {
        expect(screen.getByText('✓ Blog Refreshed Successfully!')).toBeInTheDocument();
      }, { timeout: 3000 });

      return user;
    };

    it('should apply changes successfully', async () => {
      await setupApplyStep();
      
      expect(screen.getByText('✓ Blog Refreshed Successfully!')).toBeInTheDocument();
      expect(screen.getByText('Original Content')).toBeInTheDocument();
      expect(screen.getByText('Refreshed Content')).toBeInTheDocument();
    });

    it('should show side-by-side view by default', async () => {
      await setupApplyStep();
      
      const sideBySideButton = screen.getByText('📄 Side by Side');
      expect(sideBySideButton).toHaveClass('active');
    });

    it('should switch to diff view', async () => {
      const user = await setupApplyStep();
      
      const diffButton = screen.getByText('🔍 Diff View');
      await user.click(diffButton);
      
      expect(diffButton).toHaveClass('active');
      expect(screen.getByText('Changes Made')).toBeInTheDocument();
    });

    it('should copy original content to clipboard', async () => {
      const user = await setupApplyStep();
      
      const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText');
      
      const copyButtons = screen.getAllByText('📋 Copy');
      await user.click(copyButtons[0]);
      
      await waitFor(() => {
        expect(writeTextSpy).toHaveBeenCalled();
      });
    });

    it('should download HTML file', async () => {
      const user = await setupApplyStep();
      
      const downloadButton = screen.getByText('📥 Download HTML');
      await user.click(downloadButton);
      
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    });

    it('should download Markdown file', async () => {
      const user = await setupApplyStep();
      
      const downloadButton = screen.getByText('📝 Download Markdown');
      await user.click(downloadButton);
      
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    });

    it('should go back to approval step', async () => {
      const user = await setupApplyStep();
      
      const tryDifferentButton = screen.getByText('← Try Different Changes');
      await user.click(tryDifferentButton);
      
      await waitFor(() => {
        expect(screen.getByText('Blog Analysis Complete')).toBeInTheDocument();
      });
    });

    it('should reset to input step', async () => {
      const user = await setupApplyStep();
      
      const resetButton = screen.getByText('🔄 Refresh Another Blog');
      await user.click(resetButton);
      
      await waitFor(() => {
        expect(screen.getByText('Enter Blog Content')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error banner', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      const analyzeButton = screen.getByText('Analyze Blog');
      await user.click(analyzeButton);
      
      const errorBanner = screen.getByText(/Please enter a valid URL/i);
      expect(errorBanner).toBeInTheDocument();
    });

    it('should close error banner', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      const analyzeButton = screen.getByText('Analyze Blog');
      await user.click(analyzeButton);
      
      const closeButton = screen.getByText('✕');
      await user.click(closeButton);
      
      await waitFor(() => {
        expect(screen.queryByText(/Please enter a valid URL/i)).not.toBeInTheDocument();
      });
    });

    it('should handle analysis errors', async () => {
      const mockBlogData = {
        data: {
          success: true,
          data: {
            title: 'Test Blog',
            content: '<p>Content</p>',
            url: 'https://example.com/blog'
          }
        }
      };

      axios.post
        .mockResolvedValueOnce(mockBlogData)
        .mockRejectedValueOnce({
          response: { data: { error: 'Analysis failed' } }
        });

      const user = userEvent.setup();
      render(<App />);
      
      const input = screen.getByPlaceholderText('https://example.com/blog-post');
      await user.type(input, 'https://example.com/blog');
      
      const analyzeButton = screen.getByText('Analyze Blog');
      await user.click(analyzeButton);
      
      await waitFor(() => {
        expect(screen.getByText(/Analysis failed/i)).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Toast Notifications', () => {
    it('should show toast on successful copy', async () => {
      const mockBlogData = {
        data: {
          success: true,
          data: {
            title: 'Test Blog',
            content: '<p>Content</p>',
            url: 'https://example.com/blog'
          }
        }
      };

      const mockAnalysisData = {
        data: {
          success: true,
          data: {
            sections: [],
            linkEvaluations: [],
            structureAnalysis: { needsRestructuring: false, suggestions: [] },
            proposals: [
              {
                id: 'proposal-1',
                type: 'link-fixes',
                title: 'Fix',
                affectedLinks: [],
                rationale: 'Test',
                approved: false
              }
            ]
          }
        }
      };

      const mockRefreshedData = {
        data: {
          success: true,
          data: { refreshedContent: '<p>Refreshed</p>' }
        }
      };

      axios.post
        .mockResolvedValueOnce(mockBlogData)
        .mockResolvedValueOnce(mockAnalysisData)
        .mockResolvedValueOnce(mockRefreshedData);

      const user = userEvent.setup();
      render(<App />);
      
      const input = screen.getByPlaceholderText('https://example.com/blog-post');
      await user.type(input, 'https://example.com/blog');
      await user.click(screen.getByText('Analyze Blog'));
      
      await waitFor(() => {
        expect(screen.getByText('Blog Analysis Complete')).toBeInTheDocument();
      }, { timeout: 3000 });

      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByText(/Apply 1 Approved Changes/i));
      
      await waitFor(() => {
        expect(screen.getByText('✓ Blog Refreshed Successfully!')).toBeInTheDocument();
      }, { timeout: 3000 });

      const copyButtons = screen.getAllByText('📋 Copy');
      await user.click(copyButtons[0]);
      
      await waitFor(() => {
        expect(screen.getByText(/copied to clipboard/i)).toBeInTheDocument();
      });
    });
  });

  describe('HTML Input Mode', () => {
    it('should show error if HTML is empty', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      await user.click(screen.getByText('📄 HTML'));
      await user.click(screen.getByText('Analyze HTML'));
      
      expect(screen.getByText(/Please paste HTML content/i)).toBeInTheDocument();
    });
  });

  describe('Cancel Button', () => {
    it('should reset from approval step', async () => {
      const mockBlogData = {
        data: {
          success: true,
          data: {
            title: 'Test Blog',
            content: '<p>Content</p>',
            url: 'https://example.com/blog'
          }
        }
      };

      const mockAnalysisData = {
        data: {
          success: true,
          data: {
            sections: [],
            linkEvaluations: [],
            structureAnalysis: { needsRestructuring: false, suggestions: [] },
            proposals: []
          }
        }
      };

      axios.post
        .mockResolvedValueOnce(mockBlogData)
        .mockResolvedValueOnce(mockAnalysisData);

      const user = userEvent.setup();
      render(<App />);
      
      const input = screen.getByPlaceholderText('https://example.com/blog-post');
      await user.type(input, 'https://example.com/blog');
      await user.click(screen.getByText('Analyze Blog'));
      
      await waitFor(() => {
        expect(screen.getByText('Blog Analysis Complete')).toBeInTheDocument();
      }, { timeout: 3000 });

      await user.click(screen.getByText('Cancel'));
      
      await waitFor(() => {
        expect(screen.getByText('Enter Blog Content')).toBeInTheDocument();
      });
    });
  });
});
