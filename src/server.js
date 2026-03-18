require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const apiRoutes = require('./routes/apiRoutes');
const { ensureDatabase, initializeSchema, testConnection, getDialect } = require('./config/db');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { scheduleDailySyncJob } = require('./jobs/dailySyncJob');

const app = express();
const port = Number(process.env.PORT || 4000);
const isVercelRuntime = Boolean(process.env.VERCEL || process.env.VERCEL_URL);
const dbDialect = getDialect();

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', apiRoutes);
app.use('/api', notFoundHandler);

app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use(errorHandler);

function shouldAutoInitDb() {
  return String(
    process.env.DB_AUTO_INIT ?? (
      dbDialect === 'postgres'
        ? 'true'
        : (process.env.NODE_ENV === 'production' ? 'false' : 'true')
    )
  ).toLowerCase() === 'true';
}

function shouldRequireDbOnStartup() {
  return String(
    process.env.DB_REQUIRE_ON_STARTUP ?? (isVercelRuntime ? 'false' : 'true')
  ).toLowerCase() === 'true';
}

async function initializeDatabaseOnStartup() {
  try {
    if (shouldAutoInitDb()) {
      await ensureDatabase();
      await initializeSchema();
    }

    await testConnection();
    console.log('[DB] Startup connection check passed');
  } catch (error) {
    if (shouldRequireDbOnStartup()) {
      throw error;
    }

    console.warn('[DB] Startup check skipped:', error.message);
  }
}

async function startServer() {
  await initializeDatabaseOnStartup();
  if (!isVercelRuntime) {
    scheduleDailySyncJob();
  }

  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}

if (!isVercelRuntime) {
  startServer().catch((error) => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });
}

module.exports = app;
