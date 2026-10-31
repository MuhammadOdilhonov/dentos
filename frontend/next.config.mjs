import { fileURLToPath } from 'node:url';
/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),
  output: 'standalone',
  // Keep production builds from replacing chunks used by the running dev server.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  // Dev'da /api/:path* rewrite backend'ga proxy qiladi. Backend endpointlari oxirida
  // "/" bilan (Django APPEND_SLASH + PUBLIC ro'yxati). Next'ning avtomatik trailing-slash
  // redirecti (308 → slashsiz) bu proxy'ni buzardi: /api/health/ → /api/health → backend 401.
  // skipTrailingSlashRedirect redirectni o'chiradi; slash backendga o'zgarmay yetib boradi.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    // Backend endpointlari oxirida "/" talab qiladi (Django). `:path*` destination'da
    // trailing slashni tushirib qoldiradi, shuning uchun slash bilan tugaydigan yo'l
    // uchun ALOHIDA, slashni tiklaydigan qoidani OLDIN qo'yamiz.
    return process.env.NODE_ENV === 'development'
      ? [
          { source: '/api/:path*/', destination: 'http://127.0.0.1:8000/api/:path*/' },
          { source: '/api/:path*', destination: 'http://127.0.0.1:8000/api/:path*' },
        ]
      : [];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config, { dev, isServer, webpack }) => {
    // Windows / OneDrive (Desktop) da .next/cache/webpack/*.pack.gz fayllari
    // qulflanib "ENOENT ... .pack.gz" xatosini beradi. Dev rejimda diskdagi
    // kesh o'rniga xotira (memory) keshidan foydalanamiz — xato yo'qoladi.
    if (dev) {
      config.cache = { type: 'memory' };
    }
    // pptxgenjs kabi kutubxonalar `node:fs` ishlatadi — client (brauzer) build'da
    // ularni bo'sh modulga almashtiramiz (brauzerda Node fayl tizimi yo'q).
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = { ...(config.resolve.fallback || {}), fs: false, path: false, os: false, crypto: false, stream: false, https: false, http: false, zlib: false };
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
        resource.request = resource.request.replace(/^node:/, '');
      }));
    }
    return config;
  },
};

export default nextConfig;
