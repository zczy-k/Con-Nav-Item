import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync, rmSync } from 'fs';
import { resolve, join } from 'path';

// 递归复制目录
function copyRecursive(src, dest) {
  const exists = existsSync(src);
  const stats = exists && statSync(src);
  const isDirectory = exists && stats.isDirectory();
  
  if (isDirectory) {
    if (!existsSync(dest)) {
      mkdirSync(dest, { recursive: true });
    }
    readdirSync(src).forEach(childItemName => {
      copyRecursive(
        join(src, childItemName),
        join(dest, childItemName)
      );
    });
  } else {
    copyFileSync(src, dest);
  }
}

export default defineConfig({
  // Force rebuild: 202511211700
  plugins: [
    vue(),
    {
      name: 'copy-to-public',
      closeBundle() {
        const distDir = resolve(__dirname, 'dist');
        const publicDir = resolve(__dirname, '..', 'public');
        const publicAssetsDir = resolve(publicDir, 'assets');
        const publicIconsDir = resolve(__dirname, 'public', 'icons');
        const distIconsDir = resolve(distDir, 'icons');
        
        try {
          // 1. 首先复制 PWA 文件到 dist 目录
          mkdirSync(distIconsDir, { recursive: true });
          
          copyFileSync(resolve(__dirname, 'public', 'manifest.json'), resolve(distDir, 'manifest.json'));
          copyFileSync(resolve(__dirname, 'public', 'sw.js'), resolve(distDir, 'sw.js'));
          copyFileSync(resolve(publicIconsDir, 'icon-192x192.png'), resolve(distIconsDir, 'icon-192x192.png'));
          copyFileSync(resolve(publicIconsDir, 'icon-512x512.png'), resolve(distIconsDir, 'icon-512x512.png'));
          
          console.log('✅ PWA 文件复制成功');
          
          // 2. 清理旧的 assets 文件（只保留新构建的）
          if (existsSync(publicAssetsDir)) {
            console.log('🧹 正在清理旧的构建文件...');
            rmSync(publicAssetsDir, { recursive: true, force: true });
            console.log('✅ 旧文件已清理');
          }
          
          // 3. 然后将整个 dist 目录复制到 public 目录
          console.log('🔄 正在复制构建文件到 public 目录...');
          copyRecursive(distDir, publicDir);
          console.log('✅ 构建文件已自动复制到 public 目录');
        } catch (err) {
          console.error('❌ 文件复制失败:', err.message);
        }
      }
    }
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2015',
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false
  }
});
