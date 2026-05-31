// Generate a connection key from the terminal. `npm run newkey -- "Jose's iPad"`
import 'dotenv/config';
import { createKey } from '../src/auth.js';
import { warmup } from '../src/auth.js';

const label = process.argv.slice(2).join(' ').trim();
if (!label) {
  console.error('usage: npm run newkey -- "<label>"');
  process.exit(1);
}
await warmup();
const { key } = await createKey(label);
console.log('\nConnection key for', JSON.stringify(label) + ':\n');
console.log('  ' + key + '\n');
console.log('Paste it into the PWA Settings. It is shown only once.');
