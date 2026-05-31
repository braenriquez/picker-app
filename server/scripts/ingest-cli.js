// Ingest spreadsheets from the terminal (handy for testing the parser port).
//   npm run ingest -- /path/to/Inventory.xlsx [more.xlsx ...]
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { ingestSources, currentVersion } from '../src/ingest.js';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: npm run ingest -- <file.xlsx> [...]');
  process.exit(1);
}
const sources = files.map((f) => ({ filename: basename(f), buffer: readFileSync(f) }));
const versionId = await ingestSources(sources, { source: 'cli', sourceMeta: { filenames: sources.map((s) => s.filename) } });
const ver = currentVersion();
console.log(`ingested version ${versionId}: ${ver.item_count} items, ${ver.unclass_count} unclassified (etag ${ver.etag})`);
