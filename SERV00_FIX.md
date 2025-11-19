# Serv00 部署修复说明

## 🔧 修复内容

本次修复解决了在 Serv00 服务器上部署时出现 **524 超时错误** 的问题。

### 问题原因

1. **端口配置错误**：脚本硬编码 `PORT=3000`，但 Serv00 需要使用 devil 分配的随机端口
2. **监听地址错误**：`app.listen(PORT)` 默认绑定 `0.0.0.0`，在 Serv00 上会导致 `EPERM: operation not permitted` 错误

### 修复内容

#### 1. 修改 `app.js` (第 137-140 行)

**修改前：**
```javascript
app.listen(PORT);
```

**修改后：**
```javascript
// 绑定到 127.0.0.1 以兼容 Serv00 等平台
app.listen(PORT, '127.0.0.1', () => {
  console.log(`✓ Server running on http://127.0.0.1:${PORT}`);
});
```

#### 2. 修改 `scripts/install-serv00.sh` (第 278-306 行)

**修改前：**
```bash
cat > "${WORKDIR}/.env" <<EOF
PORT=3000
ADMIN_USERNAME=admin
...
EOF
```

**修改后：**
```bash
# 获取 devil 分配的 TCP 端口
ASSIGNED_PORT=$(devil port list | awk '$2 == "tcp" {print $1; exit}')

if [ -z "$ASSIGNED_PORT" ]; then
    red "错误: 未找到分配的 TCP 端口\n"
    yellow "请运行: devil port add tcp random\n"
    exit 1
fi

green "✓ 使用端口: ${ASSIGNED_PORT}\n"

cat > "${WORKDIR}/.env" <<EOF
PORT=${ASSIGNED_PORT}
ADMIN_USERNAME=admin
...
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

### 问题 1：找不到 TCP 端口

```bash
devil port list
# 如果没有 tcp 端口，添加一个
devil port add tcp random
```

### 问题 2：应用无法启动

```bash
cd ~/domains/nav.166889.xyz/public_nodejs

# 查看详细错误
ASSIGNED_PORT=$(devil port list | awk '$2 == "tcp" {print $1; exit}')
PORT=$ASSIGNED_PORT node app.js
```

### 问题 3：524 超时错误持续

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
