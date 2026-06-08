/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone output bundles only the files needed to run in production,
  // enabling a minimal Docker image without shipping all of node_modules.
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
