# Con-Nav-Item - 现代化个人导航站

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Vue](https://img.shields.io/badge/Vue.js-3-brightgreen.svg)](https://vuejs.org/)

现代化的个人导航站，提供美观的卡片式导航界面和强大的后台管理系统。

## 📸 界面预览

<div align="center">
  <img width="1859" alt="首页导航界面" src="https://github.com/user-attachments/assets/819633a6-2c05-4ab0-ae37-ad928703ef50" />
  <p><i>首页导航界面</i></p>
  
  <img width="1900" alt="后台管理界面" src="https://github.com/user-attachments/assets/7c909f50-8d9b-4287-a3be-98c9c0061b86" />
  <p><i>后台管理界面</i></p>
  
  <img width="1909" alt="备份管理功能" src="https://github.com/user-attachments/assets/71067bec-66c0-46b0-a54c-27d59c121d5d" />
  <p><i>备份管理功能</i></p>
  
  <img width="1830" alt="前端编辑界面" src="https://github.com/user-attachments/assets/c2d01a7a-b2ef-4ce6-b3a5-838f2df64dae" />
  <p><i>前端编辑界面</i></p>
</div>

## ✨ 功能特性

### 前端功能
- 🏠 **卡片式导航** - 美观现代的导航界面
- 🔍 **智能搜索** - 支持拼音搜索，输入首字母即可匹配中文卡片
- 🔍 **聚合搜索** - 支持 Google、百度、Bing、GitHub 等多引擎搜索
- 🎨 **自定义主题** - 渐变背景、一键切换壁纸
- 📱 **响应式设计** - 完美适配桌面端和移动端
- 🔗 **友情链接** - 展示和管理友情链接
- 📢 **广告位** - 可选的左右两侧广告展示
- 🚫 **重复检测** - 批量添加时自动标记重复卡片
- 📱 **PWA 支持** - 可安装为独立应用，离线访问

### 后台管理
- 👤 **用户管理** - 支持修改用户名和密码
- 📋 **栏目管理** - 主菜单和子菜单的增删改查
- 🃏 **卡片管理** - 导航卡片批量管理，拖拽排序
- 🔍 **搜索引擎** - 自定义搜索引擎配置
- 🏷️ **标签管理** - 创建和管理卡片标签，支持颜色自定义
- 🔄 **重复管理** - 一键检测和删除重复卡片
- 💾 **自动备份** - 智能增量备份 + 定时备份
- ☁️ **WebDAV 备份** - 支持坚果云、Nextcloud 等云备份

### 技术特性
- 🔐 **JWT 认证** - 安全的用户认证机制
- 🗄️ **SQLite 数据库** - 轻量级，无需额外配置
- 🎯 **PM2 部署** - 进程守护，开机自启
- 🐳 **Docker 支持** - 容器化部署
- 🔧 **一键部署** - 多平台自动化部署脚本

## 🚀 快速部署

### Serv00 / CT8 / Hostuno

**安装**：
```bash
# 使用默认域名
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-serv00.sh)

# 指定自定义域名
DOMAIN=your-domain.com bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-serv00.sh)
```

**重置**（会备份数据）：
```bash
# 使用默认域名
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/reset-serv00.sh)

# 指定自定义域名
DOMAIN=your-domain.com bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/reset-serv00.sh)
```

### Linux 服务器

**安装**：
```bash
# 一键安装（自动安装 Node.js 20 + PM2）
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-linux.sh)

# 自定义安装目录
INSTALL_DIR=/opt/Con-Nav-Item bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-linux.sh)
```

**卸载**（会备份数据）：
```bash
# 默认安装目录
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/uninstall-linux.sh)

# 自定义安装目录
INSTALL_DIR=/opt/Con-Nav-Item bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/uninstall-linux.sh)
```

**管理命令**：
```bash
pm2 status                # 查看运行状态
pm2 logs Con-Nav-Item     # 查看日志
pm2 restart Con-Nav-Item  # 重启应用
pm2 stop Con-Nav-Item     # 停止应用
```

### Docker

**快速启动**：
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

**使用 Docker Compose**：
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

启动：`docker-compose up -d`

**管理命令**：
```bash
docker ps                      # 查看容器状态
docker logs -f Con-Nav-Item    # 查看日志
docker restart Con-Nav-Item    # 重启容器
docker stop Con-Nav-Item       # 停止容器
docker rm -f Con-Nav-Item      # 删除容器
```

**更新到最新版本**：
```bash
docker stop Con-Nav-Item
docker rm Con-Nav-Item
docker pull ghcr.io/zczy-k/con-nav-item:latest
# 然后重新运行 docker run 命令
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
