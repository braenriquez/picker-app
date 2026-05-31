// Apply the schema and exit. `npm run init-db`
import 'dotenv/config';
import { getDb } from '../src/db.js';

const db = getDb();
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('DB ready at', process.env.DB_PATH || './data/inventory.db');
console.log('tables:', tables.map((t) => t.name).join(', '));
