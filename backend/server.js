import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import * as cheerio from 'cheerio';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Google Gemini client
const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Blog Refresh API is running' });
});

// Fetch blog content from URL
app.post('/api/fetch-blog', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Fetch the blog content
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Try to extract main content (common selectors)
    let content = $('article').html() || 
                  $('main').html() || 
                  $('.post-content').html() || 
                  $('.entry-content').html() ||
                  $('body').html();

    // Extract title
    const title = $('h1').first().text() || $('title').text() || 'Untitled';

    res.json({
      success: true,
      data: {
        title: title.trim(),
        content,
        url
      }
    });

  } catch (error) {
    console.error('Error fetching blog:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch blog content',
      details: error.message 
    });
  }
});

// Analyze blog content and generate proposals
app.post('/api/analyze-blog', async (req, res) => {
  try {
    const { content, title } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    console.log(`Analyzing blog: "${title}"`);

    // Parse the HTML to extract sections and links
    const $ = cheerio.load(content);
    
    // Extract sections (based on h2 headers)
    const sections = [];
    $('h2').each((i, elem) => {
      const heading = $(elem).text().trim();
      let sectionContent = '';
      
      // Get content until next h2
      $(elem).nextUntil('h2').each((j, contentElem) => {
        sectionContent += $.html(contentElem);
      });
      
      sections.push({
        id: `section-${i}`,
        heading,
        content: sectionContent,
        originalIndex: i
      });
    });

    // Extract all links
    const links = [];
    $('a[href]').each((i, elem) => {
      const href = $(elem).attr('href');
      const text = $(elem).text().trim();
      if (href && href.startsWith('http')) {
        links.push({
          id: `link-${i}`,
          url: href,
          text,
          context: $(elem).parent().text().substring(0, 100)
        });
      }
    });

    console.log(`Found ${sections.length} sections and ${links.length} links`);

    // Validation
    if (sections.length === 0) {
      console.log('Warning: No H2 sections found, blog might use different structure');
    }

    // Step 1: Check link validity
    const linkEvaluations = await evaluateLinks(links);
    console.log(`Link check complete: ${linkEvaluations.filter(l => !l.working).length} broken links`);

    // Step 2: Ask Claude to analyze structure (only if we have sections)
    let structureAnalysis = {
      needsRestructuring: false,
      currentSectionCount: sections.length,
      suggestions: []
    };

    if (sections.length > 0) {
      try {
        structureAnalysis = await analyzeStructure(sections, title);
      } catch (error) {
        console.error('Structure analysis failed:', error.message);
        // Continue with empty suggestions rather than failing completely
      }
    }

    // Step 3: Generate proposals
    const proposals = await generateProposals(
      sections, 
      linkEvaluations, 
      structureAnalysis
    );

    console.log(`Generated ${proposals.length} improvement proposals`);

    res.json({
      success: true,
      data: {
        sections,
        linkEvaluations,
        structureAnalysis,
        proposals
      }
    });

  } catch (error) {
    console.error('Error analyzing blog:', error);
    res.status(500).json({ 
      error: 'Failed to analyze blog',
      details: error.message 
    });
  }
});

// Apply approved changes
app.post('/api/apply-changes', async (req, res) => {
  try {
    const { content, approvedProposals, originalSections } = req.body;

    if (!content || !approvedProposals) {
      return res.status(400).json({ error: 'Missing required data' });
    }

    // Generate the refreshed content
    const refreshedContent = await applyChanges(
      content,
      approvedProposals,
      originalSections
    );

    res.json({
      success: true,
      data: {
        refreshedContent
      }
    });

  } catch (error) {
    console.error('Error applying changes:', error);
    res.status(500).json({ 
      error: 'Failed to apply changes',
      details: error.message 
    });
  }
});

// Helper: Evaluate links
async function evaluateLinks(links) {
  const evaluations = [];
  
  // Check up to 20 links to avoid timeout
  const linksToCheck = links.slice(0, 20);
  
  for (const link of linksToCheck) {
    try {
      const response = await axios.head(link.url, {
        timeout: 5000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500
      });
      
      evaluations.push({
        ...link,
        status: response.status,
        working: response.status >= 200 && response.status < 400,
        issue: response.status >= 400 ? 'Broken or redirected' : null
      });
    } catch (error) {
      evaluations.push({
        ...link,
        status: 0,
        working: false,
        issue: error.code === 'ENOTFOUND' ? 'Domain not found' : 'Connection failed'
      });
    }
  }
  
  return evaluations;
}

// Helper: Analyze structure with Gemini
async function analyzeStructure(sections, title) {
  const prompt = `You are analyzing a blog post titled "${title}" for structural improvements.

The blog currently has ${sections.length} main sections:
${sections.map((s, i) => `${i + 1}. ${s.heading}`).join('\n')}

Task: The refreshed blog should have no more than 6 main sections. Analyze the current structure and suggest how to reorganize it.

For each suggestion, provide:
1. What action to take (merge, rewrite, keep, remove)
2. Which sections are affected
3. A clear rationale explaining why this improves clarity

Respond in JSON format:
{
  "needsRestructuring": true/false,
  "currentSectionCount": number,
  "suggestions": [
    {
      "action": "merge|rewrite|keep|remove",
      "affectedSections": [section indices],
      "newHeading": "proposed heading if merging",
      "rationale": "why this improves the post"
    }
  ]
}`;

  const response = await genAI.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt
  });
  
  const responseText = response.text;
  
  // Extract JSON from response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  
  return {
    needsRestructuring: sections.length > 6,
    currentSectionCount: sections.length,
    suggestions: []
  };
}

// Helper: Generate improvement proposals
async function generateProposals(sections, linkEvals, structureAnalysis) {
  const proposals = [];
  
  // Link replacement proposals
  const brokenLinks = linkEvals.filter(l => !l.working);
  if (brokenLinks.length > 0) {
    proposals.push({
      id: 'proposal-links',
      type: 'link-fixes',
      title: 'Fix Broken Links',
      description: `Found ${brokenLinks.length} broken or inaccessible links that should be updated or removed.`,
      affectedLinks: brokenLinks,
      rationale: 'Broken links harm user experience and SEO. These links return errors or are unreachable.',
      approved: false
    });
  }

  // Structure proposals from Claude's analysis
  if (structureAnalysis.needsRestructuring) {
    for (let i = 0; i < structureAnalysis.suggestions.length; i++) {
      const suggestion = structureAnalysis.suggestions[i];
      proposals.push({
        id: `proposal-structure-${i}`,
        type: 'structure',
        action: suggestion.action,
        title: `${suggestion.action.charAt(0).toUpperCase() + suggestion.action.slice(1)} Sections`,
        description: suggestion.newHeading || `${suggestion.action} sections ${suggestion.affectedSections.join(', ')}`,
        affectedSections: suggestion.affectedSections,
        newHeading: suggestion.newHeading,
        rationale: suggestion.rationale,
        approved: false
      });
    }
  }

  return proposals;
}

// Helper: Apply approved changes
async function applyChanges(originalContent, approvedProposals, originalSections) {
  const $ = cheerio.load(originalContent);
  
  // Apply link fixes
  const linkProposal = approvedProposals.find(p => p.type === 'link-fixes');
  if (linkProposal) {
    linkProposal.affectedLinks.forEach(link => {
      $(`a[href="${link.url}"]`).attr('href', '#').addClass('broken-link-removed');
    });
  }

  // Apply structure changes
  const structureProposals = approvedProposals.filter(p => p.type === 'structure');
  
  if (structureProposals.length > 0) {
    // Use Gemini to generate merged/rewritten content
    const prompt = `You are refreshing a blog post by applying approved structural changes.

Original sections:
${originalSections.map((s, i) => `
Section ${i}: ${s.heading}
${s.content.substring(0, 200)}...
`).join('\n')}

Approved changes:
${structureProposals.map(p => `
- ${p.action}: ${p.description}
  Rationale: ${p.rationale}
  Affected sections: ${p.affectedSections.join(', ')}
  ${p.newHeading ? `New heading: ${p.newHeading}` : ''}
`).join('\n')}

Generate the refreshed content with the approved structural changes applied. 
Maintain the original tone and key information, but improve clarity and organization.
Return only the HTML content for the refreshed sections.`;

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });
    
    return response.text;
  }

  return $.html();
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Ready to refresh blogs!`);
});