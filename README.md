# Con-Nav-Item - 现代化个人导航站

<div align="center">

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Vue](https://img.shields.io/badge/Vue.js-3-brightgreen.svg)](https://vuejs.org/)

[问题反馈](https://github.com/zczy-k/Con-Nav-Item/issues)

</div>

## ✨ 特色功能

### 前端特性
- 🏠 **卡片式导航** - 美观现代的导航界面
- 🔍 **智能添加** - 前端自动添加导航卡片
- 🔍 **智能搜索** - 支持拼音搜索，输入首字母即可匹配中文卡片
- 🔍 **聚合搜索** - 支持 Google、百度、Bing、GitHub 等多引擎搜索
- 🎨 **自定义主题** - 渐变背景、一键切换壁纸
- 📱 **响应式设计** - 完美适配桌面端和移动端
- 🔗 **友情链接** - 展示和管理友情链接
- 📢 **广告位** - 可选的左右两侧广告展示
- 🚫 **重复检测** - 批量添加时自动标记重复卡片，防止重复导入

### 后台管理
- 👤 **用户管理** - 支持修改用户名和密码
- 📋 **栏目管理** - 主菜单和子菜单的增删改查
- 🃏 **卡片管理** - 导航卡片批量管理，拖拽排序
- 🔍 **搜索引擎** - 自定义搜索引擎配置
- 🏷️ **标签管理** - 创建和管理卡片标签，支持颜色自定义
- 🔄 **重复管理** - 一键检测和删除重复卡片
- 💾 **自动备份** - 智能增量备份 + 定时备份
- ☁️ **WebDAV备份** - 支持坚果云、Nextcloud 等云备份

### 技术特性
- 🔐 **JWT认证** - 安全的用户认证机制
- 🗄️ **SQLite数据库** - 轻量级，无需额外配置
- 🎯 **PM2部署** - 进程守护，开机自启
- 🐳 **Docker支持** - 容器化部署
- 🔧 **一键部署** - 多平台自动化部署脚本
- 📱 **PWA 支持** - 可安装为独立应用，离线访问

## 📸 界面预览

<div align="center">
  <img width="1859" height="890" alt="image" src="https://github.com/user-attachments/assets/819633a6-2c05-4ab0-ae37-ad928703ef50" />
  <p><i>首页导航界面</i></p>
  <img width="1900" height="891" alt="image" src="https://github.com/user-attachments/assets/7c909f50-8d9b-4287-a3be-98c9c0061b86" />
  <p><i>后台管理界面</i></p>
  <img width="1909" height="842" alt="image" src="https://github.com/user-attachments/assets/71067bec-66c0-46b0-a54c-27d59c121d5d" />
  <p><i>后台备份功能</i></p>
  <img width="1830" height="878" alt="image" src="https://github.com/user-attachments/assets/c2d01a7a-b2ef-4ce6-b3a5-838f2df64dae" />
  <p><i>前端编辑界面</i></p>


</div>

## 🚀 快速开始

### 方式一：Linux 服务器一键部署（推荐）

支持 Ubuntu、Debian、CentOS、RHEL、Fedora 等主流发行版。

**默认安装：**
```bash
# 一键安装（自动安装 Node.js 20 + PM2）
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-linux.sh)
```

**自定义安装目录：**
```bash
INSTALL_DIR=/opt/Con-Nav-Item bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-linux.sh)
```

> 💡 **安装过程**：脚本会自动安装依赖、构建前端，并引导你设置管理员账号和强密码

**安装后管理命令：**
```bash
pm2 status                # 查看运行状态
pm2 logs Con-Nav-Item     # 查看日志
pm2 restart Con-Nav-Item  # 重启应用
pm2 stop Con-Nav-Item     # 停止应用
```

**卸载应用：**
```bash
# 一键卸载（自动备份数据）
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/uninstall-linux.sh)

# 自定义安装目录卸载
INSTALL_DIR=/opt/Con-Nav-Item bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/uninstall-linux.sh)
```

> 💡 **提示**：卸载脚本会自动备份数据到 `~/Con-Nav-Item_uninstall_backup_*` 目录，包括数据库、上传文件和配置文件

### 方式二：Docker 部署

#### 快速部署

**1. 拉取最新镜像**
```bash
docker pull ghcr.io/zczy-k/con-nav-item:latest
```

**2. 启动容器**
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

> 💡 **新特性**：
> - 容器启动时会**自动创建**所有必需目录（database, backups, config）
> - 即使不挂载卷，备份功能也可正常使用（但数据不持久化）
> - **推荐**：挂载 `database` 和 `backups` 卷以持久化数据

> ⚠️ **重要**：
> - `ADMIN_PASSWORD` 环境变量**仅在首次初始化时生效**
> - 如果数据库已存在，环境变量不会覆盖数据库中的密码
> - 要重新设置初始密码，需删除 `database/nav.db` 后重启容器

**3. 首次部署（自定义初始密码）**
```bash
# 确保数据库不存在
rm -rf database/nav.db

# 启动容器并设置初始密码
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

#### Docker Compose

创建 `docker-compose.yml`：
```yaml
version: '3'

services:
  Con-Nav-Item:
    image: ghcr.io/zczy-k/con-nav-item:latest
    container_name: Con-Nav-Item
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - NODE_ENV=production
      - ADMIN_USERNAME=admin
      - ADMIN_PASSWORD=123456  # 仅首次初始化生效
    volumes:
      - ./database:/app/database
      - ./backups:/app/backups
    restart: unless-stopped
```

启动服务：
```bash
docker-compose up -d
```

#### 密码管理

**检查当前密码状态**
```bash
docker exec -it Con-Nav-Item node check-password.js check
```

**重置密码为指定值**
```bash
# 重置为 123456
docker exec -it Con-Nav-Item node check-password.js reset 123456

# 重置为自定义密码
docker exec -it Con-Nav-Item node check-password.js reset your_password
```

**或者在前端修改密码**
1. 登录后台管理：`http://your-server:3000/admin`
2. 点击右上角用户名 → 用户管理
3. 在“修改密码”区域输入旧密码和新密码

#### 常用管理命令

```bash
# 查看容器状态
docker ps -a | grep Con-Nav-Item

# 查看容器日志
docker logs -f Con-Nav-Item

# 重启容器
docker restart Con-Nav-Item

# 停止容器
docker stop Con-Nav-Item

# 删除容器
docker rm -f Con-Nav-Item

# 更新到最新版本
docker stop Con-Nav-Item
docker rm Con-Nav-Item
docker pull ghcr.io/zczy-k/con-nav-item:latest
# 然后重新运行 docker run 命令
```

### 方式三：Serv00 / CT8 / Hostuno 部署

支持 Serv00、CT8、Hostuno 等免费主机平台。

**一键安装：**
```bash
# 使用默认域名 (username.serv00.net)
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-serv00.sh)

# 指定自定义域名
DOMAIN=your-domain.com bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-serv00.sh)
```

**重置应用：**
```bash
# 完全重置（会备份数据）
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/reset-serv00.sh)

# 指定域名重置
DOMAIN=your-domain.com bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/reset-serv00.sh)
```

> 💡 **提示**：重置脚本会备份当前数据，然后删除旧文件并重新安装

**常见问题**：
- 如果遇到前端无法显示的问题，请查看 [Serv00 前端修复说明](SERV00_FRONTEND_FIX.md)
- 如果遇到 524 超时错误，请查看 [Serv00 部署修复说明](SERV00_FIX.md)

### 方式四：源码部署

```bash
# 1. 克隆项目
git clone https://github.com/zczy-k/Con-Nav-Item.git
cd Con-Nav-Item

# 2. 安装后端依赖
npm install

# 3. 构建前端
cd web
npm install
npm run build:prod
cd ..

# 4. 启动应用
npm start
```

## 🎯 访问应用

部署完成后，访问以下地址：

- **首页导航**: `http://your-server:3000`
- **后台管理**: `http://your-server:3000/admin`
- **默认账号**: admin / 123456

> ⚠️ **重要**: 首次登录后请立即修改密码！

### 📱 PWA 应用安装（推荐）

将导航站安装为独立应用，像原生 App 一样使用：

**优点：**
- ✅ **独立窗口** - 无浏览器地址栏，不影响输入网址
- ✅ **桌面图标** - 添加到主屏幕，快速访问
- ✅ **离线访问** - 缓存后可离线使用
- ✅ **全屏体验** - 沉浸式界面

**安装方法：**

**Android / Chrome:**
1. 用 Chrome 浏览器访问导航站
2. 点击右上角菜单 → “安装应用” 或 “添加到主屏幕”
3. 确认安装

**iOS / Safari:**
1. 用 Safari 访问导航站
2. 点击底部分享按钮 🔼
3. 选择“添加到主屏幕”
4. 点击“添加”

**桌面端 (Chrome/Edge):**
1. 访问导航站
2. 地址栏右侧出现安装图标 ➕
3. 点击安装

> 💡 **提示**：安装后，PWA 应用和浏览器完全独立，打开浏览器时地址栏是空的，不会被导航站网址占用！

## ⚙️ 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 | 备注 |
|--------|------|--------|------|
| `PORT` | 服务器端口 | 3000 | - |
| `ADMIN_USERNAME` | 管理员用户名 | admin | 仅首次初始化生效 |
| `ADMIN_PASSWORD` | 管理员密码 | 123456 | 仅首次初始化生效 |
| `NODE_ENV` | 运行环境 | production | - |

> 💡 **提示**：`ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 环境变量只在数据库不存在时（首次初始化）生效。如果数据库已存在，这些环境变量不会覆盖数据库中的用户名和密码。要修改密码，请使用前端管理界面或 `check-password.js` 工具。

### 数据存储

- **数据库**: `database/nav.db` (SQLite)
- **备份文件**: `backups/` 目录
- **配置文件**: `config/autoBackup.json` (自动备份配置)
- **配置文件**: `config/autoBackup.json` (自动备份配置)

## 💾 备份与恢复

项目内置完善的备份系统，支持本地备份、WebDAV云备份和自动备份。

### 后台备份管理
登录后台管理 → 备份管理：
- **本地备份**: 创建、恢复、下载、删除本地备份
- **WebDAV备份**: 配置并备份到云端（坚果云、Nextcloud等）
- **自动备份**: 配置定时备份和增量备份策略

## 🧩 浏览器扩展

将导航站设为浏览器新标签页，打开新标签自动跳转到你的导航站。

### 功能特性

#### 🆕 新标签页替换
- 自动将浏览器新标签页设置为导航站
- 自定义导航站地址
- 打开新标签自动跳转

#### ➕ 快速添加功能 (v1.1.0 新增)
点击浏览器工具栏扩展图标，即可快速添加网站到导航站：

**1. 添加当前标签页**
- 一键添加当前正在浏览的网页
- 自动填充 URL 到批量添加页面
- 无需手动复制粘贴

**2. 选择标签页批量添加**
- 显示当前窗口所有标签页
- 支持多选，批量添加
- 显示网站图标和标题
- 当前标签页高亮显示
- 全选/清除快捷操作
- 自动过滤浏览器内部页面

**使用场景**：
- 📚 **研究资料收集**：打开多个相关页面，一次性全部添加
- ⚡ **快速收藏**：浏览时随时一键添加
- 🎯 **精选收藏**：勾选需要的标签页，批量添加

**效率提升**：
```
1. 点击扩展图标
2. 点击“添加当前标签页”
✅ 自动完成！

```

### 安装方法
1. 打开 Chrome/Edge 浏览器
2. 访问 `chrome://extensions/` (Edge: `edge://extensions/`)
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `browser-extension` 文件夹
6. 点击扩展图标，输入导航站地址并保存

### 使用提示
- 首次使用需要在扩展中设置导航站地址
- 快速添加功能需要管理员密码验证
- 支持记住密码 2 小时，无需重复输入

支持: Chrome 88+, Edge 88+, Brave 及其他 Chromium 浏览器

## 📦 项目结构

```
Con-Nav-Item/
├── app.js                  # 后端入口
├── config.js               # 配置文件
├── db.js                   # 数据库初始化
├── routes/                 # API路由
│   ├── auth.js            # 用户认证
│   ├── card.js            # 卡片管理
│   ├── menu.js            # 菜单管理
│   ├── backup.js          # 备份管理
│   └── ...                # 其他路由
├── utils/                  # 工具函数
│   ├── autoBackup.js      # 自动备份
│   └── crypto.js          # 加密工具
├── web/                    # 前端源码
│   ├── src/               # Vue组件
│   └── dist/              # 构建输出
├── public/                 # 静态文件（生产）
├── database/               # SQLite数据库
├── uploads/                # 上传文件
├── config/                 # 配置目录
├── scripts/                # 部署脚本
│   ├── install-linux.sh   # Linux一键部署
│   ├── install-serv00.sh  # Serv00安装
│   └── reset-serv00.sh    # Serv00重置
├── browser-extension/      # 浏览器扩展
├── Dockerfile              # Docker构建
└── docker-compose.yml      # Docker Compose配置
```

## 🛠️ 开发指南

### 前端开发
```bash
cd web
npm install
npm run dev          # 开发服务器
npm run build        # 生产构建
npm run build:prod   # 构建并复制到public目录
```

### 构建工作流
```bash
# 使用自动化脚本（Windows）
./build.ps1

# 手动构建
cd web && npm run build:prod && cd ..
```

## 🔧 工具脚本

### 密码管理工具

**查看当前密码状态**
```bash
# 本地部署
node check-password.js check

# Docker 部署
docker exec -it Con-Nav-Item node check-password.js check
```

**重置密码**
```bash
# 本地部署
node check-password.js reset <新密码>
node check-password.js reset 123456

# Docker 部署
docker exec -it Con-Nav-Item node check-password.js reset <新密码>
docker exec -it Con-Nav-Item node check-password.js reset 123456
```

**使用环境变量重置**
```bash
# 本地部署（需要 .env 文件）
node check-password.js reset-env

# Docker 部署（使用容器环境变量）
docker exec -it Con-Nav-Item node check-password.js reset-env
```

## ✨ 重复检测功能

项目内置完善的重复卡片检测系统，防止重复导入相同网站。

### 📊 三种检测方式

#### 1️⃣ 后台重复管理
**位置**：后台管理 → 重复管理

**功能**：
- 一键检测所有分类中的重复卡片
- 按分组显示重复卡片
- 支持批量删除或单个删除
- 显示重复统计信息

#### 2️⃣ 批量添加重复检测
**位置**：首页 → FAB 菜单 → 批量添加网站

**功能**：
- 解析 URL 后自动检测重复
- 重复卡片显示红色边框和背景
- 右上角显示红色“重复”徽章
- 底部显示与哪个现有卡片重复
- 重复卡片默认不选中，防止误添加

#### 3️⃣ 单卡片添加重复检测
**位置**：后台管理 → 卡片管理 → 添加卡片

**功能**：
- 点击添加时实时检测重复
- 弹出对话框显示现有卡片和待添加卡片对比
- 提供三个处理选项：
  - 🚫 **跳过**：放弃添加，清空输入
  - 🔄 **替换**：删除旧卡片，添加新卡片
  - ✏️ **编辑后添加**：回填信息供修改

### 🧠 检测算法

判断两个卡片是否重复，满足以下任一条件即视为重复：

1. **URL 标准化匹配**
   - 移除协议（http/https）
   - 移除 www 前缀
   - 移除尾部斜杠
   - 转为小写后比较

2. **标题 + 域名匹配**
   - 标题完全相同
   - 且域名相同

**示例**：
```
https://github.com     ↔️  http://www.github.com/     ✅ 检测为重复
https://github.com     ↔️  https://github.com/home    ❌ 不是重复
```

### 🎨 视觉设计

**批量添加预览**：
- 🔴 红色边框和浅红色背景
- 🏷️ 右上角红色“重复”徽章
- ⚠️ 底部重复信息提示

**单卡片添加对话框**：
- 🔵 蓝色框：现有卡片
- 🟪 紫色框：待添加卡片
- 🟢 绿色提示：操作说明
- 🟥 红色警告：重复提示

## 📚 文档

- [浏览器扩展说明](browser-extension/README.md)
- [自定义搜索引擎功能](docs/custom-search-engine.md)
- [安全政策](SECURITY.md)

## 🐛 问题反馈

遇到问题？请在 [Issues](https://github.com/zczy-k/Con-Nav-Item/issues) 中反馈。

## 🤝 贡献

欢迎提交 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 Apache License 2.0 - 查看 [LICENSE](LICENSE) 了解详情

### 版权声明

```
Copyright 2025 zczy-k

基于 nav-item by eooce (https://github.com/eooce/nav-item)
Original Copyright 2024 eooce

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

## 👨‍💻 作者

- **zczy-k** - [GitHub](https://github.com/zczy-k)
- **eooce** (原项目) - [GitHub](https://github.com/eooce)

## 🙏 致谢

感谢所有为这个项目做出贡献的开发者！

---

⭐ 如果这个项目对你有帮助，请给它一个星标！














