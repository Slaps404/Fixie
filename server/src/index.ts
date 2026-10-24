import express from 'express';
import cors from 'cors';
import { config } from './config.ts';
import { sseHandler, eventsJsonHandler } from './events.ts';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, dryRun: config.dryRun, publicUrl: config.publicUrl || null }));
app.get('/events', sseHandler);
app.get('/events.json', eventsJsonHandler);

// Workstream routers are mounted here as they land (see docs/issues).
const mount = async (path: string) => {
  try {
    const mod = await import(path);
    mod.register?.(app);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw err;
  }
};
await mount('./vapi/webhook.ts');
await mount('./routes.ts');

app.listen(config.port, () => {
  console.log(`Fixie server on :${config.port}  dryRun=${config.dryRun}  publicUrl=${config.publicUrl || '(unset)'}`);
  import('./boot.ts')
    .then((m) => m.ensureInbound?.())
    .catch((err) => console.warn('[boot] ensureInbound failed:', err));
});
