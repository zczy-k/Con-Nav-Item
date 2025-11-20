# Con-Nav-Item - 个人导航站

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)

现代化的个人导航站，支持卡片式导航、智能搜索、自定义主题等功能。

## ✨ 主要功能

- 🏠 卡片式导航界面
- 🔍 智能搜索（支持拼音）
- 🎨 自定义主题和壁纸
- 📱 响应式设计
- 🔐 JWT 认证
- 💾 自动备份（本地 + WebDAV）
- 📱 PWA 支持

## 🚀 快速部署

### Serv00 / CT8 / Hostuno

```bash
# 使用默认域名
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-serv00.sh)

# 指定自定义域名
DOMAIN=your-domain.com bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-serv00.sh)
```

### Linux 服务器

```bash
# 一键安装（自动安装 Node.js 20 + PM2）
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-linux.sh)

# 自定义安装目录
INSTALL_DIR=/opt/Con-Nav-Item bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-linux.sh)
```

### Docker

```bash
docker run -d \
  --name Con-Nav-Item \
  -p 3000:3000 \
  -v $(pwd)/database:/app/database \
  -v $(pwd)/backups:/app/backups \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=123456 \
  --restart unless-stopped \
  ghcr.io/zczy-k/con-nav-item:latest
```

或使用 Docker Compose：

```yaml
version: '3'
services:
  Con-Nav-Item:
    image: ghcr.io/zczy-k/con-nav-item:latest
    container_name: Con-Nav-Item
    ports:
      - "3000:3000"
    environment:
      - ADMIN_USERNAME=admin
      - ADMIN_PASSWORD=123456
    volumes:
      - ./database:/app/database
      - ./backups:/app/backups
    restart: unless-stopped
```

### 源码部署

```bash
git clone https://github.com/zczy-k/Con-Nav-Item.git
cd Con-Nav-Item
npm install
cd web && npm install && npm run build:prod && cd ..
npm start
```

## 🎯 访问应用

- **首页**：`http://your-server:3000`
- **后台管理**：`http://your-server:3000/admin`
- **默认账号**：admin / 123456

⚠️ **首次登录后请立即修改密码！**

## 🔧 常见问题

### Serv00 部署问题

如果遇到 524 错误或前端无法显示，查看 [SERV00_FIX.md](SERV00_FIX.md)

### 密码管理

```bash
# 检查密码
node check-password.js check

# 重置密码
node check-password.js reset 新密码
```

Docker 环境：
```bash
docker exec -it Con-Nav-Item node check-password.js reset 新密码
```

## 📱 浏览器扩展

将导航站设为浏览器新标签页，支持快速添加网站。

安装方法：
1. 打开 `chrome://extensions/`
2. 开启"开发者模式"
3. 加载 `browser-extension` 文件夹

## 🛠️ 技术栈

- **前端**：Vue 3 + Vite
- **后端**：Node.js + Express
- **数据库**：SQLite
- **部署**：PM2 / Docker / Passenger

## 📄 许可证

Apache License 2.0 - 查看 [LICENSE](LICENSE)

基于 [nav-item](https://github.com/eooce/nav-item) by eooce

## 🔗 链接

- [GitHub](https://github.com/zczy-k/Con-Nav-Item)
- [问题反馈](https://github.com/zczy-k/Con-Nav-Item/issues)

---

⭐ 如果这个项目对你有帮助，请给它一个星标！
