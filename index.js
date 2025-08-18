const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3008;
const PUBLIC_DIR = path.join(__dirname, 'public');
const { fetchTrainsData } = require('./pkp');

// MIME types for different file extensions
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Parse the URL and remove query parameters
  let filePath = req.url.split('?')[0];

  // API endpoint for train data
  if (filePath === '/api/trains') {
    try {
      const dataPath = path.join(__dirname, 'data.json');
      const rawData = fs.readFileSync(dataPath, 'utf8');
      const allData = JSON.parse(rawData);

      // Filter data from last 24 hours
      const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
      const recentData = allData.filter(entry => entry.timeStamp >= twentyFourHoursAgo);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(recentData));
      return;
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load train data' }));
      return;
    }
  }

  // Default to index.html for root path
  if (filePath === '/') {
    filePath = '/index.html';
  }

  // Construct the full file path
  const fullPath = path.join(PUBLIC_DIR, filePath);

  // Get file extension for MIME type
  const ext = path.extname(fullPath).toLowerCase();
  const contentType = mimeTypes[ext] || 'text/plain';

  // Check if file exists and serve it
  fs.readFile(fullPath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // File not found
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1><p>The requested file was not found.</p>');
      } else {
        // Server error
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<h1>500 Server Error</h1><p>Internal server error occurred.</p>');
      }
      return;
    }

    // Set appropriate headers and send file
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Serving static files from: ${PUBLIC_DIR}`);
});

const fifteenMinutesMs = 1000 * 60 * 15;

setInterval(() => {
  fetchTrainsData().then(processedTrainsCount => {
    console.log('Processed trains count:', processedTrainsCount)
  }).catch(error => {
    console.error('Error fetching trains data:', error)
  });
}, fifteenMinutesMs);

fetchTrainsData().then(processedTrainsCount => {
  console.log('Processed trains count:', processedTrainsCount)
}).catch(error => {
  console.error('Error fetching trains data:', error)
});