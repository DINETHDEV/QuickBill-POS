const { createClient } = require('@libsql/client');

let db = null;

const getDb = () => {
  if (!db) {
    db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return db;
};

const run = async (sql, params = []) => {
  const result = await getDb().execute({ sql, args: params });
  return { lastID: Number(result.lastInsertRowid), changes: result.rowsAffected };
};

const get = async (sql, params = []) => {
  const result = await getDb().execute({ sql, args: params });
  if (result.rows.length === 0) return undefined;
  const row = {};
  result.columns.forEach((col, i) => { row[col] = result.rows[0][i]; });
  return row;
};

const all = async (sql, params = []) => {
  const result = await getDb().execute({ sql, args: params });
  return result.rows.map(row => {
    const obj = {};
    result.columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
};

module.exports = { run, get, all };
