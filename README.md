# Con-Nav-Item - 现代化个人导航站

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Vue](https://img.shields.io/badge/Vue.js-3-brightgreen.svg)](https://vuejs.org/)

现代化的个人导航站，提供美观的卡片式导航界面、强大的后台管理系统和功能丰富的浏览器扩展。

## 🎉 推荐：安装浏览器扩展

> **💡 强烈推荐安装浏览器扩展！** 扩展可以让你：
> - 🚀 **右键快速添加** - 浏览任意网页时，右键即可添加到导航站
> - 📌 **新标签页导航** - 打开新标签页直接显示你的导航站
> - 🔖 **书签云同步** - 将浏览器书签备份到导航站服务器
> - ⚡ **一键收藏** - 网页右下角浮动按钮，一键添加当前页面
>
> 👉 [查看扩展安装方法](#-浏览器扩展安装)

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

### 🏠 前端导航

- **卡片式导航** - 美观现代的渐变卡片界面，支持拖拽排序
- **多级菜单** - 支持主菜单和子菜单，点击主菜单显示所有子菜单卡片
- **智能搜索** - 支持拼音搜索，输入首字母即可匹配中文卡片
- **聚合搜索** - 内置 Google、百度、Bing、GitHub 等多引擎，支持自定义搜索引擎
- **动态壁纸** - 支持随机壁纸、自定义壁纸URL
- **响应式设计** - 完美适配桌面端和移动端
- **友情链接** - 底部展示友情链接
- **宣传位** - 可选的左右两侧宣传展示区域
- **PWA 支持** - 可安装为独立应用，支持离线访问
- **前端编辑模式** - 无需进入后台，直接在首页进行以下操作：
  - 编辑、删除、拖拽排序卡片
  - 添加、编辑、删除主菜单和子菜单
  - 拖拽调整主菜单顺序
  - 上下移动调整子菜单顺序
  - 批量添加网站
- **实时同步** - 通过浏览器扩展添加卡片后，页面立即刷新显示

### 🔧 后台管理

- **用户管理** - 修改管理员用户名和密码
- **栏目管理** - 主菜单和子菜单的增删改查，支持拖拽排序
- **卡片管理** - 导航卡片批量管理，支持按分类筛选
- **标签管理** - 创建和管理卡片标签，支持颜色自定义
- **搜索引擎** - 自定义搜索引擎配置，支持解析URL自动填充
- **友链管理** - 管理友情链接
- **宣传管理** - 管理左右两侧宣传位内容
- **重复检测** - 一键检测和删除重复卡片
- **备份管理** - 本地备份 + WebDAV 云备份（支持坚果云、Nextcloud 等）
- **自动备份** - 智能增量备份（防抖延迟可配置）+ 定时备份

### 🌐 浏览器扩展

功能强大的浏览器扩展，支持 Chrome/Edge/Brave/Firefox 127+ 等浏览器。

#### 新标签页模式
- **导航站模式** - 新标签页直接显示你的导航站
- **快速访问面板** - 基于浏览历史的智能书签面板，显示常用/最近/固定书签

#### 快速添加网站
- **右键菜单添加** - 在任意网页右键，选择分类快速添加到导航站
- **浮动快捷按钮** - 网页右下角浮动按钮，一键添加当前页面
- **智能标签生成** - 自动根据网站域名、标题生成标签
- **编辑后添加** - 添加前可编辑书签标题
- **实时同步** - 添加后导航站页面立即刷新显示新卡片

#### 书签管理器
- **本地书签管理** - 查看、搜索、编辑浏览器书签
- **智能排序** - 按使用频率、最近访问、字母顺序排序
- **标签系统** - 为书签添加自定义标签，支持标签筛选
- **笔记功能** - 为书签添加备注笔记
- **批量操作** - 批量添加到导航站、批量删除、批量打标签
- **热门书签** - 自动更新热门书签文件夹
- **重复检测** - 检测并清理重复书签

#### 云端同步
- **书签云备份** - 将浏览器书签备份到导航站服务器
- **多设备同步** - 在不同设备间同步书签数据
- **自动同步** - 支持定时自动同步

### 🔐 安全特性

- **JWT 认证** - 安全的用户认证机制
- **密码加密** - bcrypt 加密存储密码
- **Token 过期** - 自动过期的访问令牌
- **安全中间件** - XSS 防护、请求限流
- **加密密钥持久化** - WebDAV 配置加密密钥存储在数据库，容器重启后配置不丢失

### 🗄️ 数据管理

- **SQLite 数据库** - 轻量级，无需额外配置
- **自动备份** - 支持本地备份和 WebDAV 云备份
- **数据导入导出** - 支持备份文件的导入导出
- **增量备份** - 智能检测变化，只备份有变动的数据
- **防抖备份** - 数据变更后延迟备份，避免频繁写入（默认5分钟）

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
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/reset-serv00.sh)
```

### Linux 服务器

**安装**：
```bash
# 一键安装（自动安装 Node.js 20 + PM2）
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-linux.sh)

# 自定义安装目录
INSTALL_DIR=/opt/Con-Nav-Item bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-linux.sh)
```

**管理命令**：
```bash
pm2 status                # 查看运行状态
pm2 logs Con-Nav-Item     # 查看日志
pm2 restart Con-Nav-Item  # 重启应用
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

**Docker Compose**：
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
cd web && npm install && npm run build && cd ..
npm start
```

## 🎯 访问应用

- **首页**：`http://your-server:3000`
- **后台管理**：`http://your-server:3000/admin`
- **默认账号**：admin / 123456

⚠️ **首次登录后请立即修改密码！**

## 📱 浏览器扩展安装

> **💡 安装扩展后，你可以更方便地管理导航站！**

### Chrome / Edge / Brave

1. 下载本项目的 `browser-extension` 文件夹
2. 打开 `chrome://extensions/`（Edge 用 `edge://extensions/`）
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `browser-extension` 文件夹

### Firefox 127+

1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击"临时载入附加组件"
3. 选择 `browser-extension/manifest.json`

### 扩展配置

1. 点击扩展图标，进入设置
2. 输入你的导航站地址（如 `https://your-domain.com`）
3. 输入管理员密码进行验证
4. 选择新标签页模式（导航站/快速访问面板）
5. 在书签管理器中配置云备份（可选）

### 扩展使用技巧

- **快速添加**：浏览网页时，右键选择"添加到导航站"，选择分类即可
- **一键收藏**：点击网页右下角的浮动按钮快速添加
- **新标签页**：设置后，每次打开新标签页都是你的导航站
- **书签同步**：在书签管理器中开启云同步，多设备共享书签

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

### 自定义搜索引擎

支持添加自定义搜索引擎，只需提供搜索URL，系统会自动解析图标和名称。

详见 [自定义搜索引擎文档](docs/custom-search-engine.md)

### 前端编辑模式

1. 点击首页右下角的"+"按钮
2. 选择"编辑模式"进入
3. 输入管理员密码验证
4. 现在可以：
   - 拖拽卡片调整顺序
   - 点击卡片上的编辑/删除按钮
   - 悬停菜单显示操作按钮（编辑/删除）
   - 拖拽主菜单调整顺序
   - 点击子菜单的上下箭头调整顺序
5. 点击空白区域或"×"按钮退出编辑模式

## 🛠️ 技术栈

| 类别 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite + Sortable.js |
| 后端 | Node.js + Express |
| 数据库 | SQLite (better-sqlite3) |
| 认证 | JWT + bcrypt |
| 部署 | PM2 / Docker / Passenger |
| 扩展 | Chrome Extension Manifest V3 |

## 📄 许可证

本项目采用 **Apache License 2.0** 开源许可证。

基于 [nav-item](https://github.com/eooce/nav-item) by eooce 开发，所有代码（包括原始代码和新增功能）均为开源。

**你可以：**
- ✅ 免费使用（个人或商业）
- ✅ 修改源代码
- ✅ 分发原版或修改版
- ✅ 用于商业项目

**你需要：**
- 📋 保留版权声明和许可证
- 📋 说明你做了哪些修改
- 📋 包含 NOTICE 文件

详细信息请查看 [LICENSE](LICENSE) 和 [NOTICE](NOTICE) 文件。

## 🔗 链接

- [GitHub](https://github.com/zczy-k/Con-Nav-Item)
- [问题反馈](https://github.com/zczy-k/Con-Nav-Item/issues)

---

⭐ 如果这个项目对你有帮助，请给它一个星标！
