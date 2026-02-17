# Freeze Points - Blog Refresh System

## Freeze Point 1: Initial Setup & API Migration
**Date & Time:** First Commit 12-02-2026 11:40AM IST

### What feels unclear or risky:
- **API Key Management**: Currently storing Google API key in `.env` file. No validation if key is valid or has sufficient quota before making requests.
- **Error Response Handling**: AI responses are parsed with regex to extract JSON. If Gemini returns malformed JSON or wraps it differently, parsing will fail silently.
- **Link Checking Performance**: Checking 20 links sequentially with 5s timeout each could take up to 100 seconds. No progress feedback to frontend during this time.
- **Content Extraction Logic**: Using generic CSS selectors (`article`, `main`, `.post-content`) to extract blog content. May fail on blogs with custom structures.

### Decisions postponed:
- **Rate Limiting**: Not implementing any rate limiting on API endpoints. Could be abused or overwhelm the Gemini API.
- **Caching**: No caching of analyzed blogs or AI responses. Every analysis hits the API even for the same URL.
- **Authentication**: No auth layer. Anyone with the API URL can use the service.
- **Input Validation**: Minimal validation on URLs and content size. Large blogs could cause memory issues.

---

## Freeze Point 2: Code Refactoring & Error Handling
**Date & Time:** Second Commit 13-02-2026 11:55AM IST

### What feels unclear or risky:
- **Partial Error Recovery**: Added try-catch blocks but some functions return empty/default values on error. Frontend might not know something failed.
- **AI Model Dependency**: Hardcoded to `gemini-2.5-flash`. If Google deprecates or changes this model, app breaks.
- **HTML Manipulation Safety**: Directly modifying HTML with cheerio and AI-generated content. No sanitization against XSS or malformed HTML.

### Decisions postponed:
- **Proposal Approval Flow**: Currently just receives approved proposals. No validation if proposals are valid or if sections still exist.
- **Content Size Limits**: No limits on blog content size. Very large blogs could exceed AI token limits or cause timeouts.

---

## Freeze Point 3: Content Preservation & Frontend Improvements
**Date & Time:** Third Commit 13-02-2026 12:53PM IST

### What was fixed:
- **Content Preservation Issue**: Fixed `applyChanges()` to send full original content instead of truncated summaries (200 chars). AI now has complete context to preserve all information.
- **Copy Feature**: Added clipboard copy buttons for both Original and Refreshed content sections for easy content extraction.

### What feels unclear or risky:
- **Token Limits**: Now sending full blog content to Gemini. Very long blogs might exceed model's context window (unknown exact limit for gemini-2.5-flash).

### Decisions postponed:
- **Token Usage Tracking**: Not tracking or displaying API token usage or costs to user.

---

## Freeze Point 4: Advanced Frontend Features (Client-Side)
**Date & Time:** Fourth Commit 13-02-2026 1:47PM IST

### What was implemented:
- **Diff Visualization**: Toggle between side-by-side and diff view modes. Diff view shows line-by-line changes with color coding (green=added, red=removed, gray=unchanged).
- **Undo/Redo**: "Try Different Changes" button returns to approval step with cached analysis. Users can modify proposal selections without new API calls.
- **Markdown Export**: Added "Download Markdown" button using `turndown` library for HTML Markdown conversion.
- **Preview Mode**: Shows preview card listing exactly what changes will be applied before generation. No API calls needed.
- **Toast Notifications**: Replaced browser alerts with styled toast notifications that auto-dismiss after 3 seconds.

### What feels unclear or risky:
- **Memory Usage**: Keeping full analysis results in state for undo functionality. Large blogs could increase memory footprint.
- **Diff Performance**: Calculating diff on every render when in diff view mode. Should memoize for large content.

### Decisions postponed:
- **Export Format Validation**: Not validating that exported Markdown/HTML is well-formed before download.
- **Preview Accuracy**: Preview shows what will be attempted, but can't guarantee AI will follow instructions exactly.

---

## Freeze Point 5: Documentation & Code cleanup
**Date & Time:** Fifth Commit 13-02-2026 1:45PM IST

### What was added:
- **Comprehensive README.md**: Complete setup instructions
- **Code cleanup**: Removed unnecessary console logs


---

## Freeze Point 6: Enhanced AI Prompt to suggest the corrections properly
**Date & Time:** Sixth Commit 17-02-2026 10:40AM IST

### What was implemented:
- **AI Prompt enhancement**: Changed the analyzeStructure() function AI prompt to only suggest the improvements when it's sensible. Also classified the changes into high, medium, low and now only considering high, medium level of changes. If the merge changes ratio is above 60% then considering that as an aggressive change and skipping it.
- **Broken link improvement**: Updated the timeout to have 30sec so that even if some of the links take some time to reach their server then it'll consider it instead of removing it.
- **UI improvement for Side by Side view**: Improved side by side view to Sync the scroll for Original Context and Refreshed context.
- **UI improvement for Diff view**: Removed the HTML tags from Diff view tab and added the actual content in it show the actual changes. 

---

## Freeze Point 7: Removed too much conservative prompt and fixed finding broken links logic
**Date & Time:** Seventh Commit 17-02-2026 12:26PM IST

### What was implemented:
- **AI Prompt enhancement**: Changed the analyzeStructure() function AI prompt to only suggest the improvements when it's sensible. Also classified the changes into high, medium, low and now only considering high, medium level of changes. 
- **Broken link improvement**: Updated the evaluateLinks() function to allow all possible links and increased the timeout by 20s because few of the links are taking so time to load, if we increase more than that then UI experience will not be better and also handled the error statuscodes in the linkChecker.js itself. Also added the code to handle all of the other possible link types like .pdf, .docs etc because its not returning success statuscodes in header so its coming under broken links.
- **UI improvements**: Enhanced app.css file to improve its stylings and colors.

### Decisions postponed:
- **Broken links for human detection**: Few of the links like Facebook, Instagram etc and all detecting the Human interaction after that only it's allowing to access the link but here we're using axios call to connect with it so it's not opening the link.