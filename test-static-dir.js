#!/usr/bin/env node

/**
 * 测试静态文件目录选择逻辑
 * 用于验证 app.js 在不同环境下的行为
 */

const fs = require('fs');
const path = require('path');

console.log('=== 静态文件目录选择测试 ===\n');

// 测试 1: 当前环境（有 web/dist）
console.log('测试 1: 当前环境（开发环境）');
const staticDir1 = fs.existsSync(path.join(__dirname, 'web/dist/index.html')) 
  ? path.join(__dirname, 'web/dist')
  : path.join(__dirname, 'public');
console.log(`  选择的目录: ${staticDir1}`);
console.log(`  index.html 存在: ${fs.existsSync(path.join(staticDir1, 'index.html'))}`);
console.log(`  assets 目录存在: ${fs.existsSync(path.join(staticDir1, 'assets'))}`);

// 测试 2: 模拟 Serv00 环境（没有 web/dist）
console.log('\n测试 2: 模拟 Serv00 环境（生产环境）');
const tempDir = path.join(__dirname, 'temp-test-env');
try {
  // 创建临时测试环境
  fs.mkdirSync(tempDir, { recursive: true });
  
  // 只复制 public 目录
  const publicSrc = path.join(__dirname, 'public');
  const publicDest = path.join(tempDir, 'public');
  
  if (fs.existsSync(publicSrc)) {
    fs.cpSync(publicSrc, publicDest, { recursive: true });
    
    // 在临时目录中测试
    const oldCwd = process.cwd();
    process.chdir(tempDir);
    
    const staticDir2 = fs.existsSync(path.join(tempDir, 'web/dist/index.html')) 
      ? path.join(tempDir, 'web/dist')
      : path.join(tempDir, 'public');
    
    console.log(`  选择的目录: ${staticDir2}`);
    console.log(`  index.html 存在: ${fs.existsSync(path.join(staticDir2, 'index.html'))}`);
    console.log(`  assets 目录存在: ${fs.existsSync(path.join(staticDir2, 'assets'))}`);
    
    process.chdir(oldCwd);
  } else {
    console.log('  ⚠️  public 目录不存在，跳过测试');
  }
  
  // 清理
  fs.rmSync(tempDir, { recursive: true, force: true });
} catch (error) {
  console.error(`  ❌ 测试失败: ${error.message}`);
  // 确保清理
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (e) {}
}

// 测试 3: 检查 public 目录内容
console.log('\n测试 3: 检查 public 目录内容');
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  const indexPath = path.join(publicDir, 'index.html');
  const assetsPath = path.join(publicDir, 'assets');
  
  console.log(`  public/index.html: ${fs.existsSync(indexPath) ? '✓' : '✗'}`);
  console.log(`  public/assets/: ${fs.existsSync(assetsPath) ? '✓' : '✗'}`);
  
  if (fs.existsSync(assetsPath)) {
    const assets = fs.readdirSync(assetsPath);
    const jsFiles = assets.filter(f => f.endsWith('.js'));
    const cssFiles = assets.filter(f => f.endsWith('.css'));
    console.log(`  JS 文件数量: ${jsFiles.length}`);
    console.log(`  CSS 文件数量: ${cssFiles.length}`);
    
    // 检查 index.html 中引用的文件
    if (fs.existsSync(indexPath)) {
      const indexContent = fs.readFileSync(indexPath, 'utf-8');
      const jsMatch = indexContent.match(/src="\/assets\/(index-[^"]+\.js)"/);
      if (jsMatch) {
        const referencedJs = jsMatch[1];
        const jsExists = fs.existsSync(path.join(assetsPath, referencedJs));
        console.log(`  引用的 JS 文件: ${referencedJs} ${jsExists ? '✓' : '✗'}`);
      }
    }
  }
} else {
  console.log('  ⚠️  public 目录不存在');
}

console.log('\n=== 测试完成 ===');
