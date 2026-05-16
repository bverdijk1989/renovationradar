/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  // Mark playwright-core as external so Next.js's webpack niet probeert om
  // het mee te bundelen (heeft lazy dynamic-require op chromium-bidi e.a.
  // die anders als "Module not found" failen tijdens build).
  experimental: {
    serverComponentsExternalPackages: ["playwright-core"],
  },
};

export default nextConfig;
