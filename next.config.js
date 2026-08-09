require('./lib/utils/server-browser-globals')

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
].join('; ')

const globalSecurityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const animatedEmbedSecurityHeaders = globalSecurityHeaders.filter(
  (header) => header.key !== 'X-Frame-Options' && header.key !== 'Content-Security-Policy'
)

const corsHeaders = [
  { key: 'Access-Control-Allow-Origin', value: '*' },
  { key: 'Access-Control-Allow-Methods', value: 'GET, OPTIONS' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable React Strict Mode to prevent double-invocation of effects that can
  // cause Leaflet to initialize twice on the same container in development.
  reactStrictMode: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ipfs.io',
      },
      {
        protocol: 'https',
        hostname: 'gateway.pinata.cloud',
      },
      {
        protocol: 'https',
        hostname: 'dweb.link',
      },
      {
        protocol: 'https',
        hostname: 'cloudflare-ipfs.com',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'raw.seadn.io',
      },
      // Twitter/X media domains
      {
        protocol: 'https',
        hostname: 'pbs.twimg.com',
      },
      {
        protocol: 'https',
        hostname: 'abs.twimg.com',
      },
      {
        protocol: 'https',
        hostname: 'video.twimg.com',
      },
      {
        protocol: 'https',
        hostname: 'ton.twimg.com',
      },
      // Discord CDN
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
      },
      {
        protocol: 'https',
        hostname: 'media.discordapp.net',
      },
    ],
    // Enable optimization for character images (Leaflet uses direct URLs, not Next/Image)
  },
  webpack: (config, { isServer }) => {
    // Suppress MetaMask SDK React Native dependency warnings
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        '@react-native-async-storage/async-storage': false,
      }
    }

    // Ignore specific module warnings
    config.ignoreWarnings = [
      { module: /node_modules\/@metamask\/sdk/ },
      { message: /@react-native-async-storage\/async-storage/ },
    ]

    return config
  },

  async headers() {
    return [
      {
        source: '/:path((?!characters/[^/]+/animated/?$).*)',
        headers: globalSecurityHeaders,
      },
      {
        source: '/fonts/:path*',
        headers: corsHeaders,
      },
      {
        source: '/images/characters/:path*',
        headers: corsHeaders,
      },
      {
        source: '/characters/:tokenId/animated',
        headers: [
          ...corsHeaders,
          ...animatedEmbedSecurityHeaders,
        ],
      },
      {
        source: '/characters/:tokenId/animated/',
        headers: [
          ...corsHeaders,
          ...animatedEmbedSecurityHeaders,
        ],
      },
      {
        source: '/api/characters/metadata/:tokenId',
        headers: [
          ...corsHeaders,
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
    ]
  },

  // Add rewrites to handle WebP requests for map icons by serving PNG versions.
  // `/api/*` remote dev proxying is handled in `middleware.ts` so it can run
  // before App Router API route handlers.
  async rewrites() {
    return [
      {
        source: '/images/mapicons/:path*.webp',
        destination: '/images/mapicons/:path*.png',
      },
      {
        source: '/images/legendicons/:path*.webp',
        destination: '/images/legendicons/:path*.png',
      },
    ]
  },
}

module.exports = nextConfig
