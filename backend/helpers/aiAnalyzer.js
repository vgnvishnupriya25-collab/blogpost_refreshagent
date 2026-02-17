import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';

dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// Analyze structure with Gemini - CONSERVATIVE approach
export async function analyzeStructure(sections, title) {
  try {
    const prompt = `You are a careful editorial assistant analyzing a blog post titled "${title}" for structural improvements.

The blog currently has ${sections.length} main sections:
${sections.map((s, i) => `${i + 1}. ${s.heading}`).join('\n')}

STRICT RULES - READ CAREFULLY:
1. DO NOT suggest merging sections unless they are CLEARLY about the exact same topic with significant overlap
2. DO NOT reduce sections just to meet a number target - quality over quantity
3. The 6-section guideline is only relevant if there is GENUINE redundancy - it is NOT a hard rule
4. A blog with 8-10 well-structured distinct sections is BETTER than a forced merge into 6
5. ONLY flag needsRestructuring: true if there are OBVIOUS problems like duplicate headings, completely redundant content, or broken flow
6. When in doubt - always return needsRestructuring: false and leave sections as they are
7. NEVER merge sections that cover different subtopics even if they seem related
8. Prefer "keep" actions over "merge" actions

CONSERVATIVE SCORING:
- If the blog has fewer than 8 sections → almost certainly needsRestructuring: false
- If sections have clearly distinct headings → needsRestructuring: false
- Only suggest a merge if you are 80%+ confident it genuinely improves the post

Respond ONLY in this JSON format:
{
  "needsRestructuring": true/false,
  "currentSectionCount": number,
  "restructuringReason": "brief explanation of why restructuring is or is not needed",
  "suggestions": [
    {
      "action": "merge|rewrite|keep|remove",
      "affectedSections": [section indices starting from 0],
      "newHeading": "proposed heading only if merging",
      "rationale": "specific reason why THIS merge genuinely improves the post",
      "confidenceLevel": "high|medium|low"
    }
  ]
}

Only include suggestions with confidenceLevel "high" and "medium". Ignore low confidence ideas entirely.`;

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    const responseText = response.text;

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      // Extra safety layer: filter out low confidence and "keep" suggestions
      if (parsed.suggestions) {
        parsed.suggestions = parsed.suggestions.filter(s =>
          (s.confidenceLevel === 'high' || s.confidenceLevel === 'medium') && s.action !== 'keep'
        );
      }

      // Extra safety: if fewer than 8 sections, override to no restructuring
      // unless AI found very obvious duplicates
      if (sections.length <= 7 && parsed.suggestions.length === 0) {
        parsed.needsRestructuring = false;
      }

      // If no high, medium-confidence suggestions remain, mark as no restructuring needed
      if (!parsed.suggestions || parsed.suggestions.length === 0) {
        parsed.needsRestructuring = false;
      }

      return parsed;
    }

    return {
      needsRestructuring: false,
      currentSectionCount: sections.length,
      restructuringReason: 'No clear structural issues found',
      suggestions: []
    };
  } catch (error) {
    console.error('Error in analyzeStructure:', error);
    throw error;
  }
}

// Generate improvement proposals - with conservative filtering
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

    // Structure proposals - only if genuinely needed
    if (structureAnalysis.needsRestructuring && structureAnalysis.suggestions.length > 0) {

      // Additional safety check: don't suggest merging more than 40% of sections
      const totalAffectedSections = structureAnalysis.suggestions
        .filter(s => s.action === 'merge')
        .reduce((acc, s) => acc + (s.affectedSections?.length || 0), 0);

      const mergeRatio = totalAffectedSections / sections.length;

      // If we are merging more than 60% of sections, it is too aggressive - skip
      if (mergeRatio > 0.6) {
        console.log(`Skipping restructuring: too aggressive (${Math.round(mergeRatio * 100)}% of sections affected)`);
        return proposals;
      }

      for (let i = 0; i < structureAnalysis.suggestions.length; i++) {
        const suggestion = structureAnalysis.suggestions[i];

        // Skip any "keep" actions - no need to show those to user
        if (suggestion.action === 'keep') continue;

        // Only add merge suggestions that affect 2 sections (not bulk merges)
        if (suggestion.action === 'merge' && suggestion.affectedSections.length > 2) {
          console.log(`Skipping bulk merge of ${suggestion.affectedSections.length} sections - too aggressive`);
          continue;
        }

        proposals.push({
          id: `proposal-structure-${i}`,
          type: 'structure',
          action: suggestion.action,
          title: `${suggestion.action.charAt(0).toUpperCase() + suggestion.action.slice(1)} Sections`,
          description: suggestion.newHeading
            ? `Merge into: "${suggestion.newHeading}"`
            : `${suggestion.action} section(s): ${suggestion.affectedSections.map(i => `"${sections[i]?.heading || i}"`).join(', ')}`,
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
    throw error;
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
      const prompt = `You are refreshing a blog post by applying approved structural changes.

FULL ORIGINAL CONTENT:
${originalContent}

ORIGINAL SECTIONS BREAKDOWN:
${originalSections.map((s, i) => `Section ${i}: ${s.heading}`).join('\n')}

APPROVED CHANGES TO APPLY:
${structureProposals.map(p => `
- ${p.action}: ${p.description}
  Rationale: ${p.rationale}
  Affected sections: ${p.affectedSections.join(', ')}
  ${p.newHeading ? `New heading: ${p.newHeading}` : ''}
`).join('\n')}

STRICT INSTRUCTIONS:
1. Apply ONLY the approved structural changes listed above
2. Preserve ALL original information, examples, data, and details - do not remove anything
3. Keep the exact same writing style, tone, and voice as the original
4. Do NOT introduce new content or opinions
5. Do NOT merge any sections that are not explicitly listed in approved changes
6. Return ONLY clean HTML content
7. Do NOT wrap output in markdown code blocks or backticks
8. Do NOT add any commentary or explanation outside the HTML

Generate the refreshed content now:`;

      console.log('Applying changes with full original content...');

      const response = await genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      let refreshedContent = response.text;

      // Strip markdown code blocks if present
      refreshedContent = refreshedContent
        .replace(/^```html\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();

      return refreshedContent;
    }

    // If no structure changes, return content with only link fixes applied
    return $.html();
  } catch (error) {
    console.error('Error in applyChanges:', error);
    throw error;
  }
}