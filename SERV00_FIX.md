# Serv00 部署修复说明

## 🔧 修复内容

本次修复解决了在 Serv00 服务器上部署时出现的问题。

### 问题原因

1. **监听地址错误**：`app.listen(PORT, '127.0.0.1')` 在 Passenger 环境下无法工作
   - Serv00 使用 Phusion Passenger 管理 Node.js 应用
   - Passenger 需要应用监听所有接口（不指定 IP）
   - 绑定到 `127.0.0.1` 导致 Passenger 无法连接，出现 524 错误

2. **静态文件目录**：`web/dist` 目录在 Git 仓库中被忽略
   - 应使用预构建的 `public` 目录

### 修复内容

#### 1. 修改 `app.js` - 移除 IP 绑定

**修改前：**
```javascript
app.listen(PORT, '127.0.0.1', () => {
  console.log(`✓ Server running on http://127.0.0.1:${PORT}`);
});
```

**修改后：**
```javascript
// 不指定 IP，让 Passenger 管理（兼容 Serv00）
app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
});
```

#### 2. 修改 `app.js` - 智能选择静态文件目录

```javascript
// 根据环境选择静态文件目录
const fs = require('fs');
const staticDir = fs.existsSync(path.join(__dirname, 'web/dist/index.html')) 
  ? path.join(__dirname, 'web/dist')
  : path.join(__dirname, 'public');

console.log(`✓ Using static files from: ${staticDir}`);
```

#### 3. 修改 `scripts/install-serv00.sh` - 自动获取端口

```bash
# 获取 devil 分配的 TCP 端口
ASSIGNED_PORT=$(devil port list | awk '$2 == "tcp" {print $1; exit}')

if [ -z "$ASSIGNED_PORT" ]; then
    # 如果没有端口，尝试添加
    devil port add tcp random
    ASSIGNED_PORT=$(devil port list | awk '$2 == "tcp" {print $1; exit}')
fi

# 创建 .env 文件，包含 PORT
cat > "${WORKDIR}/.env" <<EOF
ADMIN_USERNAME=admin
ADMIN_PASSWORD=123456
NODE_ENV=production
JWT_SECRET=${JWT_SECRET}
PORT=${ASSIGNED_PORT}
EOF
```

## 🚀 重新部署步骤

### 方法 1：完全重新安装（推荐）

```bash
# SSH 登录 Serv00 后执行
DOMAIN=nav.166889.xyz bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-serv00.sh)
```

### 方法 2：手动更新现有部署

```bash
# 1. 停止当前应用
pkill -f node20

# 2. 获取分配的端口
ASSIGNED_PORT=$(devil port list | awk '$2 == "tcp" {print $1; exit}')
echo "分配的端口: $ASSIGNED_PORT"

# 3. 更新 .env 文件
cd ~/domains/nav.166889.xyz/public_nodejs
sed -i "s/PORT=.*/PORT=$ASSIGNED_PORT/" .env

# 4. 备份并下载新的 app.js
cp app.js app.js.old
curl -s https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/app.js -o app.js

# 5. 重启应用
devil www restart nav.166889.xyz

# 6. 等待 5 秒
sleep 5

# 7. 测试
curl http://localhost:$ASSIGNED_PORT/api/menus
curl -I https://nav.166889.xyz/api/menus
```

## ✅ 验证部署

执行以下命令验证部署是否成功：

```bash
# 1. 检查端口
devil port list

# 2. 检查进程
ps aux | grep node20

# 3. 检查 .env 配置
cat ~/domains/nav.166889.xyz/public_nodejs/.env | grep PORT

# 4. 测试本地 API
ASSIGNED_PORT=$(devil port list | awk '$2 == "tcp" {print $1; exit}')
curl http://localhost:$ASSIGNED_PORT/api/menus

# 5. 测试外部访问
curl -I https://nav.166889.xyz/api/menus
```

## 🔍 故障排查

### 问题 1：前端无法显示（空白页面）

**症状**：访问网站显示空白页面，浏览器控制台报 404 错误

**原因**：静态文件目录配置问题

**解决**：
```bash
# 一键修复
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/fix-serv00-frontend.sh)
```

或手动修复：
```bash
cd ~/domains/your-domain.com/public_nodejs
cp app.js app.js.backup
curl -s https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/app.js -o app.js
devil www restart your-domain.com
```

### 问题 2：找不到 TCP 端口

```bash
devil port list
# 如果没有 tcp 端口，添加一个
devil port add tcp random
```

### 问题 3：应用无法启动

```bash
cd ~/domains/nav.166889.xyz/public_nodejs

# 查看详细错误
ASSIGNED_PORT=$(devil port list | awk '$2 == "tcp" {print $1; exit}')
PORT=$ASSIGNED_PORT node app.js
```

### 问题 4：524 超时错误持续

```bash
# 检查进程是否在运行
ps aux | grep node20

# 检查进程监听的端口
netstat -tlnp 2>/dev/null | grep node

# 重启应用
devil www restart nav.166889.xyz
```

## 📋 技术说明

### Serv00 平台特性

1. **端口限制**：不允许直接监听 `0.0.0.0`，必须绑定到 `127.0.0.1`
2. **端口分配**：通过 `devil port list` 查看系统分配的端口
3. **反向代理**：Devil 自动将外部请求代理到本地端口
4. **进程管理**：通过 `devil www restart` 管理应用

### 关键配置

- **监听地址**：`127.0.0.1`（不能是 `0.0.0.0`）
- **端口来源**：从 `devil port list` 获取（不能硬编码）
- **环境变量**：必须在 `.env` 中设置正确的 `PORT`

## 🎯 预期结果

修复后，应该能够：

1. ✅ 访问 `https://nav.166889.xyz` 正常显示前端页面
2. ✅ API 请求返回 200 状态码（不再是 524）
3. ✅ Node.js 进程稳定运行在 devil 分配的端口上
4. ✅ 所有功能正常工作（菜单、卡片、搜索等）

## 📝 相关链接

- [Con-Nav-Item GitHub](https://github.com/zczy-k/Con-Nav-Item)
- [原始项目 nav-item](https://github.com/eooce/nav-item)
- [Serv00 文档](https://wiki.serv00.com/)
