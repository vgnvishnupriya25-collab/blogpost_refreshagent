import axios from 'axios';

// Evaluate links with special handling for PDFs and Google Drive
export async function evaluateLinks(links) {
  const evaluations = [];

  // Check up to 20 links to avoid timeout
  const linksToCheck = links.slice(0, 20);

  for (const link of linksToCheck) {
    const result = await checkLink(link);
    evaluations.push(result);
  }

  return evaluations;
}

async function checkLink(link) {
  // Special handling for known file types and services
  if (isSpecialUrl(link.url)) {
    return await checkSpecialUrl(link);
  }

  // Standard link checking for regular URLs
  return await checkStandardUrl(link);
}

// Check if URL needs special handling
function isSpecialUrl(url) {
  const specialPatterns = [
    /\.pdf$/i,                                    // PDF files
    /drive\.google\.com/i,                        // Google Drive
    /docs\.google\.com/i,                         // Google Docs/Sheets/Slides
    /dropbox\.com.*\.(pdf|doc|docx|ppt|pptx)/i,  // Dropbox files
    /onedrive\.live\.com/i,                       // OneDrive
    /sharepoint\.com/i,                           // SharePoint
    /\.amazonaws\.com.*\.(pdf|doc|docx)/i,        // AWS S3 files
    /github\.com.*\.(pdf|md|txt)/i,               // GitHub files
  ];
  
  return specialPatterns.some(pattern => pattern.test(url));
}

// Special handling for PDFs, Google Drive, etc.
async function checkSpecialUrl(link) {
  try {
    // For Google Drive, convert to direct access format if needed
    let checkUrl = link.url;
    if (link.url.includes('drive.google.com')) {
      checkUrl = convertGoogleDriveUrl(link.url);
    }

    const response = await axios.head(checkUrl, {
      timeout: 15000,
      maxRedirects: 10, // Google services often redirect multiple times
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });

    const status = response.status;

    // For Google services, 200-399 is good
    // Also accept 403 for private Google Drive files (they exist but are private)
    if ((status >= 200 && status < 400) || (isGoogleService(link.url) && status === 403)) {
      return {
        ...link,
        status: status === 403 ? 200 : status, // Normalize private Google files to 200
        working: true,
        issue: status === 403 ? 'Private file (access restricted)' : null,
        method: 'HEAD-SPECIAL'
      };
    }

    // If HEAD failed, try GET for PDFs and documents
    if (status === 405 || status === 403) {
      return await fallbackToGetSpecial(link, checkUrl);
    }

    return {
      ...link,
      status,
      working: false,
      issue: getIssueMessage(status),
      method: 'HEAD-SPECIAL'
    };

  } catch (error) {
    // Network errors - try GET fallback
    if (isNetworkError(error)) {
      return await fallbackToGetSpecial(link, link.url);
    }

    return {
      ...link,
      status: 0,
      working: false,
      issue: getErrorMessage(error),
      method: 'HEAD-SPECIAL'
    };
  }
}

// Convert Google Drive sharing URLs to direct access URLs
function convertGoogleDriveUrl(url) {
  // Convert sharing URLs to direct access
  if (url.includes('/file/d/')) {
    const fileId = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
    if (fileId) {
      return `https://drive.google.com/file/d/${fileId[1]}/view`;
    }
  }
  return url;
}

// Check if URL is a Google service
function isGoogleService(url) {
  return /google\.com/i.test(url);
}

// Fallback GET request for special URLs
async function fallbackToGetSpecial(link, checkUrl) {
  try {
    const response = await axios.get(checkUrl, {
      timeout: 20000,
      maxRedirects: 10,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Range': 'bytes=0-1023', // First 1KB only
      },
      responseType: 'stream',
    });

    // Destroy stream immediately
    response.data.destroy();

    const status = response.status;

    // Accept more status codes for special files
    if ((status >= 200 && status < 400) || 
        (isGoogleService(link.url) && (status === 403 || status === 401)) ||
        status === 416) { // Range not satisfiable but file exists
      
      return {
        ...link,
        status: (status === 403 || status === 401 || status === 416) ? 200 : status,
        working: true,
        issue: (status === 403 || status === 401) ? 'Private file (access restricted)' : null,
        method: 'GET-SPECIAL'
      };
    }

    return {
      ...link,
      status,
      working: false,
      issue: getIssueMessage(status),
      method: 'GET-SPECIAL'
    };

  } catch (error) {
    return {
      ...link,
      status: 0,
      working: false,
      issue: getErrorMessage(error),
      method: 'GET-SPECIAL'
    };
  }
}

// Standard URL checking (original logic)
async function checkStandardUrl(link) {
  try {
    const response = await axios.head(link.url, {
      timeout: 20000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });

    const status = response.status;

    if (status >= 200 && status < 400) {
      return {
        ...link,
        status,
        working: true,
        issue: null,
        method: 'HEAD'
      };
    }

    if (status === 405 || status === 403 || status === 401) {
      return await fallbackToGet(link);
    }

    return {
      ...link,
      status,
      working: false,
      issue: getIssueMessage(status),
      method: 'HEAD'
    };

  } catch (headError) {
    if (isNetworkError(headError)) {
      return await fallbackToGet(link);
    }

    return {
      ...link,
      status: 0,
      working: false,
      issue: getErrorMessage(headError),
      method: 'HEAD'
    };
  }
}

// Standard GET fallback (original logic)
async function fallbackToGet(link) {
  try {
    const response = await axios.get(link.url, {
      timeout: 25000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Range': 'bytes=0-0',
      },
      responseType: 'stream',
    });

    response.data.destroy();

    const status = response.status;

    if (status >= 200 && status < 400 || status === 416) {
      return {
        ...link,
        status: status === 416 ? 200 : status,
        working: true,
        issue: null,
        method: 'GET'
      };
    }

    return {
      ...link,
      status,
      working: false,
      issue: getIssueMessage(status),
      method: 'GET'
    };

  } catch (getError) {
    return {
      ...link,
      status: 0,
      working: false,
      issue: getErrorMessage(getError),
      method: 'GET'
    };
  }
}

// Check if error is a network/connectivity issue (worth retrying with GET)
function isNetworkError(error) {
  const retryCodes = [
    'ECONNREFUSED',   // server refused connection
    'ECONNRESET',     // connection reset
    'ETIMEDOUT',      // timed out
    'ECONNABORTED',   // connection aborted
  ];
  return retryCodes.includes(error.code);
}

// Human-readable issue messages for HTTP status codes
function getIssueMessage(status) {
  const messages = {
    400: 'Bad request',
    401: 'Authentication required',
    403: 'Access forbidden',
    404: 'Page not found',
    408: 'Request timeout',
    410: 'Page permanently removed',
    429: 'Too many requests (rate limited)',
    500: 'Server error',
    502: 'Bad gateway',
    503: 'Service unavailable',
    504: 'Gateway timeout',
  };
  return messages[status] || `HTTP error (status ${status})`;
}

// Human-readable error messages for network/axios errors
function getErrorMessage(error) {
  const errorMessages = {
    'ENOTFOUND':      'Domain not found - URL may be invalid or site is down',
    'ECONNREFUSED':   'Connection refused by server',
    'ECONNRESET':     'Connection was reset',
    'ETIMEDOUT':      'Request timed out',
    'ECONNABORTED':   'Connection was aborted',
    'ERR_TLS_CERT':   'SSL certificate error',
    'DEPTH_ZERO_SELF_SIGNED_CERT': 'Self-signed SSL certificate',
    'CERT_HAS_EXPIRED': 'SSL certificate has expired',
  };
  return errorMessages[error.code] || `Connection failed (${error.code || error.message})`;
}