/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['node:sqlite', 'ws', 'node-pty'],
  async redirects() {
    return [
      {
        source: '/empresa/config',
        destination: '/config',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
