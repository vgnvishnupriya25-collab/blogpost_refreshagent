import axios from 'axios';

// Evaluate links
export async function evaluateLinks(links) {
  const evaluations = [];
  
  // Check up to 20 links to avoid timeout
  const linksToCheck = links.slice(0, 20);
  
  for (const link of linksToCheck) {
    try {
      // axios HEAD request, which is like a GET request but only returns the headers, no body content.
      const response = await axios.head(link.url, {
        timeout: 50000,
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
