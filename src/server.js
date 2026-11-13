const express = require('express');
const fs = require('node:fs');
const path = require('node:path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const scenariosPath = path.join(__dirname, '..', 'scenarios', 'scenarios.json');
const MAX_LOGS = 500;

app.use(express.json({ limit: '1mb' }));

const logs = [];
const scenarios = JSON.parse(fs.readFileSync(scenariosPath, 'utf8'));

function recordRequest(req, statusCode, responseBody, startedAt) {
  logs.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl,
    scenario: req.get('x-mock-scenario') || 'default',
    statusCode,
    durationMs: Date.now() - startedAt,
    requestBody: req.body && Object.keys(req.body).length ? req.body : null,
    responseBody
  });
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
}

function sendMock(req, res, statusCode, body, startedAt, delayMs = 0) {
  const safeDelay = Math.max(0, Math.min(Number(delayMs) || 0, 10000));
  setTimeout(() => {
    recordRequest(req, statusCode, body, startedAt);
    res.status(statusCode).json(body);
  }, safeDelay);
}

function selectedScenario(req, defaultScenario = 'success') {
  const key = req.get('x-mock-scenario') || req.query.scenario || defaultScenario;
  return { key, value: scenarios[key] };
}

app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'B2B Commerce Integration Simulator', version: '1.0.0' });
});

app.get('/api/pricing/:sku', (req, res) => {
  const startedAt = Date.now();
  const { key, value } = selectedScenario(req, 'pricing-success');

  if (!value) {
    const body = { error: 'Unknown mock scenario', scenario: key, availableScenarios: Object.keys(scenarios) };
    return sendMock(req, res, 400, body, startedAt);
  }

  if (value.statusCode !== 200) {
    return sendMock(req, res, value.statusCode, {
      ...value.body,
      sku: req.params.sku,
      scenario: key
    }, startedAt, value.delayMs);
  }

  const body = {
    ...value.body,
    sku: req.params.sku,
    scenario: key
  };
  return sendMock(req, res, 200, body, startedAt, value.delayMs);
});

app.get('/api/inventory/:sku', (req, res) => {
  const startedAt = Date.now();
  const { key, value } = selectedScenario(req, 'inventory-in-stock');

  if (!value) {
    return sendMock(req, res, 400, {
      error: 'Unknown mock scenario',
      scenario: key,
      availableScenarios: Object.keys(scenarios)
    }, startedAt);
  }

  return sendMock(req, res, value.statusCode || 200, {
    ...value.body,
    sku: req.params.sku,
    scenario: key
  }, startedAt, value.delayMs);
});

app.post('/api/orders', (req, res) => {
  const startedAt = Date.now();
  const { key, value } = selectedScenario(req, 'order-accepted');

  if (!value) {
    return sendMock(req, res, 400, {
      error: 'Unknown mock scenario',
      scenario: key,
      availableScenarios: Object.keys(scenarios)
    }, startedAt);
  }

  const body = {
    ...value.body,
    scenario: key,
    receivedOrder: req.body || null
  };
  return sendMock(req, res, value.statusCode || 200, body, startedAt, value.delayMs);
});

app.get('/admin/scenarios', (req, res) => {
  res.json({
    scenarios: Object.entries(scenarios).map(([key, value]) => ({
      key,
      description: value.description,
      statusCode: value.statusCode,
      delayMs: value.delayMs || 0
    }))
  });
});

app.get('/admin/logs', (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, MAX_LOGS));
  res.json({ count: Math.min(logs.length, limit), logs: logs.slice(0, limit) });
});

app.delete('/admin/logs', (req, res) => {
  logs.length = 0;
  res.json({ message: 'Request logs cleared' });
});

app.use((req, res) => {
  const startedAt = Date.now();
  const body = { error: 'Route not found', method: req.method, path: req.originalUrl };
  recordRequest(req, 404, body, startedAt);
  res.status(404).json(body);
});

app.listen(PORT, () => {
  console.log(`B2B Commerce Integration Simulator running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
