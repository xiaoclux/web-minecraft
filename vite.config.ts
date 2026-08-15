/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { compression } from 'vite-plugin-compression2';

/** 只有超过该体积的产物才值得预压缩（太小的文件压缩收益抵不过一次额外请求头）。 */
const COMPRESS_THRESHOLD_BYTES = 1024;
/** 大于该体积的单 chunk 才提示（three 约 600 kB，独立成包后不再是首屏成本）。 */
const CHUNK_SIZE_WARNING_KB = 700;

export default defineConfig({
  plugins: [
    react(),
    compression({ algorithms: ['gzip'], threshold: COMPRESS_THRESHOLD_BYTES }),
    compression({ algorithms: ['brotliCompress'], threshold: COMPRESS_THRESHOLD_BYTES }),
  ],
  build: {
    // 目标现代浏览器（WebGL2 + Pointer Lock 本身就要求现代环境），少转译即少体积
    target: 'es2022',
    chunkSizeWarningLimit: CHUNK_SIZE_WARNING_KB,
    rolldownOptions: {
      output: {
        // 三方库按变更频率分包：three 最大且几乎不变，独立缓存；react 单独一包；引擎/UI 随业务变动
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'vendor', test: /node_modules[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
