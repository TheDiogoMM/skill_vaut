import { buildApp } from './app.js';

const app = buildApp();

app.listen({ port: 3001, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`SkillVault server listening at ${address}`);
});
