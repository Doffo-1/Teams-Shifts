/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  allowedDevOrigins: [
    "localhost:3000",
    "localhost:3065",
    "127.0.0.1:3000",
    "127.0.0.1:3065",
  ],
  turbopack: {},
  serverExternalPackages: ["@prisma/client", "prisma", "exceljs"],
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
};

export default nextConfig;
