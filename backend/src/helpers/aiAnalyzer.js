import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';

dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// Analyze structure with Gemini
export async function analyzeStructure(sections, title) {
  try {
    const prompt = `You are an expert content strategist analyzing a blog post titled "${title}".

Current structure has ${sections.length} sections:
${sections.map((s, i) => `${i}. ${s.heading}`).join('\n')}

ANALYSIS GUIDELINES:
- Look for sections that cover overlapping topics and could be merged for better flow
- Identify sections that are too granular and would benefit from consolidation
- Suggest improvements that genuinely enhance readability and user experience
- Be thoughtful but not overly conservative - good structure matters
- Aim for 4-7 well-organized sections as a general guideline (not a hard rule)

WHEN TO SUGGEST CHANGES:
Two sections cover the same topic from different angles → merge them
Very short sections that could be combined with related content
Sections with overlapping themes that break up the narrative flow
Redundant introductory or concluding sections

WHEN NOT TO SUGGEST CHANGES:
Sections cover distinct topics even if related
Each section serves a unique purpose for the reader
Current structure already flows logically

Respond in this exact JSON format:
{
  "needsRestructuring": true/false,
  "currentSectionCount": ${sections.length},
  "restructuringReason": "brief explanation",
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
Be specific and actionable. Only suggest changes you're confident will improve the post.`;

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    const responseText = response.text;
    console.log('AI Structure Analysis Response:', responseText);

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      // Filter to only high and medium confidence suggestions
      if (parsed.suggestions) {
        parsed.suggestions = parsed.suggestions.filter(s =>
          (s.confidenceLevel === 'high' || s.confidenceLevel === 'medium')
        );
      }

      // If no suggestions remain after filtering, mark as no restructuring needed
      if (!parsed.suggestions || parsed.suggestions.length === 0) {
        parsed.needsRestructuring = false;
        parsed.restructuringReason = parsed.restructuringReason || 'No high-confidence improvements identified';
      }

      console.log('Parsed structure analysis:', JSON.stringify(parsed, null, 2));
      return parsed;
    }

    return {
      needsRestructuring: false,
      currentSectionCount: sections.length,
      restructuringReason: 'Unable to parse AI response',
      suggestions: []
    };
  } catch (error) {
    console.error('Error in analyzeStructure:', error);
    throw error;
  }
}

// Generate improvement proposals - with confidence filtering and aggressive change detection
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

    // Structure proposals with safety checks
    if (structureAnalysis.needsRestructuring && structureAnalysis.suggestions.length > 0) {
      console.log(`Processing ${structureAnalysis.suggestions.length} structure suggestions`);

      // Filter to only high and medium confidence suggestions
      const highMediumSuggestions = structureAnalysis.suggestions.filter(s => 
        s.confidenceLevel === 'high' || s.confidenceLevel === 'medium'
      );

      console.log(`Filtered to ${highMediumSuggestions.length} high/medium confidence suggestions`);

      if (highMediumSuggestions.length === 0) {
        console.log('No high/medium confidence suggestions found');
        return proposals;
      }

      // Calculate merge ratio to detect aggressive changes
      const totalAffectedSections = highMediumSuggestions
        .filter(s => s.action === 'merge')
        .reduce((acc, s) => acc + (s.affectedSections?.length || 0), 0);

      // const mergeRatio = totalAffectedSections / sections.length;

      // // If merging more than 60% of sections, it's too aggressive - skip all structure changes
      // if (mergeRatio > 0.3) {
      //   console.log(`Skipping all structure changes: too aggressive (${Math.round(mergeRatio * 100)}% of sections would be merged)`);
      //   return proposals;
      // }

      // Process each suggestion
      for (let i = 0; i < highMediumSuggestions.length; i++) {
        const suggestion = highMediumSuggestions[i];

        // Validate suggestion has required fields
        if (!suggestion.affectedSections || suggestion.affectedSections.length === 0) {
          console.log('Skipping suggestion with no affected sections');
          continue;
        }

        // Skip bulk merges (more than 3 sections at once)
        if (suggestion.action === 'merge' && suggestion.affectedSections.length > 3) {
          console.log(`Skipping bulk merge of ${suggestion.affectedSections.length} sections - too aggressive`);
          continue;
        }

        // Create user-friendly description
        const sectionNames = suggestion.affectedSections
          .map(idx => sections[idx]?.heading || `Section ${idx}`)
          .join(' + ');

        proposals.push({
          id: `proposal-structure-${i}`,
          type: 'structure',
          action: suggestion.action,
          title: suggestion.newHeading || `${suggestion.action.charAt(0).toUpperCase() + suggestion.action.slice(1)} Sections`,
          description: suggestion.newHeading
            ? `Merge "${sectionNames}" into: "${suggestion.newHeading}"`
            : `${suggestion.action} sections: ${sectionNames}`,
          affectedSections: suggestion.affectedSections,
          newHeading: suggestion.newHeading,
          rationale: suggestion.rationale,
          confidenceLevel: suggestion.confidenceLevel, // Include confidence level for transparency
          approved: false
        });
      }

      console.log(`Generated ${proposals.filter(p => p.type === 'structure').length} structure proposals after filtering`);
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