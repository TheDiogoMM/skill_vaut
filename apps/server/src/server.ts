import 'dotenv/config';
import { buildApp } from './app.js';
import { loadConfig, ensureSkillVaultDirs } from './config.js';
import { createDb } from './db/connection.js';

const config = loadConfig();
ensureSkillVaultDirs(config);
const db = createDb(config.dbPath);
const app = buildApp({ db, config });

app.listen({ port: config.port, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`SkillVault server listening at ${address}`);
});
