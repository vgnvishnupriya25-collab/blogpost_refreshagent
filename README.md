# Blog Refresh System

An AI-powered tool to analyze and improve blog posts with human oversight. Uses Google Gemini API to suggest structural improvements and fix broken links while maintaining the original content's integrity.

## Features

- 🔍 **Blog Analysis**: Fetches and analyzes blog posts from URLs or direct HTML input
- 🔗 **Link Validation**: Checks up to 20 links for broken/inaccessible URLs
- 📐 **Structure Analysis**: AI-powered suggestions to improve blog organization (max 6 sections)
- ✅ **Human Approval**: Review and approve/reject each proposed change
- 📋 **Preview Mode**: See what changes will be applied before generation
- 🔄 **Undo/Redo**: Try different proposal combinations without re-analyzing
- 👁️ **Diff Visualization**: Side-by-side or line-by-line comparison of changes
- 📥 **Multiple Export Formats**: Download as HTML or Markdown
- 🎨 **Toast Notifications**: Clean, non-intrusive feedback

## Quick Start

### Prerequisites

- Node.js v18+ (required for Google GenAI SDK)
- Google AI Studio API Key ([Get one here](https://aistudio.google.com/))

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd blog-refresh-system
   ```

2. **Setup Backend**
   ```bash
   cd backend
   npm install
   ```

3. **Configure API Key**
   
   Create `backend/.env` file:
   ```env
   GOOGLE_API_KEY=your_google_api_key_here
   PORT=3001
   ```

4. **Setup Frontend**
   ```bash
   cd ../frontend
   npm install
   ```

### Running the Application

1. **Start Backend** (in `backend/` directory)
   ```bash
   npm start
   ```
   Server runs on `http://localhost:3001`

2. **Start Frontend** (in `frontend/` directory, new terminal)
   ```bash
   npm run dev
   ```
   App runs on `http://localhost:3000`

3. **Open Browser**
   
   Navigate to `http://localhost:3000`

## Usage

1. **Input**: Enter a blog URL or paste HTML content
2. **Analysis**: System analyzes structure and checks links (API Call #1)
3. **Review**: Approve/reject proposed improvements with preview
4. **Apply**: Generate refreshed content (API Call #2)
5. **Export**: Download as HTML or Markdown, or try different changes

## Project Structure

```
blog-refresh-system/
├── backend/
│   ├── controllers/
│   │   └── blogController.js      # Request handlers
│   ├── helpers/
│   │   ├── aiAnalyzer.js          # Gemini API integration
│   │   └── linkChecker.js         # Link validation
│   ├── routes/
│   │   └── blogRoutes.js          # API routes
│   ├── server.js                  # Express server
│   ├── package.json
│   └── .env                       # API keys (not in git)
├── frontend/
│   ├── src/
│   │   ├── app.jsx                # Main React component
│   │   ├── app.css                # Styles
│   │   └── main.jsx               # Entry point
│   ├── package.json
│   └── .env                       # Frontend config (optional)
├── FREEZE_POINTS.md               # Development checkpoints
└── README.md
```

## API Endpoints

### `POST /api/fetch-blog`
Fetches blog content from URL
- **Body**: `{ url: string }`
- **Response**: `{ title, content, url }`

### `POST /api/analyze-blog`
Analyzes blog structure and links
- **Body**: `{ content: string, title: string }`
- **Response**: `{ sections, linkEvaluations, structureAnalysis, proposals }`

### `POST /api/apply-changes`
Applies approved changes to content
- **Body**: `{ content: string, approvedProposals: array, originalSections: array }`
- **Response**: `{ refreshedContent: string }`

## Important Assumptions & Caveats

### API Usage
- **Only 2 Gemini API calls per workflow**: Analysis + Apply Changes
- **Free tier limits**: Google AI Studio has rate limits. Heavy usage may require paid tier.
- **Model dependency**: Hardcoded to `gemini-2.5-flash`. If Google deprecates this model, code needs updating.

### Content Extraction
- **Generic CSS selectors**: Uses common selectors (`article`, `main`, `.post-content`). May fail on blogs with custom structures.
- **H2-based sections**: Assumes blog uses `<h2>` tags for main sections. Other heading structures may not be detected.
- **Link checking limit**: Only checks first 20 links to avoid timeouts (5s timeout per link = max 100s).

### AI Behavior
- **Non-deterministic**: AI responses may vary between runs for the same input.
- **JSON parsing**: AI responses are parsed with regex to extract JSON. Malformed responses may cause errors.
- **Content preservation**: AI is instructed to preserve all original information, but may occasionally paraphrase or restructure unexpectedly.
- **Token limits**: Very large blogs may exceed Gemini's context window (exact limit unknown for gemini-2.5-flash).

### Frontend Limitations
- **Clipboard API**: Requires HTTPS in production. Copy buttons will fail on HTTP.
- **Diff accuracy**: Uses line-level diff on HTML stripped of tags. May not represent semantic changes accurately.
- **Markdown conversion**: `turndown` library may not handle all HTML edge cases (complex tables, custom elements).
- **No sanitization**: Uses `dangerouslySetInnerHTML` without XSS protection. Only use with trusted content.

### Browser Compatibility
- **Modern browsers only**: Requires ES6+ support, Clipboard API, and modern CSS features.
- **No IE support**: Uses features not available in Internet Explorer.

### Performance
- **Sequential link checking**: Links are checked one-by-one, not in parallel. Can be slow for many links.
- **No caching**: Every analysis hits the API, even for the same URL.
- **Memory usage**: Keeps full analysis in state for undo functionality. Large blogs increase memory footprint.

### Security
- **No authentication**: API endpoints are public. Anyone with the URL can use the service.
- **No rate limiting**: Backend has no rate limiting. Could be abused.
- **API key exposure**: `.env` file must be kept secure. Never commit to git.

## Testing Recommendations

### Good Test Cases
1. **Simple blog**: 3-5 sections, few links (fast, reliable)
2. **Complex structure**: 10+ sections to test restructuring
3. **Broken links**: Blog with outdated external links
4. **Direct HTML**: Test HTML input mode with custom content

### Known Issues
- Very long blogs (>10,000 words) may timeout or exceed token limits
- Blogs without `<h2>` tags won't have sections detected
- Some websites block scraping (403/401 errors)

## Development Notes

See `FREEZE_POINTS.md` for detailed development checkpoints, known risks, and postponed decisions.

## Testing

Comprehensive test suites are available for both backend and frontend.

### Running Tests

**Backend Tests:**
```bash
cd backend
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
```

**Frontend Tests:**
```bash
cd frontend
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
```

## Tech Stack

**Backend:**
- Node.js + Express
- Google GenAI SDK (`@google/genai`)
- Cheerio (HTML parsing)
- Axios (HTTP requests)
- Jest (testing)

**Frontend:**
- React + Vite
- diff (text comparison)
- turndown (HTML to Markdown)
- html-react-parser (safe HTML rendering)
- Vitest + React Testing Library (testing)
