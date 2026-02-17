import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fetchBlog, analyzeBlog, applyBlogChanges } from '../controllers/blogController.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Blog Refresh API is running' });
});

// API routes
app.post('/api/fetch-blog', fetchBlog);
app.post('/api/analyze-blog', analyzeBlog);
app.post('/api/apply-changes', applyBlogChanges);


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Ready to refresh blogs!`);
});
