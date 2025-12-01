import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';

import { chatRouter } from './routes/chat.js';
import { shippingRouter } from './routes/shipping.js';
import { agentsRouter } from './routes/agents.js';
import { memoriesRouter } from './routes/memories.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    services: {
      database: true, // TODO: Add actual health checks
      redis: true,
      llm: true,
    },
  });
});

// API Routes
app.use('/api/chat', chatRouter);
app.use('/api/shipping', shippingRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/memories', memoriesRouter);

// Legacy MCP-style tool endpoints (for backwards compatibility)
app.post('/tools/submit_delivery_request', async (req, res) => {
  // Forward to shipping router
  req.url = '/intake';
  shippingRouter(req, res, () => {});
});

app.post('/tools/compare_rates', async (req, res) => {
  req.url = '/rates';
  shippingRouter(req, res, () => {});
});

app.post('/tools/book_shipment', async (req, res) => {
  req.url = '/book';
  shippingRouter(req, res, () => {});
});

app.post('/tools/get_shipment_status', async (req, res) => {
  const { shipment_id, tracking_number } = req.body;
  req.url = `/track/${tracking_number || shipment_id}`;
  req.method = 'GET';
  shippingRouter(req, res, () => {});
});

app.post('/tools/generate_code', async (req, res) => {
  req.url = '/generate';
  agentsRouter(req, res, () => {});
});

app.post('/tools/check_generation_status', async (req, res) => {
  const { jobId } = req.body;
  req.url = `/status/${jobId}`;
  req.method = 'GET';
  agentsRouter(req, res, () => {});
});

// Error handling
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred',
    },
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Unified Shipping Platform API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

export default app;
