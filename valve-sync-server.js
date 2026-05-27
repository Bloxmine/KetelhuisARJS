// node valve-sync-server.js
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const LOG_DIR = path.join(__dirname, 'logs');

// Store valve states (0-100)
let valveState = {
  valve1: 0,
  valve2: 0
};

let activeLogSession = null;
let lastLogReport = null;

function clampPressure(value) {
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return 0;
  }

  return Math.max(0, Math.min(100, numericValue));
}

function classifyPressure(pressure) {
  if (pressure >= 80) {
    return 'red';
  }

  if (pressure <= 30) {
    return 'cold';
  }

  return 'green';
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function createLogSessionId() {
  return `log-${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeSamples(samples, startedAt, stoppedAt) {
  if (!samples.length) {
    return {
      totalDurationMs: Math.max(0, stoppedAt - startedAt),
      greenDurationMs: 0,
      redDurationMs: 0,
      coldDurationMs: 0,
      redTouches: 0,
      firstMovementMs: null,
      averagePressure: 0,
      maxPressure: 0,
      sampleCount: 0
    };
  }

  let greenDurationMs = 0;
  let redDurationMs = 0;
  let coldDurationMs = 0;
  let redTouches = 0;
  let firstMovementMs = null;
  let weightedPressureSum = 0;
  let maxPressure = 0;
  const baselinePressure = samples[0].pressure;

  for (let index = 0; index < samples.length; index += 1) {
    const currentSample = samples[index];
    const nextTimestamp = samples[index + 1] ? samples[index + 1].timestamp : stoppedAt;
    const deltaMs = Math.max(0, nextTimestamp - currentSample.timestamp);
    const zone = currentSample.zone || classifyPressure(currentSample.pressure);

    if (zone === 'green') {
      greenDurationMs += deltaMs;
    } else if (zone === 'red') {
      redDurationMs += deltaMs;
    } else {
      coldDurationMs += deltaMs;
    }

    if (zone === 'red' && (index === 0 || (samples[index - 1].zone || classifyPressure(samples[index - 1].pressure)) !== 'red')) {
      redTouches += 1;
    }

    if (firstMovementMs === null && Math.abs(currentSample.pressure - baselinePressure) >= 2) {
      firstMovementMs = Math.max(0, currentSample.timestamp - startedAt);
    }

    weightedPressureSum += currentSample.pressure * deltaMs;
    maxPressure = Math.max(maxPressure, currentSample.pressure);
  }

  const totalDurationMs = Math.max(0, stoppedAt - startedAt);

  return {
    totalDurationMs,
    greenDurationMs,
    redDurationMs,
    coldDurationMs,
    redTouches,
    firstMovementMs,
    averagePressure: totalDurationMs > 0 ? weightedPressureSum / totalDurationMs : samples[0].pressure,
    maxPressure,
    sampleCount: samples.length
  };
}

function downsampleSamples(samples, maxPoints = 450) {
  if (samples.length <= maxPoints) {
    return samples;
  }

  const step = samples.length / maxPoints;
  const reduced = [];

  for (let index = 0; index < maxPoints; index += 1) {
    reduced.push(samples[Math.floor(index * step)]);
  }

  const lastSample = samples[samples.length - 1];
  if (reduced[reduced.length - 1] !== lastSample) {
    reduced.push(lastSample);
  }

  return reduced;
}

function startLogSession(initialPressure) {
  ensureLogDir();

  const sessionId = createLogSessionId();
  const startedAt = Date.now();
  const fileName = `${sessionId}.jsonl`;
  const filePath = path.join(LOG_DIR, fileName);
  const session = {
    sessionId,
    startedAt,
    fileName,
    filePath,
    initialPressure: clampPressure(initialPressure),
    samples: []
  };

  fs.writeFileSync(filePath, `${JSON.stringify({
    type: 'session-start',
    sessionId,
    startedAt,
    initialPressure: session.initialPressure
  })}\n`);

  const initialSample = {
    timestamp: startedAt,
    pressure: session.initialPressure,
    zone: classifyPressure(session.initialPressure)
  };
  session.samples.push(initialSample);
  fs.appendFileSync(filePath, `${JSON.stringify({
    type: 'sample',
    ...initialSample
  })}\n`);

  activeLogSession = session;
  return session;
}

function appendLogSample(sample) {
  if (!activeLogSession) {
    return false;
  }

  const timestamp = Date.now();
  const pressure = clampPressure(sample.pressure);
  const zone = sample.zone || classifyPressure(pressure);
  const entry = { timestamp, pressure, zone };

  activeLogSession.samples.push(entry);
  fs.appendFileSync(activeLogSession.filePath, `${JSON.stringify({
    type: 'sample',
    ...entry
  })}\n`);

  return true;
}

function stopLogSession(sessionId) {
  if (!activeLogSession || activeLogSession.sessionId !== sessionId) {
    return null;
  }

  const session = activeLogSession;
  const stoppedAt = Date.now();
  const summary = summarizeSamples(session.samples, session.startedAt, stoppedAt);
  const graphSamples = downsampleSamples(session.samples.map(sample => ({
    ...sample,
    timestamp: sample.timestamp - session.startedAt
  })));
  const report = {
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    stoppedAt,
    fileName: session.fileName,
    filePath: path.join('logs', session.fileName),
    summary,
    graphSamples
  };

  fs.appendFileSync(session.filePath, `${JSON.stringify({
    type: 'session-stop',
    sessionId: session.sessionId,
    stoppedAt,
    summary
  })}\n`);

  activeLogSession = null;
  lastLogReport = {
    ...report,
    state: 'completed'
  };

  return report;
}

// MIME types for static files
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.glb': 'model/gltf-binary'
};

// Create HTTPS server (for secure communication)
const options = {
  key: fs.readFileSync(path.join(__dirname, 'server.key'), 'utf8'),
  cert: fs.readFileSync(path.join(__dirname, 'server.cert'), 'utf8')
};

const server = https.createServer(options, (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // API Endpoints
  
  // GET endpoint: return current valve state
  if (req.method === 'GET' && pathname === '/valve-state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(valveState));
    console.log('Sent valve state:', valveState);
    return;
  }

  // POST endpoint: update valve state
  if (req.method === 'POST' && pathname === '/valve-state') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        // Update only the valves that were sent
        if (data.valve1 !== undefined) valveState.valve1 = Math.max(0, Math.min(100, data.valve1));
        if (data.valve2 !== undefined) valveState.valve2 = Math.max(0, Math.min(100, data.valve2));

        console.log('Updated valve state:', valveState);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, valveState }));
      } catch (e) {
        console.error('Error parsing request:', e);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/logging/start') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        if (activeLogSession) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Logging is already active' }));
          return;
        }

        const data = body ? JSON.parse(body) : {};
        const session = startLogSession(data.initialPressure);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          sessionId: session.sessionId,
          startedAt: session.startedAt,
          fileName: session.fileName,
          filePath: path.join('logs', session.fileName)
        }));
      } catch (error) {
        console.error('Error starting log session:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid logging request' }));
      }
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/logging/sample') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body);

        if (!activeLogSession || data.sessionId !== activeLogSession.sessionId) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No active logging session' }));
          return;
        }

        appendLogSample(data);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        console.error('Error parsing logging sample:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid logging sample' }));
      }
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/logging/stop') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const report = stopLogSession(data.sessionId);

        if (!report) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No active logging session' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          report
        }));
      } catch (error) {
        console.error('Error stopping log session:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid logging stop request' }));
      }
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/logging/live') {
    if (activeLogSession) {
      const samples = activeLogSession.samples;
      const now = Date.now();
      const summary = summarizeSamples(samples, activeLogSession.startedAt, now);
      const graphSamples = downsampleSamples(samples.map(sample => ({
        ...sample,
        timestamp: sample.timestamp - activeLogSession.startedAt
      })));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        state: 'active',
        sessionId: activeLogSession.sessionId,
        startedAt: activeLogSession.startedAt,
        fileName: activeLogSession.fileName,
        filePath: path.join('logs', activeLogSession.fileName),
        summary,
        graphSamples,
        latestSample: samples[samples.length - 1] || null
      }));
      return;
    }

    if (lastLogReport) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(lastLogReport));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ state: 'idle' }));
    return;
  }

  // Static file serving
  let filePath = path.join(__dirname, pathname);
  
  // Default to index.html if root is requested
  if (pathname === '/') {
    filePath = path.join(__dirname, 'index.html');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    // Get MIME type
    const ext = path.extname(filePath);
    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    // Read and serve the file
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
        console.error('Error reading file:', err);
        return;
      }

      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(data);
      console.log(`Served: ${pathname}`);
    });
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Valve sync server running on https://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log(`  GET  https://localhost:${PORT}/valve-state  - Get current valve state`);
  console.log(`  POST https://localhost:${PORT}/valve-state  - Update valve state`);
  console.log(`  GET  https://localhost:${PORT}/logging/live  - Get live logging state`);
  console.log(`  Static files from current directory`);
});

