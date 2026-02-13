import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';

dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// Analyze structure with Gemini
export async function analyzeStructure(sections, title) {
  try {
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

    // console.log('The prompt is analyzeStructure:', prompt)
    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });
    
    // console.log('The response is analyzeStructure:', response)

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
  } catch (error) {
    console.error('Error in analyzeStructure:', error);
    throw error;
  }
}

// Generate improvement proposals
export function generateProposals(sections, linkEvals, structureAnalysis) {
  try {
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

    // Structure proposals from analysis
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
  } catch (error) {
    console.error('Error in generateProposals:', error);
    throw error
  }
}

// Apply approved changes
export async function applyChanges(originalContent, approvedProposals, originalSections) {
  try {
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
      // Use Gemini to generate merged/rewritten content with FULL original content
      const prompt = `You are refreshing a blog post by applying approved structural changes.

FULL ORIGINAL CONTENT:
${originalContent}

ORIGINAL SECTIONS BREAKDOWN:
${originalSections.map((s, i) => `
Section ${i}: ${s.heading}
`).join('\n')}

APPROVED CHANGES TO APPLY:
${structureProposals.map(p => `
- ${p.action}: ${p.description}
  Rationale: ${p.rationale}
  Affected sections: ${p.affectedSections.join(', ')}
  ${p.newHeading ? `New heading: ${p.newHeading}` : ''}
`).join('\n')}

INSTRUCTIONS:
1. Apply the approved structural changes to the original content
2. Maintain ALL the original information, examples, and details
3. Keep the same writing style and tone
4. Only reorganize the structure as specified in the approved changes
5. Return the complete refreshed HTML content

Generate the refreshed content now:`;

      console.log('Applying changes with full original content...');
      
      const response = await genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
      
      return response.text;
    }

    // If no structure changes, just return content with link fixes applied
    return $.html();
  } catch (error) {
    console.error('Error in applyChanges:', error);
    throw error;
  }
}
