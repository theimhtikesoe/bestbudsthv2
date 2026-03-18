const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { Pool: PostgresPool } = require('pg');

const DIALECT = process.env.DATABASE_URL || process.env.POSTGRES_URL ? 'postgres' : 'mysql';
const SAFE_BOX_BACKFILL_DATE = '2026-02-20';

const DAILY_REPORTS_REQUIRED_COLUMNS = [
  {
    name: '1k_qty',
    mysqlDefinition: 'INT NOT NULL DEFAULT 0',
    postgresDefinition: 'INTEGER NOT NULL DEFAULT 0'
  },
  {
    name: '1k_total',
    mysqlDefinition: 'DECIMAL(12,2) NOT NULL DEFAULT 0',
    postgresDefinition: 'NUMERIC(12,2) NOT NULL DEFAULT 0'
  },
  {
    name: 'safe_box_label',
    mysqlDefinition: "VARCHAR(120) NOT NULL DEFAULT '1K Bill'",
    postgresDefinition: "VARCHAR(120) NOT NULL DEFAULT '1K Bill'"
  },
  {
    name: 'safe_box_amount',
    mysqlDefinition: 'DECIMAL(12,2) NOT NULL DEFAULT 0',
    postgresDefinition: 'NUMERIC(12,2) NOT NULL DEFAULT 0'
  }
];

function parseDbPort(value) {
  const parsed = Number(value || 3306);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3306;
}

function getMysqlConfig() {
  return {
    host: process.env.DB_HOST,
    port: parseDbPort(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    decimalNumbers: true
  };
}

function getPostgresConfig() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  return {
    connectionString,
    max: 10,
    ssl: connectionString && !connectionString.includes('localhost')
      ? { rejectUnauthorized: false }
      : false
  };
}

function getMissingMysqlConfigKeys() {
  const requiredKeys = ['DB_HOST', 'DB_USER', 'DB_NAME'];
  return requiredKeys.filter((key) => !process.env[key]);
}

function getMissingPostgresConfigKeys() {
  const requiredKeys = ['DATABASE_URL'];
  return requiredKeys.filter((key) => !process.env[key] && !(key === 'DATABASE_URL' && process.env.POSTGRES_URL));
}

function assertDbConfigured() {
  const missingKeys = DIALECT === 'postgres'
    ? getMissingPostgresConfigKeys()
    : getMissingMysqlConfigKeys();

  if (missingKeys.length > 0) {
    const error = new Error(`Missing database configuration: ${missingKeys.join(', ')}`);
    error.status = 500;
    throw error;
  }
}

let mysqlPool;
let postgresPool;

function getMysqlPool() {
  if (!mysqlPool) {
    mysqlPool = mysql.createPool(getMysqlConfig());
  }
  return mysqlPool;
}

function getPostgresPool() {
  if (!postgresPool) {
    postgresPool = new PostgresPool(getPostgresConfig());
  }
  return postgresPool;
}

function getSchemaFilePath() {
  if (DIALECT === 'postgres') {
    return path.join(__dirname, '../../sql/schema.postgres.sql');
  }
  return path.join(__dirname, '../../sql/schema.sql');
}

function quoteDailyReportColumn(name) {
  return DIALECT === 'postgres' ? `"${name}"` : `\`${name}\``;
}

async function hasDailyReportColumn(columnName) {
  if (DIALECT === 'postgres') {
    const result = await getPostgresPool().query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = $1
         AND column_name = $2
       LIMIT 1`,
      ['daily_reports', columnName]
    );
    return result.rowCount > 0;
  }

  const mysqlConfig = getMysqlConfig();
  const [rows] = await getMysqlPool().query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = ?
       AND table_name = ?
       AND column_name = ?
     LIMIT 1`,
    [mysqlConfig.database, 'daily_reports', columnName]
  );

  return rows.length > 0;
}

async function ensureDailyReportsColumns() {
  for (const column of DAILY_REPORTS_REQUIRED_COLUMNS) {
    const exists = await hasDailyReportColumn(column.name);
    if (exists) {
      continue;
    }

    const quotedColumnName = quoteDailyReportColumn(column.name);

    if (DIALECT === 'postgres') {
      await getPostgresPool().query(
        `ALTER TABLE daily_reports ADD COLUMN ${quotedColumnName} ${column.postgresDefinition}`
      );
      continue;
    }

    await getMysqlPool().query(
      `ALTER TABLE daily_reports ADD COLUMN ${quotedColumnName} ${column.mysqlDefinition}`
    );
  }
}

async function applySafeBoxBackfill() {
  if (DIALECT === 'postgres') {
    await getPostgresPool().query(
      `UPDATE daily_reports
       SET safe_box_label = COALESCE(NULLIF(TRIM(safe_box_label), ''), '1K Bill'),
           "1k_qty" = CASE WHEN "1k_qty" = 0 THEN 7 ELSE "1k_qty" END,
           "1k_total" = CASE WHEN "1k_total" = 0 THEN 7000 ELSE "1k_total" END,
           updated_at = CURRENT_TIMESTAMP
       WHERE date = $1
         AND "1k_qty" = 0
         AND "1k_total" = 0`,
      [SAFE_BOX_BACKFILL_DATE]
    );
    return;
  }

  await getMysqlPool().query(
    `UPDATE daily_reports
     SET safe_box_label = IFNULL(NULLIF(TRIM(safe_box_label), ''), '1K Bill'),
         \`1k_qty\` = IF(\`1k_qty\` = 0, 7, \`1k_qty\`),
         \`1k_total\` = IF(\`1k_total\` = 0, 7000, \`1k_total\`),
         updated_at = CURRENT_TIMESTAMP
     WHERE date = ?
       AND \`1k_qty\` = 0
       AND \`1k_total\` = 0`,
    [SAFE_BOX_BACKFILL_DATE]
  );
}

async function ensureDatabase() {
  assertDbConfigured();

  if (DIALECT === 'postgres') {
    return;
  }

  const dbConfig = getMysqlConfig();
  const connection = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password
  });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
  } finally {
    await connection.end();
  }
}

async function initializeSchema() {
  assertDbConfigured();

  const schemaPath = getSchemaFilePath();
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  const statements = schemaSql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    if (DIALECT === 'postgres') {
      await getPostgresPool().query(statement);
    } else {
      await getMysqlPool().query(statement);
    }
  }

  await ensureDailyReportsColumns();
  await applySafeBoxBackfill();
}

async function query(sql, params = []) {
  assertDbConfigured();

  if (DIALECT === 'postgres') {
    const result = await getPostgresPool().query(sql, params);
    return result.rows;
  }

  const [rows] = await getMysqlPool().execute(sql, params);
  return rows;
}

async function testConnection() {
  await query('SELECT 1');
}

function getDialect() {
  return DIALECT;
}

module.exports = {
  query,
  ensureDatabase,
  initializeSchema,
  testConnection,
  getDialect
};
