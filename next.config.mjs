/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "prisma", "exceljs"],
};

export default nextConfig;
