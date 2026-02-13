import axios from 'axios';
import * as cheerio from 'cheerio';
import { evaluateLinks } from '../helpers/linkChecker.js';
import { analyzeStructure, generateProposals, applyChanges } from '../helpers/aiAnalyzer.js';

// Fetch blog content from URL
export async function fetchBlog(req, res) {
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
      details: error
    });
  }
}

// Analyze blog content and generate proposals
export async function analyzeBlog(req, res) {
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

    // Step 2: Ask AI to analyze structure (only if we have sections)
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
      details: error
    });
  }
}

// Apply approved changes
export async function applyBlogChanges(req, res) {
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
      details: error
    });
  }
}
