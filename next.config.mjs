/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The OG renderer reads the vendored mono off disk, so the tracer has to
  // know those files are needed at runtime.
  outputFileTracingIncludes: {
    '/api/og': ['./assets/fonts/**'],
  },
  async headers() {
    // Baseline hardening for a public tool. No CSP here on purpose: the OG
    // renderer + analytics make a strict policy fragile, and a wrong CSP breaks
    // the launch. HSTS is added by the platform edge.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
