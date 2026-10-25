// Loads the repo-root .env, the one secrets file shared by server/ and site/.
// Run copies (verify, evals) live under /tmp, so they find no .env and stay keyless.
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
