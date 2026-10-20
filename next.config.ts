import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingExcludes: { "/*": ["./.data/**/*", "./.backups/**/*", "./.restore-*/**/*", "./.evidence/**/*", "./.tools/**/*", "./backend/**/*", "./frontend/**/*", "./tmp/**/*", "./.env*"] },
  serverExternalPackages: ["pg"],
  turbopack: { rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } },
};
export default nextConfig;
