import { useState } from 'react';
import axios from 'axios';
import { diffLines } from 'diff';
import TurndownService from 'turndown';
import parse from 'html-react-parser';
import './App.css';

const API_URL = 'http://localhost:3001';
const turndownService = new TurndownService();

function App() {
  //Instantiating state variables
  const [step, setStep] = useState('input');
  const [inputMode, setInputMode] = useState('url');
  const [blogUrl, setBlogUrl] = useState('');
  const [htmlInput, setHtmlInput] = useState('');
  const [blogContent, setBlogContent] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [refreshedContent, setRefreshedContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [viewMode, setViewMode] = useState('side-by-side'); // 'side-by-side', 'diff'

  // Show toast notification
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'success' });
    }, 3000);
  };

  // Calculate diff between original and refreshed content
  const calculateDiff = () => {
    if (!blogContent || !refreshedContent) return [];
    
    const originalText = blogContent.content.replace(/<[^>]*>/g, '\n');
    const refreshedText = refreshedContent.replace(/<[^>]*>/g, '\n');
    
    return diffLines(originalText, refreshedText);
  };

  // Export as Markdown
  const exportAsMarkdown = () => {
    const markdown = turndownService.turndown(refreshedContent);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'refreshed-blog.md';
    a.click();
    showToast('Markdown file downloaded!');
  };

  // Go back to approval step (Undo)
  const handleTryDifferentChanges = () => {
    setStep('approval');
    setRefreshedContent('');
  };

  // Step 1: Fetch blog content
  const handleFetchBlog = async () => {
    if (!blogUrl.trim()) {
      setError('Please enter a valid URL');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API_URL}/api/fetch-blog`, { url: blogUrl });
      setBlogContent(response.data.data);
      setStep('analyzing');
      
      // Automatically trigger analysis
      setTimeout(() => analyzeBlog(response.data.data), 500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch blog. Please check the URL.');
      setLoading(false);
    }
  };

  // Step 1b: Process direct HTML input
  const handleHtmlInput = async () => {
    if (!htmlInput.trim()) {
      setError('Please paste HTML content');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const $ = await import('https://cdn.jsdelivr.net/npm/cheerio@1.0.0-rc.12/+esm');
      const doc = $.load(htmlInput);
      const title = doc('h1').first().text() || doc('title').text() || 'Untitled';
      
      const content = {
        title: title.trim(),
        content: htmlInput,
        url: 'direct-input'
      };

      setBlogContent(content);
      setStep('analyzing');
      
      // Automatically trigger analysis
      setTimeout(() => analyzeBlog(content), 500);
    } catch (err) {
      setError('Failed to process HTML. Please check the format.');
      setLoading(false);
    }
  };

  // Step 2: Analyze blog
  const analyzeBlog = async (content) => {
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/analyze-blog`, {
        content: content.content,
        title: content.title
      });

      setAnalysis(response.data.data);
      setProposals(response.data.data.proposals.map(p => ({ ...p, approved: false })));
      setStep('approval');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to analyze blog');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Toggle proposal approval
  const toggleProposal = (proposalId) => {
    setProposals(prev =>
      prev.map(p => p.id === proposalId ? { ...p, approved: !p.approved } : p)
    );
  };

  // Step 4: Apply changes
  const handleApplyChanges = async () => {
    const approvedProposals = proposals.filter(p => p.approved);
    
    if (approvedProposals.length === 0) {
      setError('Please approve at least one change to proceed');
      return;
    }

    setLoading(true);
    setError('');
    setStep('generating');

    try {
      const response = await axios.post(`${API_URL}/api/apply-changes`, {
        content: blogContent.content,
        approvedProposals,
        originalSections: analysis.sections
      });

      setRefreshedContent(response.data.data.refreshedContent);
      setStep('complete');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to apply changes');
    } finally {
      setLoading(false);
    }
  };

  // Reset everything
  const handleReset = () => {
    setStep('input');
    setBlogUrl('');
    setBlogContent(null);
    setAnalysis(null);
    setProposals([]);
    setRefreshedContent('');
    setError('');
  };

  return (
    <div className="app">
      <header className="header">
        <h1>📝 Blog Refresh System</h1>
        <p>Improve blog posts with AI-assisted analysis and human oversight</p>
      </header>

      <main className="main">
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
            <button onClick={() => setError('')}>✕</button>
          </div>
        )}

        {toast.show && (
          <div className={`toast ${toast.type}`}>
            {toast.type === 'success' ? '✓' : '⚠'} {toast.message}
          </div>
        )}

        {/* Step 1: Input */}
        {step === 'input' && (
          <div className="card">
            <h2>Enter Blog Content</h2>
            <p className="hint">
              Provide a URL or paste HTML content of a blog post you'd like to refresh.
            </p>
            
            <div className="mode-toggle">
              <button 
                className={`mode-btn ${inputMode === 'url' ? 'active' : ''}`}
                onClick={() => setInputMode('url')}
              >
                📎 URL
              </button>
              <button 
                className={`mode-btn ${inputMode === 'html' ? 'active' : ''}`}
                onClick={() => setInputMode('html')}
              >
                📄 HTML
              </button>
            </div>

            {inputMode === 'url' ? (
              <>
                <div className="input-group">
                  <input
                    type="url"
                    placeholder="https://example.com/blog-post"
                    value={blogUrl}
                    onChange={(e) => setBlogUrl(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleFetchBlog()}
                  />
                  <button 
                    onClick={handleFetchBlog} 
                    disabled={loading}
                    className="btn-primary"
                  >
                    {loading ? 'Fetching...' : 'Analyze Blog'}
                  </button>
                </div>
                
              </>
            ) : (
              <>
                <textarea
                  className="html-input"
                  placeholder="Paste HTML content here..."
                  value={htmlInput}
                  onChange={(e) => setHtmlInput(e.target.value)}
                  rows={10}
                />
                <button 
                  onClick={handleHtmlInput} 
                  disabled={loading}
                  className="btn-primary full-width"
                >
                  {loading ? 'Processing...' : 'Analyze HTML'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Step 2: Analyzing (loading state) */}
        {step === 'analyzing' && (
          <div className="card loading-card">
            <div className="spinner"></div>
            <h3>Analyzing blog post...</h3>
            <p>Checking links, evaluating structure, and generating improvement proposals</p>
          </div>
        )}

        {/* Step 3: Approval */}
        {step === 'approval' && analysis && (
          <div className="approval-section">
            <div className="card">
              <h2>Blog Analysis Complete</h2>
              <div className="blog-info">
                <h3>{blogContent.title}</h3>
                <p className="meta">
                  {analysis.sections.length} sections found • {analysis.linkEvaluations.length} links checked
                </p>
              </div>
            </div>

            <div className="card">
              <h2>Proposed Improvements</h2>
              <p className="hint">
                Review each proposal and approve the changes you want to apply. 
                Only approved changes will be implemented.
              </p>

              {proposals.length === 0 ? (
                <div className="no-proposals">
                  <p> No improvements needed! This blog is already well-structured.</p>
                </div>
              ) : (
                <div className="proposals-list">
                  {proposals.map((proposal) => (
                    <div 
                      key={proposal.id} 
                      className={`proposal ${proposal.approved ? 'approved' : ''}`}
                    >
                      <div className="proposal-header">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={proposal.approved}
                            onChange={() => toggleProposal(proposal.id)}
                          />
                          <span className="proposal-title">{proposal.title}</span>
                        </label>
                        <span className={`badge ${proposal.type}`}>
                          {proposal.type}
                        </span>
                      </div>
                      
                      <p className="proposal-description">{proposal.description}</p>
                      
                      <div className="proposal-rationale">
                        <strong>Rationale:</strong> {proposal.rationale}
                      </div>

                      {proposal.type === 'link-fixes' && proposal.affectedLinks && (
                        <div className="affected-items">
                          <strong>Broken links ({proposal.affectedLinks.length}):</strong>
                          <ul>
                            {proposal.affectedLinks.slice(0, 5).map((link, idx) => (
                              <li key={idx}>
                                {link.text || 'Unnamed link'} 
                                <span className="link-url">({link.url.substring(0, 50)}...)</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {proposal.type === 'structure' && (
                        <div className="affected-items">
                          <strong>Affected sections:</strong> {proposal.affectedSections.join(', ')}
                          {proposal.newHeading && (
                            <div className="new-heading">
                              New heading: "{proposal.newHeading}"
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="approval-actions">
                <button onClick={handleReset} className="btn-secondary">
                  Cancel
                </button>
                <button 
                  onClick={handleApplyChanges} 
                  disabled={loading || proposals.filter(p => p.approved).length === 0}
                  className="btn-primary"
                >
                  Apply {proposals.filter(p => p.approved).length} Approved Changes
                </button>
              </div>
            </div>

            {/* Preview Section */}
            {proposals.filter(p => p.approved).length > 0 && (
              <div className="card preview-card">
                <h2>📋 Preview of Changes</h2>
                <p className="hint">
                  Here's what will happen when you apply the approved changes:
                </p>
                
                <div className="preview-list">
                  {proposals.filter(p => p.approved && p.type === 'link-fixes').map((proposal) => (
                    <div key={proposal.id} className="preview-item">
                      <div className="preview-icon">🔗</div>
                      <div className="preview-content">
                        <strong>Link Fixes</strong>
                        <p>{proposal.affectedLinks.length} broken links will be removed or replaced with placeholders</p>
                      </div>
                    </div>
                  ))}
                  
                  {proposals.filter(p => p.approved && p.type === 'structure').map((proposal) => (
                    <div key={proposal.id} className="preview-item">
                      <div className="preview-icon">📐</div>
                      <div className="preview-content">
                        <strong>{proposal.title}</strong>
                        <p>Sections {proposal.affectedSections.join(', ')} will be {proposal.action}ed</p>
                        {proposal.newHeading && (
                          <p className="preview-detail">New heading: "{proposal.newHeading}"</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="preview-note">
                  <strong>Note:</strong> The AI will maintain all original information while applying these structural changes.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Generating */}
        {step === 'generating' && (
          <div className="card loading-card">
            <div className="spinner"></div>
            <h3>Generating refreshed content...</h3>
            <p>Applying your approved changes</p>
          </div>
        )}

        {/* Step 5: Complete */}
        {step === 'complete' && (
          <div className="complete-section">
            <div className="card success-card">
              <h2>✓ Blog Refreshed Successfully!</h2>
              <p>Your approved changes have been applied. Review the refreshed content below.</p>
            </div>

            {/* View Mode Toggle */}
            <div className="card">
              <div className="view-mode-toggle">
                <button 
                  className={`view-btn ${viewMode === 'side-by-side' ? 'active' : ''}`}
                  onClick={() => setViewMode('side-by-side')}
                >
                  📄 Side by Side
                </button>
                <button 
                  className={`view-btn ${viewMode === 'diff' ? 'active' : ''}`}
                  onClick={() => setViewMode('diff')}
                >
                  🔍 Diff View
                </button>
              </div>
            </div>

            {/* Side by Side View */}
            {viewMode === 'side-by-side' && (
              <div className="comparison">
                <div className="card half">
                  <div className="content-header">
                    <h3>Original Content</h3>
                    <button 
                      className="btn-copy"
                      onClick={() => {
                        navigator.clipboard.writeText(blogContent.content);
                        showToast('Original content copied to clipboard!');
                      }}
                      title="Copy to clipboard"
                    >
                      📋 Copy
                    </button>
                  </div>
                  <div 
                    className="content-preview"
                    dangerouslySetInnerHTML={{ __html: blogContent.content }}
                  />
                </div>
                
                <div className="card half">
                  <div className="content-header">
                    <h3>Refreshed Content</h3>
                    <button 
                      className="btn-copy"
                      onClick={() => {
                        navigator.clipboard.writeText(refreshedContent);
                        showToast('Refreshed content copied to clipboard!');
                      }}
                      title="Copy to clipboard"
                    >
                      📋 Copy
                    </button>
                  </div>
                  <div 
                    className="content-preview"
                    dangerouslySetInnerHTML={{ __html: refreshedContent }}
                  />
                </div>
              </div>
            )}

            {/* Diff View */}
            {viewMode === 'diff' && (
              <div className="card">
                <h3>Changes Made</h3>
                <div className="diff-view">
                  {calculateDiff().map((part, index) => (
                    <div
                      key={index}
                      className={`diff-line ${
                        part.added ? 'added' : part.removed ? 'removed' : 'unchanged'
                      }`}
                    >
                      {part.added && <span className="diff-marker">+ </span>}
                      {part.removed && <span className="diff-marker">- </span>}
                      {!part.added && !part.removed && <span className="diff-marker">  </span>}
                      <span className="diff-content">{part.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="card">
              <div className="final-actions">
                <button onClick={handleTryDifferentChanges} className="btn-secondary">
                  ← Try Different Changes
                </button>
                <button onClick={handleReset} className="btn-secondary">
                  🔄 Refresh Another Blog
                </button>
                <button 
                  onClick={() => {
                    const blob = new Blob([refreshedContent], { type: 'text/html' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'refreshed-blog.html';
                    a.click();
                    showToast('HTML file downloaded!');
                  }}
                  className="btn-primary"
                >
                  📥 Download HTML
                </button>
                <button 
                  onClick={exportAsMarkdown}
                  className="btn-primary"
                >
                  📝 Download Markdown
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>Built with React js + Node.js by VP</p>
      </footer>
    </div>
  );
}

export default App;