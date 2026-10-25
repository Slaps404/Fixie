import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// Secrets live in the repo-root .env, shared with server/.
loadEnvConfig(new URL('..', import.meta.url).pathname);

const nextConfig: NextConfig = {
  // Lets the dev server be shared through a quick Cloudflare tunnel.
  allowedDevOrigins: ['*.trycloudflare.com'],
};

export default nextConfig;
