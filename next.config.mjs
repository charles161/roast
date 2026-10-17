/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The OG renderer reads the vendored mono off disk, so the tracer has to
  // know those files are needed at runtime.
  outputFileTracingIncludes: {
    '/api/og': ['./assets/fonts/**'],
  },
};

export default nextConfig;
