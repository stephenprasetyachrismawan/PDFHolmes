/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@pdfholmes/field-schema", "@pdfholmes/shared-types"],
  // react-pdf butuh canvas dieksternalkan di server.
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
