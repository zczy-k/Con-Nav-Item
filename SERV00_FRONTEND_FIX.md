# Serv00 前端显示问题修复说明

## 🔍 问题诊断

在 Serv00 服务器上部署后，前端无法正常显示，表现为：
- 访问网站显示空白页面
- 浏览器控制台报错：无法加载 JS/CSS 文件
- 404 错误：找不到 `/assets/index-DGWAhcCq.js` 等静态资源

## 🎯 根本原因

**静态文件目录配置错误**：

1. **开发环境**：前端构建输出到 `web/dist/` 目录
2. **Git 仓库**：`web/dist/` 被 `.gitignore` 忽略（构建产物不应提交）
3. **生产部署**：预构建的前端文件存储在 `public/` 目录中
4. **问题所在**：`app.js` 硬编码使用 `web/dist/`，导致 Serv00 上找不到静态文件

## ✅ 解决方案

修改 `app.js`，实现**智能静态文件目录选择**：

```javascript
// 根据环境选择静态文件目录
// 开发环境使用 web/dist，生产环境（如 serv00）使用 public
const fs = require('fs');
const staticDir = fs.existsSync(path.join(__dirname, 'web/dist/index.html')) 
  ? path.join(__dirname, 'web/dist')
  : path.join(__dirname, 'public');

console.log(`✓ Using static files from: ${staticDir}`);
```

**逻辑说明**：
- 如果 `web/dist/index.html` 存在 → 使用 `web/dist`（开发环境）
- 如果不存在 → 使用 `public`（生产环境/Serv00）

## 🚀 部署步骤

### 方法 1：一键修复脚本（最简单）⭐

SSH 登录 Serv00 后执行：

```bash
# 使用默认域名
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/fix-serv00-frontend.sh)

# 或指定自定义域名
DOMAIN=your-domain.com bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/fix-serv00-frontend.sh)
```

**脚本会自动完成**：
1. ✅ 备份当前 app.js
2. ✅ 下载修复后的 app.js
3. ✅ 检查并下载 public 目录（如果缺失）
4. ✅ 重启应用
5. ✅ 测试访问

### 方法 2：重新部署（推荐）

SSH 登录 Serv00 后执行：

```bash
# 使用默认域名
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-serv00.sh)

# 或指定自定义域名
DOMAIN=your-domain.com bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-serv00.sh)
```

### 方法 3：手动更新现有部署

```bash
# 1. 进入项目目录
cd ~/domains/your-domain.com/public_nodejs

# 2. 备份当前 app.js
cp app.js app.js.backup

# 3. 下载修复后的 app.js
curl -s https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/app.js -o app.js

# 4. 确认 public 目录存在
ls -la public/

# 5. 重启应用
devil www restart your-domain.com

# 6. 等待 5 秒
sleep 5

# 7. 测试访问
curl -I https://your-domain.com
```

## 🔍 验证部署

### 1. 检查静态文件目录

```bash
cd ~/domains/your-domain.com/public_nodejs

# 检查 public 目录
ls -la public/
ls -la public/assets/ | head -20

# 应该看到 index.html 和 assets 目录
```

### 2. 检查应用日志

```bash
# 查看 Node.js 进程
ps aux | grep node20

# 查看应用启动日志（应该显示 "Using static files from: /path/to/public"）
devil www restart your-domain.com
sleep 2
# 日志会显示使用的静态文件目录
```

### 3. 测试前端访问

```bash
# 测试首页
curl -I https://your-domain.com

# 测试静态资源
curl -I https://your-domain.com/assets/index-DGWAhcCq.js

# 应该返回 200 状态码
```

### 4. 浏览器测试

1. 访问 `https://your-domain.com`
2. 打开浏览器开发者工具（F12）
3. 检查 Console 标签页，不应有 404 错误
4. 检查 Network 标签页，所有资源应成功加载（状态码 200）

## 📋 技术细节

### 目录结构对比

**开发环境**：
```
Con-Nav-Item/
├── web/
│   ├── dist/          ← 本地构建输出（不在 Git 中）
│   │   ├── index.html
│   │   └── assets/
│   └── src/
└── app.js             ← 使用 web/dist
```

**生产环境（Serv00）**：
```
public_nodejs/
├── public/            ← 预构建文件（在 Git 中）
│   ├── index.html
│   └── assets/
└── app.js             ← 使用 public
```

### 为什么不在 Serv00 上构建前端？

1. **资源限制**：Serv00 免费账户资源有限，前端构建耗时长
2. **依赖问题**：前端构建需要额外的 npm 包（Vite、Vue 等）
3. **效率考虑**：预构建文件可以直接使用，部署更快
4. **稳定性**：避免构建过程中的潜在错误

## 🎯 预期结果

修复后，应该能够：

1. ✅ 访问 `https://your-domain.com` 正常显示前端页面
2. ✅ 所有静态资源（JS、CSS、图片）正常加载
3. ✅ 浏览器控制台无 404 错误
4. ✅ 前端功能完全正常（导航、搜索、管理等）
5. ✅ 启动日志显示：`✓ Using static files from: /path/to/public`

## 🐛 故障排查

### 问题 1：仍然显示空白页面

```bash
# 检查 public 目录是否存在
ls -la ~/domains/your-domain.com/public_nodejs/public/

# 如果不存在，重新下载
cd ~/domains/your-domain.com/public_nodejs
curl -L https://github.com/zczy-k/Con-Nav-Item/archive/refs/heads/main.zip -o temp.zip
unzip -o temp.zip "Con-Nav-Item-main/public/*"
cp -r Con-Nav-Item-main/public ./
rm -rf Con-Nav-Item-main temp.zip
```

### 问题 2：404 错误持续

```bash
# 检查 index.html 中引用的 JS 文件是否存在
grep "assets/index-" ~/domains/your-domain.com/public_nodejs/public/index.html
ls -la ~/domains/your-domain.com/public_nodejs/public/assets/index-*.js

# 如果文件名不匹配，可能需要重新构建
```

### 问题 3：进程无法启动

```bash
# 查看详细错误
cd ~/domains/your-domain.com/public_nodejs
node app.js

# 检查端口配置
cat .env | grep PORT
devil port list
```

## 📝 相关文档

- [Serv00 部署修复说明](SERV00_FIX.md) - 端口和监听地址问题
- [项目 README](README.md) - 完整部署指南
- [GitHub Issues](https://github.com/zczy-k/Con-Nav-Item/issues) - 问题反馈

## 🔄 更新历史

- **2025-01-XX**：修复静态文件目录配置问题，支持自动选择 `web/dist` 或 `public`
