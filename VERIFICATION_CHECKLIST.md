# Serv00 部署验证清单

使用此清单验证您的 Con-Nav-Item 部署是否正常工作。

## ✅ 基础检查

### 1. 文件结构检查

SSH 登录后执行：

```bash
cd ~/domains/your-domain.com/public_nodejs

# 检查关键文件
ls -la app.js          # 应该存在
ls -la package.json    # 应该存在
ls -la .env            # 应该存在
ls -la database/       # 应该存在
ls -la public/         # 应该存在
```

**预期结果**：
```
✓ app.js 存在
✓ package.json 存在
✓ .env 存在
✓ database/ 目录存在
✓ public/ 目录存在
```

### 2. 前端文件检查

```bash
# 检查 public 目录内容
ls -la public/index.html
ls -la public/assets/ | head -10

# 检查 JS 文件数量
ls -1 public/assets/*.js | wc -l
```

**预期结果**：
```
✓ public/index.html 存在
✓ public/assets/ 目录存在
✓ 至少有 50+ 个 JS 文件
```

### 3. 端口配置检查

```bash
# 查看分配的端口
devil port list

# 查看 .env 中的端口配置
cat .env | grep PORT
```

**预期结果**：
```
✓ devil port list 显示一个 tcp 端口
✓ .env 中的 PORT 与 devil 分配的端口一致
```

### 4. 进程检查

```bash
# 查看 Node.js 进程
ps aux | grep node20

# 查看进程监听的端口
netstat -tlnp 2>/dev/null | grep node
```

**预期结果**：
```
✓ 有 node20 进程在运行
✓ 进程监听在 127.0.0.1:端口
```

## 🌐 网络访问检查

### 5. 本地访问测试

```bash
# 获取端口
ASSIGNED_PORT=$(devil port list | awk '$2 == "tcp" {print $1; exit}')

# 测试本地访问
curl -I http://localhost:${ASSIGNED_PORT}

# 测试 API
curl http://localhost:${ASSIGNED_PORT}/api/menus
```

**预期结果**：
```
✓ HTTP/1.1 200 OK
✓ API 返回 JSON 数据
```

### 6. 外部访问测试

```bash
# 测试 HTTPS 访问
curl -I https://your-domain.com

# 测试静态资源
curl -I https://your-domain.com/assets/index-DGWAhcCq.js

# 测试 API
curl https://your-domain.com/api/menus
```

**预期结果**：
```
✓ HTTP/2 200
✓ 静态资源返回 200
✓ API 返回 JSON 数据
```

## 🖥️ 浏览器检查

### 7. 前端页面检查

1. 打开浏览器访问 `https://your-domain.com`
2. 按 F12 打开开发者工具

**Console 标签页**：
```
✓ 无红色错误信息
✓ 无 404 错误
✓ 无 CORS 错误
```

**Network 标签页**：
```
✓ index.html - 状态码 200
✓ index-xxx.js - 状态码 200
✓ 所有 CSS 文件 - 状态码 200
✓ /api/menus - 状态码 200
```

**Elements 标签页**：
```
✓ <div id="app"> 内有内容（不是空的）
✓ 页面显示导航卡片
```

### 8. 功能测试

在浏览器中测试以下功能：

```
✓ 页面正常显示导航卡片
✓ 搜索框可以输入
✓ 点击卡片可以跳转
✓ 切换菜单正常工作
✓ 访问 /admin 显示登录页面
✓ 登录后台管理正常
```

## 🔧 应用日志检查

### 9. 启动日志检查

```bash
# 重启应用并查看日志
devil www restart your-domain.com
sleep 3

# 查看进程输出（如果有日志文件）
# 或者检查 devil 的日志
```

**预期日志内容**：
```
✓ Using static files from: /path/to/public
✓ Server running on http://127.0.0.1:端口
✓ Database initialized successfully
```

### 10. 错误日志检查

```bash
# 检查是否有错误日志
ls -la ~/logs/ 2>/dev/null
```

**预期结果**：
```
✓ 无错误日志文件
✓ 或错误日志为空
```

## 📊 性能检查

### 11. 响应时间测试

```bash
# 测试首页响应时间
time curl -s https://your-domain.com > /dev/null

# 测试 API 响应时间
time curl -s https://your-domain.com/api/menus > /dev/null
```

**预期结果**：
```
✓ 首页响应时间 < 2 秒
✓ API 响应时间 < 1 秒
```

### 12. 资源加载测试

在浏览器开发者工具的 Network 标签页中：

```
✓ 总加载时间 < 5 秒
✓ DOMContentLoaded < 2 秒
✓ Load < 3 秒
```

## 🎯 完整性检查

### 13. 数据库检查

```bash
# 检查数据库文件
ls -lh database/nav.db

# 检查数据库内容（需要 sqlite3）
sqlite3 database/nav.db "SELECT COUNT(*) FROM users;"
sqlite3 database/nav.db "SELECT COUNT(*) FROM menus;"
```

**预期结果**：
```
✓ nav.db 文件存在且大小 > 0
✓ 至少有 1 个用户
✓ 至少有 1 个菜单
```

### 14. 备份功能检查

登录后台管理 → 备份管理：

```
✓ 可以创建备份
✓ 可以下载备份
✓ 备份文件列表正常显示
```

## 🚨 常见问题排查

### 问题 1：空白页面

**检查**：
```bash
ls -la public/index.html
ls -la public/assets/
```

**解决**：
```bash
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/fix-serv00-frontend.sh)
```

### 问题 2：524 超时

**检查**：
```bash
ps aux | grep node20
devil port list
cat .env | grep PORT
```

**解决**：参考 [SERV00_FIX.md](SERV00_FIX.md)

### 问题 3：404 错误

**检查**：
```bash
curl -I https://your-domain.com/assets/index-DGWAhcCq.js
```

**解决**：
```bash
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/fix-serv00-frontend.sh)
```

### 问题 4：API 错误

**检查**：
```bash
curl https://your-domain.com/api/menus
```

**解决**：
```bash
cd ~/domains/your-domain.com/public_nodejs
node app.js  # 查看详细错误
```

## 📝 验证报告模板

完成所有检查后，您可以使用此模板报告问题：

```
## 部署环境
- 平台: Serv00 / CT8 / Hostuno
- 域名: your-domain.com
- Node 版本: node20

## 检查结果
- [ ] 文件结构正常
- [ ] 前端文件存在
- [ ] 端口配置正确
- [ ] 进程运行正常
- [ ] 本地访问正常
- [ ] 外部访问正常
- [ ] 浏览器显示正常
- [ ] 功能测试通过

## 问题描述
（如果有问题，请详细描述）

## 错误日志
（粘贴相关错误日志）
```

## 🎉 全部通过？

恭喜！您的 Con-Nav-Item 已成功部署并正常运行！

现在您可以：
1. 🎨 自定义导航卡片
2. 🔍 配置搜索引擎
3. 💾 设置自动备份
4. 📱 安装 PWA 应用

享受您的个人导航站吧！ 🚀
