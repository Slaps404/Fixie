import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Lets the dev server be shared through a quick Cloudflare tunnel.
  allowedDevOrigins: ['*.trycloudflare.com'],
};

export default nextConfig;
