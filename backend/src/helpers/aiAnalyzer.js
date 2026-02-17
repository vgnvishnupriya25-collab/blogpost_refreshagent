import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';

dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// Analyze structure with Gemini - balanced approach
export async function analyzeStructure(sections, title) {
  try {
    const sectionList = sections.map((s, i) => `${i}. "${s.heading}"`).join('\n');

    const prompt = `You are an editorial assistant reviewing a blog post titled "${title}".

The blog has ${sections.length} sections:
${sectionList}

Your job is to identify ONLY genuine structural problems. Use these clear criteria:

SUGGEST A MERGE when:
- Two sections have almost identical headings
- Two sections clearly discuss the same concept
- One section is obviously an extension of another

DO NOT SUGGEST A MERGE when:
- Sections are related but cover different aspects
- You are unsure whether they overlap - only suggest if it is obvious from the headings alone
- Sections are already well-named and distinct

IMPORTANT RULES:
- Suggest "rewrite", "remove", "keep" and "merge"
- Only suggest merges you are highly confident about
- Each merge should combine exactly 2 sections (not 3 or more)
- If there are no obvious merges, return needsRestructuring: false with empty suggestions array
- Do not try to force the blog into a certain number of sections

Return ONLY this JSON with no extra text:
{
  "needsRestructuring": true or false,
  "currentSectionCount": ${sections.length},
  "restructuringReason": "one sentence explaining your decision",
  "suggestions": [
    {
      "action": "merge|rewrite|keep|remove",
      "affectedSections": [indexA, indexB],
      "newHeading": "proposed heading only if merging",
      "rationale": "one sentence: why these two specifically overlap"
    }
  ]
}`;

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    const responseText = response.text;
    console.log('Raw AI response:', responseText);

    // Extract JSON - handle cases where AI wraps in code blocks
    const cleaned = responseText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('No JSON found in response, returning safe default');
      return buildDefault(sections.length);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // --- Safety validations ---

    // 1. Ensure suggestions array exists
    if (!Array.isArray(parsed.suggestions)) {
      parsed.suggestions = [];
    }

    // 2. Remove any merge that does not have exactly 2 sections
    parsed.suggestions = parsed.suggestions.filter(s => {
      const valid = Array.isArray(s.affectedSections) && s.affectedSections.length === 2;
      if (!valid) console.log('Removed invalid suggestion (not exactly 2 sections):', s);
      return valid;
    });

    // 3. Remove any suggestion where section indices are out of bounds
    parsed.suggestions = parsed.suggestions.filter(s => {
      const inBounds = s.affectedSections.every(i => i >= 0 && i < sections.length);
      if (!inBounds) console.log('Removed out-of-bounds suggestion:', s);
      return inBounds;
    });

    // 4. Remove duplicate suggestions (same pair of sections)
    const seen = new Set();
    parsed.suggestions = parsed.suggestions.filter(s => {
      const key = [...s.affectedSections].sort().join('-');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 5. Sync needsRestructuring with actual suggestions
    parsed.needsRestructuring = parsed.suggestions.length > 0;

    console.log('Final structure analysis:', JSON.stringify(parsed, null, 2));
    return parsed;

  } catch (error) {
    console.error('Error in analyzeStructure:', error);
    return buildDefault(sections.length);
  }
}

function buildDefault(sectionCount) {
  return {
    needsRestructuring: false,
    currentSectionCount: sectionCount,
    restructuringReason: 'No structural issues detected',
    suggestions: []
  };
}

// Generate improvement proposals
export function generateProposals(sections, linkEvals, structureAnalysis) {
  try {
    const proposals = [];

    // --- Link proposals ---
    const brokenLinks = linkEvals.filter(l => !l.working);
    if (brokenLinks.length > 0) {
      proposals.push({
        id: 'proposal-links',
        type: 'link-fixes',
        title: 'Fix Broken Links',
        description: `Found ${brokenLinks.length} broken or inaccessible link${brokenLinks.length > 1 ? 's' : ''} that should be updated or removed.`,
        affectedLinks: brokenLinks,
        rationale: 'Broken links harm user experience and SEO. These links return errors or are unreachable.',
        approved: false
      });
    }

    // --- Structure proposals ---
    if (structureAnalysis.needsRestructuring && structureAnalysis.suggestions.length > 0) {
      for (let i = 0; i < structureAnalysis.suggestions.length; i++) {
        const suggestion = structureAnalysis.suggestions[i];

        // Build readable section names for the UI
        const sectionA = sections[suggestion.affectedSections[0]]?.heading || `Section ${suggestion.affectedSections[0]}`;
        const sectionB = sections[suggestion.affectedSections[1]]?.heading || `Section ${suggestion.affectedSections[1]}`;

        proposals.push({
          id: `proposal-structure-${i}`,
          type: 'structure',
          action: suggestion.action,
          title: suggestion.newHeading || `Merge: ${sectionA} + ${sectionB}`,
          description: `Merge "${sectionA}" and "${sectionB}" into a single section: "${suggestion.newHeading}"`,
          affectedSections: suggestion.affectedSections,
          newHeading: suggestion.newHeading,
          rationale: suggestion.rationale,
          approved: false
        });
      }
    }

    console.log(`Generated ${proposals.length} total proposals (${proposals.filter(p => p.type === 'link-fixes').length} link, ${proposals.filter(p => p.type === 'structure').length} structure)`);
    return proposals;

  } catch (error) {
    console.error('Error in generateProposals:', error);
    throw error;
  }
}

// Apply approved changes
export async function applyChanges(originalContent, approvedProposals, originalSections) {
  try {
    const $ = cheerio.load(originalContent);

    // --- Apply link fixes ---
    const linkProposal = approvedProposals.find(p => p.type === 'link-fixes');
    if (linkProposal && linkProposal.affectedLinks) {
      linkProposal.affectedLinks.forEach(link => {
        $(`a[href="${link.url}"]`).attr('href', '#').addClass('broken-link-removed');
      });
      console.log(`Removed ${linkProposal.affectedLinks.length} broken links`);
    }

    // --- Apply structure changes ---
    const structureProposals = approvedProposals.filter(p => p.type === 'structure');

    if (structureProposals.length > 0) {
      const prompt = `You are refreshing a blog post by applying approved structural changes.

FULL ORIGINAL CONTENT:
${originalContent}

ORIGINAL SECTIONS:
${originalSections.map((s, i) => `Section ${i}: "${s.heading}"`).join('\n')}

APPROVED MERGES TO APPLY:
${structureProposals.map((p, i) => `
Merge ${i + 1}:
  - Combine section ${p.affectedSections[0]} ("${originalSections[p.affectedSections[0]]?.heading}") 
    with section ${p.affectedSections[1]} ("${originalSections[p.affectedSections[1]]?.heading}")
  - New heading: "${p.newHeading}"
  - Why: ${p.rationale}
`).join('\n')}

RULES:
1. Apply ONLY the merges listed above - do not change anything else
2. Keep ALL original text, examples, and details - do not remove or summarise content
3. Preserve the original tone and writing style exactly
4. For each approved merge: combine the two sections under the new heading
5. All other sections stay exactly as they are
6. Return ONLY clean HTML - no markdown, no code blocks, no explanation text

Output the full refreshed HTML content now:`;

      const response = await genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      let refreshedContent = response.text;

      // Strip any markdown wrapping the AI might add
      refreshedContent = refreshedContent
        .replace(/^```html\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      return refreshedContent;
    }

    // No structure changes - return with link fixes only
    return $.html();

  } catch (error) {
    console.error('Error in applyChanges:', error);
    throw error;
  }
}