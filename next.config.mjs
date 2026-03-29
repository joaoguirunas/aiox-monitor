/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['node:sqlite', 'ws', 'node-pty'],
};

export default nextConfig;
