/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The end-to-end tests build into .next-e2e, so the normal .next build is not touched.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
