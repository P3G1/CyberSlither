// Load configuration from environment or config file
const path = require('path');

// Environment variable overrides
const config = {
  disableHotReload: process.env.DISABLE_HOT_RELOAD === 'true',
};

module.exports = {
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {
      
      // Add Node.js polyfills for crypto and stream modules
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        "crypto": require.resolve("crypto-browserify"),
        "stream": require.resolve("stream-browserify"),
        "assert": require.resolve("assert"),
        "http": require.resolve("stream-http"),
        "https": require.resolve("https-browserify"),
        "os": require.resolve("os-browserify"),
        "url": require.resolve("url"),
        "zlib": require.resolve("browserify-zlib"),
        "path": require.resolve("path-browserify"),
        "fs": false,
        "net": false,
        "tls": false
      };

      // Add module rules for SVG handling
      const svgRule = {
        test: /\.svg$/,
        use: [
          {
            loader: '@svgr/webpack',
            options: {
              svgo: false,
            },
          },
          'url-loader',
        ],
      };

      // Find existing SVG rule and replace it
      const fileLoaderRule = webpackConfig.module.rules.find(rule => rule.test && rule.test.test('.svg'));
      if (fileLoaderRule) {
        fileLoaderRule.exclude = /\.svg$/;
      }
      
      webpackConfig.module.rules.push(svgRule);

      // Ignore missing assets from third-party packages
      webpackConfig.resolve.alias = {
        ...webpackConfig.resolve.alias,
        // Ignore missing SVG assets from @reown/appkit-ui
        '../assets/svg/swapHorizontalMedium.js': false,
        '../assets/svg/swapHorizontalBold.js': false,
        '../assets/svg/swapHorizontalRoundedBold.js': false,
        '../assets/svg/reown-logo.js': false,
      };
      
      // Disable hot reload completely if environment variable is set
      if (config.disableHotReload) {
        // Remove hot reload related plugins
        webpackConfig.plugins = webpackConfig.plugins.filter(plugin => {
          return !(plugin.constructor.name === 'HotModuleReplacementPlugin');
        });
        
        // Disable watch mode
        webpackConfig.watch = false;
        webpackConfig.watchOptions = {
          ignored: /.*/, // Ignore all files
        };
      } else {
        // Add ignored patterns to reduce watched directories
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
          ],
        };
      }
      
      return webpackConfig;
    },
  },
};