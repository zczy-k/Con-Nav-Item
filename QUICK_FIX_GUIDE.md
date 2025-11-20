# 🚀 Serv00 快速修复指南

## 问题：前端无法显示（空白页面）

### 症状
- ✗ 访问网站显示空白页面
- ✗ 浏览器控制台报 404 错误
- ✗ 无法加载 JS/CSS 文件

### 原因
静态文件目录配置错误（app.js 使用了不存在的 `web/dist` 目录）

---

## 🎯 解决方案（3 选 1）

### 方案 1：一键修复脚本 ⭐ 推荐

**最快速、最简单**

```bash
# SSH 登录 Serv00 后执行
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/fix-serv00-frontend.sh)
```

**自定义域名**：
```bash
DOMAIN=your-domain.com bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/fix-serv00-frontend.sh)
```

**耗时**：约 30 秒

---

### 方案 2：手动修复

**适合想了解细节的用户**

```bash
# 1. 进入项目目录
cd ~/domains/your-domain.com/public_nodejs

# 2. 备份当前文件
cp app.js app.js.backup

# 3. 下载修复后的 app.js
curl -s https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/app.js -o app.js

# 4. 确认 public 目录存在
ls -la public/

# 5. 如果 public 不存在，下载它
if [ ! -d "public" ]; then
  curl -L https://github.com/zczy-k/Con-Nav-Item/archive/refs/heads/main.zip -o temp.zip
  unzip -o temp.zip "Con-Nav-Item-main/public/*"
  mv Con-Nav-Item-main/public ./
  rm -rf Con-Nav-Item-main temp.zip
fi

# 6. 重启应用
devil www restart your-domain.com

# 7. 等待 5 秒
sleep 5

# 8. 测试
curl -I https://your-domain.com
```

**耗时**：约 2 分钟

---

### 方案 3：完全重新安装

**适合想要全新安装的用户**

```bash
# 会备份数据，然后重新安装
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-serv00.sh)
```

**自定义域名**：
```bash
DOMAIN=your-domain.com bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-serv00.sh)
```

**耗时**：约 3-5 分钟

---

## ✅ 验证修复

### 快速验证

```bash
# 1. 检查进程
ps aux | grep node20

# 2. 测试访问
curl -I https://your-domain.com

# 3. 测试静态资源
curl -I https://your-domain.com/assets/index-DGWAhcCq.js
```

**预期结果**：
```
✓ 有 node20 进程在运行
✓ 首页返回 200 状态码
✓ 静态资源返回 200 状态码
```

### 浏览器验证

1. 访问 `https://your-domain.com`
2. 按 F12 打开开发者工具
3. 检查 Console 标签页

**预期结果**：
```
✓ 页面正常显示
✓ 无 404 错误
✓ 无红色错误信息
```

---

## 🐛 仍然有问题？

### 问题 1：public 目录不存在

```bash
cd ~/domains/your-domain.com/public_nodejs
curl -L https://github.com/zczy-k/Con-Nav-Item/archive/refs/heads/main.zip -o temp.zip
unzip -o temp.zip "Con-Nav-Item-main/public/*"
mv Con-Nav-Item-main/public ./
rm -rf Con-Nav-Item-main temp.zip
devil www restart your-domain.com
```

### 问题 2：进程未运行

```bash
# 查看详细错误
cd ~/domains/your-domain.com/public_nodejs
node app.js
```

### 问题 3：端口配置错误

```bash
# 检查端口
devil port list
cat .env | grep PORT

# 如果不一致，修复端口
ASSIGNED_PORT=$(devil port list | awk '$2 == "tcp" {print $1; exit}')
sed -i "s/PORT=.*/PORT=$ASSIGNED_PORT/" .env
devil www restart your-domain.com
```

### 问题 4：524 超时错误

参考 [SERV00_FIX.md](SERV00_FIX.md) 中的端口和监听地址修复。

---

## 📚 详细文档

- [完整修复说明](SERV00_FRONTEND_FIX.md) - 详细的问题诊断和解决方案
- [验证清单](VERIFICATION_CHECKLIST.md) - 完整的部署验证步骤
- [更新日志](CHANGELOG_FRONTEND_FIX.md) - 技术细节和修改内容
- [Serv00 部署修复](SERV00_FIX.md) - 端口和监听地址问题

---

## 💡 预防措施

### 首次部署

使用最新的安装脚本，已包含所有修复：

```bash
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-serv00.sh)
```

### 定期检查

```bash
# 检查应用状态
ps aux | grep node20
curl -I https://your-domain.com

# 如果异常，重启应用
devil www restart your-domain.com
```

---

## 📞 获取帮助

如果以上方法都无法解决问题：

1. 查看 [验证清单](VERIFICATION_CHECKLIST.md) 进行完整检查
2. 在 [GitHub Issues](https://github.com/zczy-k/Con-Nav-Item/issues) 提交问题
3. 提供以下信息：
   - 平台（Serv00/CT8/Hostuno）
   - 域名
   - 错误日志
   - 验证清单结果

---

## 🎉 成功部署后

访问您的导航站：
- 🏠 首页：`https://your-domain.com`
- 🔐 后台：`https://your-domain.com/admin`
- 📱 安装 PWA：浏览器地址栏的安装图标

默认账号：`admin` / `123456`（请立即修改密码！）

---

**祝您使用愉快！** 🚀
