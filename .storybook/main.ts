import type { StorybookConfig } from '@storybook/react-vite';
import { resolve } from 'path';

const config: StorybookConfig = {
  staticDirs: ['../public'],
  stories: [
    '../components/**/*.stories.@(js|jsx|ts|tsx)',
    '../src/**/*.stories.@(js|jsx|ts|tsx)',
  ],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-docs',
    '@storybook/addon-interactions',
    '@storybook/addon-a11y',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  viteFinal: async (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      '@/hooks/useAuth': resolve(__dirname, './mock-providers'),
      '@/hooks/useCharacters': resolve(__dirname, './mocks/hooks/useCharacters'),
      '@/hooks/useSearing': resolve(__dirname, './mocks/hooks/useSearing'),
      '@/hooks/useSearingConcords': resolve(__dirname, './mocks/hooks/useSearingConcords'),
      '@/hooks/useSpread': resolve(__dirname, './mocks/hooks/useSpread'),
      '@/hooks/useCure': resolve(__dirname, './mocks/hooks/useCure'),
      '@/hooks/useCorpseBurning': resolve(__dirname, './mocks/hooks/useCorpseBurning'),
      '@/hooks/useTokenBalances': resolve(__dirname, './mocks/hooks/useTokenBalances'),
      '@/hooks/useStaking': resolve(__dirname, './mocks/hooks/useStaking'),
      '@/hooks/useAICharacter': resolve(__dirname, './mocks/hooks/useAICharacter'),
      '@': resolve(__dirname, '../'),
      'next/link': resolve(__dirname, './mocks/next/link'),
      'next/image': resolve(__dirname, './mocks/next/image'),
      'next/navigation': resolve(__dirname, './mocks/next/navigation'),
      'next/dynamic': resolve(__dirname, './mocks/next/dynamic'),
      // ESM/CJS interop fix for eventemitter3 (used by wagmi)
      'eventemitter3': resolve(__dirname, './mocks/eventemitter3'),
    };

    // Polyfill process.env for Storybook
    config.define = {
      ...config.define,
      'process.env': {},
    };

    // Handle ESM/CJS interop issues
    config.optimizeDeps = config.optimizeDeps || {};
    config.optimizeDeps.include = [
      ...(config.optimizeDeps.include || []),
      'eventemitter3',
      'react',
      'react-dom',
    ];
    config.optimizeDeps.esbuildOptions = {
      ...(config.optimizeDeps.esbuildOptions || {}),
      target: 'es2020',
    };

    // Force bundling of problematic ESM packages
    config.ssr = config.ssr || {};
    config.ssr.noExternal = ['eventemitter3'];

    return config;
  },
};

export default config;
