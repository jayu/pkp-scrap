const http = require('http');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
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

// Minimum trains in a single reading for it to be considered reliable enough
// to represent a day's extreme (filters out partial/incomplete scrapes).
const MIN_RELIABLE_TRAINS = 100;

function loadAllData() {
  const dataPath = path.join(__dirname, 'data.json');
  const rawData = fs.readFileSync(dataPath, 'utf8');
  return JSON.parse(rawData);
}

function averageEntries(entries) {
  const n = entries.length;
  if (n === 0) {
    return { delay0: 0, delay1: 0, delay2: 0, trainsCount: 0, delayPercent: 0, sampleCount: 0 };
  }
  const sum = entries.reduce((acc, e) => ({
    delay0: acc.delay0 + e.delay0,
    delay1: acc.delay1 + e.delay1,
    delay2: acc.delay2 + e.delay2,
    trainsCount: acc.trainsCount + e.trainsCount,
    delayPercent: acc.delayPercent + e.delayPercent
  }), { delay0: 0, delay1: 0, delay2: 0, trainsCount: 0, delayPercent: 0 });
  return {
    delay0: Math.round(sum.delay0 / n),
    delay1: Math.round(sum.delay1 / n),
    delay2: Math.round(sum.delay2 / n),
    trainsCount: Math.round(sum.trainsCount / n),
    delayPercent: sum.delayPercent / n,
    sampleCount: n
  };
}

function aggregateBucket(timeStamp, entries) {
  return { timeStamp, ...averageEntries(entries) };
}

// Returns 42 entries: 7 days (Mon-first) x six 4-hour buckets per day.
function getWeekdayStats(allData) {
  const buckets = [];
  for (let day = 0; day < 7; day++) {
    for (let hourFrom = 0; hourFrom < 24; hourFrom += 4) {
      buckets.push({ dayOfWeek: day, hourFrom, hourTo: hourFrom + 4, entries: [] });
    }
  }
  for (const entry of allData) {
    const d = new Date(entry.timeStamp);
    const monFirstDay = (d.getDay() + 6) % 7;
    const hourBucket = Math.floor(d.getHours() / 4) * 4;
    const bucket = buckets.find(b => b.dayOfWeek === monFirstDay && b.hourFrom === hourBucket);
    if (bucket) bucket.entries.push(entry);
  }
  return buckets.map(b => ({
    dayOfWeek: b.dayOfWeek,
    hourFrom: b.hourFrom,
    hourTo: b.hourTo,
    ...averageEntries(b.entries)
  }));
}

// Returns 24 entries averaged by hour-of-day.
function getHourlyStats(allData) {
  const buckets = [];
  for (let hour = 0; hour < 24; hour++) buckets.push({ hour, entries: [] });
  for (const entry of allData) {
    const d = new Date(entry.timeStamp);
    buckets[d.getHours()].entries.push(entry);
  }
  return buckets.map(b => ({ hour: b.hour, ...averageEntries(b.entries) }));
}

function getYearlyStats(allData) {
  const now = new Date();
  const buckets = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ year: d.getFullYear(), month: d.getMonth(), timeStamp: d.getTime(), entries: [] });
  }
  for (const entry of allData) {
    const d = new Date(entry.timeStamp);
    const bucket = buckets.find(b => b.year === d.getFullYear() && b.month === d.getMonth());
    if (bucket) bucket.entries.push(entry);
  }
  return buckets.map(b => aggregateBucket(b.timeStamp, b.entries));
}

function getMonthlyExtremes(allData) {
  const now = new Date();
  const buckets = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ year: d.getFullYear(), month: d.getMonth(), monthStart: d.getTime(), entries: [] });
  }
  const filtered = allData.filter(e => e.trainsCount >= MIN_RELIABLE_TRAINS);
  for (const entry of filtered) {
    const d = new Date(entry.timeStamp);
    const bucket = buckets.find(b => b.year === d.getFullYear() && b.month === d.getMonth());
    if (bucket) bucket.entries.push(entry);
  }
  const emptyFor = (b) => ({ timeStamp: b.monthStart, delay0: 0, delay1: 0, delay2: 0, trainsCount: 0, delayPercent: 0 });
  const best = [];
  const worst = [];
  for (const b of buckets) {
    if (b.entries.length === 0) {
      best.push(emptyFor(b));
      worst.push(emptyFor(b));
      continue;
    }
    let bestEntry = b.entries[0];
    let worstEntry = b.entries[0];
    let minDelays = bestEntry.delay1 + bestEntry.delay2;
    let maxDelays = worstEntry.delay1 + worstEntry.delay2;
    for (const e of b.entries) {
      const sum = e.delay1 + e.delay2;
      if (sum < minDelays) { minDelays = sum; bestEntry = e; }
      if (sum > maxDelays) { maxDelays = sum; worstEntry = e; }
    }
    best.push(bestEntry);
    worst.push(worstEntry);
  }
  return { best, worst };
}

function getMonthlyDailyStats(allData, year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const buckets = [];
  for (let day = 1; day <= daysInMonth; day++) {
    buckets.push({ day, timeStamp: new Date(year, month, day).getTime(), entries: [] });
  }
  for (const entry of allData) {
    const d = new Date(entry.timeStamp);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const bucket = buckets.find(b => b.day === d.getDate());
      if (bucket) bucket.entries.push(entry);
    }
  }
  return buckets.map(b => aggregateBucket(b.timeStamp, b.entries));
}

// Like getMonthlyDailyStats, but instead of averaging a day's readings it picks
// the single worst reading — the one with the highest delay percentage — among
// readings with enough trains to be reliable (>= MIN_RELIABLE_TRAINS). This
// avoids tiny samples (e.g. 4 of 5 trains delayed = 80%) winning the day.
function getMonthlyDailyWorst(allData, year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const buckets = [];
  for (let day = 1; day <= daysInMonth; day++) {
    buckets.push({ day, timeStamp: new Date(year, month, day).getTime(), entries: [] });
  }
  for (const entry of allData) {
    const d = new Date(entry.timeStamp);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const bucket = buckets.find(b => b.day === d.getDate());
      if (bucket) bucket.entries.push(entry);
    }
  }
  return buckets.map(b => {
    const reliable = b.entries.filter(e => e.trainsCount >= MIN_RELIABLE_TRAINS);
    if (reliable.length === 0) {
      return { timeStamp: b.timeStamp, delay0: 0, delay1: 0, delay2: 0, trainsCount: 0, delayPercent: 0, sampleCount: 0 };
    }
    let worst = reliable[0];
    for (const e of reliable) {
      if (e.delayPercent > worst.delayPercent) worst = e;
    }
    return {
      timeStamp: worst.timeStamp,
      delay0: worst.delay0,
      delay1: worst.delay1,
      delay2: worst.delay2,
      trainsCount: worst.trainsCount,
      delayPercent: worst.delayPercent,
      sampleCount: reliable.length
    };
  });
}

// Monday 00:00 (local time) of the week containing `date`.
function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0=Sun..6=Sat
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

// One row per ISO-style week (Mon-Sun) across the whole dataset. Each row is the
// single worst reading of that week — the one with the highest delay percentage —
// among reliable readings (trainsCount >= MIN_RELIABLE_TRAINS). Major and minor
// delay percentages are reported separately alongside the combined total.
// Sorted oldest week first.
function getWeeklyWorst(allData) {
  const weeks = new Map();
  for (const entry of allData) {
    if (entry.trainsCount < MIN_RELIABLE_TRAINS) continue;
    const weekStart = startOfWeek(new Date(entry.timeStamp)).getTime();
    const current = weeks.get(weekStart);
    if (!current || entry.delayPercent > current.delayPercent) {
      weeks.set(weekStart, entry);
    }
  }
  return [...weeks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekStart, e]) => ({
      weekStart,
      timeStamp: e.timeStamp,
      trainsCount: e.trainsCount,
      delay0: e.delay0,
      delay1: e.delay1,
      delay2: e.delay2,
      delayPercent: (e.delay1 + e.delay2) / e.trainsCount * 100,
      majorPercent: e.delay2 / e.trainsCount * 100,
      minorPercent: e.delay1 / e.trainsCount * 100
    }));
}

function parseYearMonth(str) {
  const match = /^(\d{4})-(\d{2})$/.exec(str || '');
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  if (month < 0 || month > 11) return null;
  return { year, month };
}

const server = http.createServer((req, res) => {
  // Parse the URL — keep query for endpoints that need it
  const urlParts = req.url.split('?');
  let filePath = urlParts[0];
  const query = new URLSearchParams(urlParts[1] || '');

  // API endpoint for train data (last 24 hours)
  if (filePath === '/api/trains') {
    try {
      const allData = loadAllData();
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

  // API endpoint: monthly averages for the last 12 months
  if (filePath === '/api/trains/yearly') {
    try {
      const allData = loadAllData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getYearlyStats(allData)));
      return;
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load yearly stats' }));
      return;
    }
  }

  // API endpoint: averages by weekday + 4-hour band (whole dataset)
  if (filePath === '/api/trains/weekday') {
    try {
      const allData = loadAllData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getWeekdayStats(allData)));
      return;
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load weekday stats' }));
      return;
    }
  }

  // API endpoint: averages by hour-of-day (whole dataset)
  if (filePath === '/api/trains/hourly') {
    try {
      const allData = loadAllData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getHourlyStats(allData)));
      return;
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load hourly stats' }));
      return;
    }
  }

  // API endpoint: best + worst day per month for the last 12 months
  // (filters out incomplete data points with trainsCount < 100)
  if (filePath === '/api/trains/yearly/extremes') {
    try {
      const allData = loadAllData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getMonthlyExtremes(allData)));
      return;
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load monthly extremes' }));
      return;
    }
  }

  // API endpoint: daily averages for a given month (?month=YYYY-MM)
  if (filePath === '/api/trains/monthly') {
    try {
      const ym = parseYearMonth(query.get('month'));
      if (!ym) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing "month" query parameter (expected YYYY-MM)' }));
        return;
      }
      const allData = loadAllData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getMonthlyDailyStats(allData, ym.year, ym.month)));
      return;
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load monthly stats' }));
      return;
    }
  }

  // API endpoint: worst daily reading for a given month (?month=YYYY-MM)
  // Per day, the reading with the highest delay % among reliable readings
  // (trainsCount >= MIN_RELIABLE_TRAINS).
  if (filePath === '/api/trains/monthly/worst') {
    try {
      const ym = parseYearMonth(query.get('month'));
      if (!ym) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing "month" query parameter (expected YYYY-MM)' }));
        return;
      }
      const allData = loadAllData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getMonthlyDailyWorst(allData, ym.year, ym.month)));
      return;
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load monthly worst stats' }));
      return;
    }
  }

  // API endpoint: worst reading per week (Mon-Sun) across the whole dataset
  // (reliable readings only, trainsCount >= MIN_RELIABLE_TRAINS)
  if (filePath === '/api/trains/weekly/worst') {
    try {
      const allData = loadAllData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getWeeklyWorst(allData)));
      return;
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load weekly worst stats' }));
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
  logger.log(`Server running at http://localhost:${PORT}/`);
  logger.log(`Serving static files from: ${PUBLIC_DIR}`);
});

const fifteenMinutesMs = 1000 * 60 * 15;


async function fetchDataWithRetry() {
  const retries = 3;
  let trainsFetchedCount = null;

  for (let i = 0; i < retries; i++) {
    try {
      logger.log(`Fetching trains data (attempt ${i + 1} of ${retries})`);
      trainsFetchedCount = await fetchTrainsData();

    } catch (error) {
      logger.error(`Error fetching trains data: ${error}`);
    }

    if (trainsFetchedCount && trainsFetchedCount > 0) {
      return trainsFetchedCount;
    }

    await new Promise(resolve => setTimeout(resolve, 1000 * 20));
  }

  return trainsFetchedCount;
}

setInterval(() => {
  fetchDataWithRetry().then(processedTrainsCount => {
    logger.log('Processed trains count:', processedTrainsCount)
  }).catch(error => {
    logger.error('Error fetching trains data:', error)
  });
}, fifteenMinutesMs);

fetchDataWithRetry().then(processedTrainsCount => {
  logger.log('Processed trains count:', processedTrainsCount)
}).catch(error => {
  logger.error('Error fetching trains data:', error)
});