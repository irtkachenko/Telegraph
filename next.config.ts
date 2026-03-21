/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  reactCompiler: true,
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  experimental: {
    // swcMinify removed - invalid option in Next.js 16
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.pravatar.cc',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // Add for Google Auth avatars
        port: '',
        pathname: '/**',
      },
    ],
  },
  turbopack: {}, // Empty config to silence Next.js 16 error
  webpack: (config: any) => {
    // Improve performance
    config.watchOptions = {
      poll: false,
      aggregateTimeout: 300,
      ignored: /node_modules/,
    };
    
    // Optimize for development
    if (config.mode === 'development') {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
            },
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              enforce: true,
            },
          },
        },
        moduleIds: 'deterministic',
      };
      
      // Faster source maps in development
      config.devtool = 'eval-cheap-module-source-map';
    }
    
    return config;
  },
};
export default nextConfig;