import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
