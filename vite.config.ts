import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

// Peer deps are provided by the consuming app — never bundle them (bundling
// React/Mantine would break hooks + duplicate the runtime). `clsx` is small and
// stays bundled (declared as a regular dependency).
const peerDeps = [
  'react',
  'react-dom',
  '@mantine/core',
  '@mantine/dates',
  '@mantine/notifications',
  '@tabler/icons-react',
  '@tanstack/react-table',
  '@tanstack/react-virtual',
  '@tanstack/match-sorter-utils',
  'dayjs',
];

const isExternal = (id: string) =>
  peerDeps.some((dep) => id === dep || id.startsWith(`${dep}/`));

export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ['src'],
      // Roll every .d.ts into a single dist/index.d.ts (keeps the
      // `declare module '@tanstack/react-table'` augmentation intact).
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
      cssFileName: 'styles',
    },
    sourcemap: true,
    rollupOptions: {
      external: isExternal,
    },
  },
});
