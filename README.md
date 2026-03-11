# Con-Nav-Item - 现代化个人导航站 v1.0.2

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-1.0.2-brightgreen.svg)](https://github.com/zczy-k/Con-Nav-Item/releases)
[![Node](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Security](https://img.shields.io/badge/Security-Enhanced-success.svg)](docs/SECURITY.md)

Con-Nav-Item 是一款专为数字化工作者打造的现代化个人导航系统。它不仅仅是一个链接收藏夹，更是一个集成了 AI 智能生成、多端同步、卡片化管理和浏览器深度集成的全能工作台。

---
## 📸 界面预览

<div align="center">
  <img width="90%" alt="首页预览" src="https://github.com/user-attachments/assets/3b974405-312b-4cb1-9c16-5b87d45e79e5" />
  <p><i>现代化渐变卡片首页</i></p>
  
  <img width="45%" alt="管理后台" src="https://github.com/user-attachments/assets/b3a4bac2-f7b8-4742-8982-11a7381782cb" />
  <img width="45%" alt="AI 配置" src="https://github.com/user-attachments/assets/e34ab03c-fe3a-43d2-835a-775b5ceb61ed" />
</div>


---

## 🌟 亮点功能

*   **⚡ 极速体验**：基于 Vue 3 + Node.js，响应迅捷，支持 PWA。
*   **🤖 AI 赋能**：内置多种主流 AI 适配，一键自动补全网站图标、描述、标签。
*   **🧩 深度集成**：配套强大的浏览器插件，支持新标签页接管、快捷搜藏。
*   **📂 数据安全**：内置 SQLite 数据库，支持本地备份与 WebDAV 云端备份。
*   **🔒 安全增强**：多重密码保护机制，审计日志，紧急恢复令牌。
*   **🎨 颜值即正义**：现代化渐变卡片 UI，支持暗黑模式，极致的视觉体验。

---

## 🆕 v1.0.2 更新内容

### 🔐 安全性增强
- ✅ 新增交互式密码重置功能，避免命令行泄露
- ✅ 紧急重置令牌系统（哈希存储，1小时过期）
- ✅ 完整的操作审计日志
- ✅ 密码重置不再显示明文
- ✅ Serv00 脚本集成密码管理功能

### 🛠️ 部署优化
- ✅ 修复 Serv00 重置功能不会断开 SSH 连接
- ✅ 改进重置流程，确保彻底清理残留
- ✅ 更详细的安装进度提示

### 📚 文档完善
- ✅ 新增 [密码找回指南](docs/PASSWORD-RECOVERY.md)
- ✅ 新增 [安全最佳实践](docs/SECURITY.md)
- ✅ 更新部署说明和使用指南

### 🐛 Bug 修复
- ✅ 修复安全漏洞（tar, fast-xml-parser, undici, cheerio）
- ✅ 优化依赖包版本

---

## 🚀 安装部署流程 (全流程指导)

无论你是拥有云服务器的大神，还是使用免费虚拟主机的学生党，都能轻松部署。

### 1. 选择部署方式
| 部署环境 | 推荐方案 | 特点 |
| :--- | :--- | :--- |
| **Linux 服务器** | 一键脚本 | 自动化配置 PM2 进程守护，最稳定 |
| **NAS / Docker** | Docker Run | 环境隔离，升级最简单 |
| **Serv00 / CT8** | Serv00 脚本 | 免费空间首选，自动配置域名与端口 |

### 2. 执行安装命令

#### A. Linux 服务器 (Ubuntu/Debian/CentOS)
```bash
# 执行后根据提示选择 "Install" 即可
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/manage-linux.sh)
```

#### B. Docker 部署 (最快上手)
```bash
docker run -d \
  --name Con-Nav-Item \
  -p 3000:3000 \
  -v $(pwd)/database:/app/database \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/backups:/app/backups \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=123456 \
  --restart unless-stopped \
  ghcr.io/zczy-k/con-nav-item:latest
```

> ⚠️ **重要提示**：Docker 部署必须挂载 `config` 目录，否则 WebDAV 等配置无法持久化保存！

#### C. Serv00 / 免费虚拟主机

**方式一：使用系统自带域名 (推荐新手)**
```bash
# 脚本会自动识别域名并提示选择可用端口
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/manage-serv00.sh)
```

**方式二：使用自定义域名**
```bash
# 将 your-domain.com 替换为你已解析到 Serv00 的域名
DOMAIN=your-domain.com bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/manage-serv00.sh)
```
> 💡 使用自定义域名前，请先在域名服务商处添加 CNAME 或 A 记录指向 Serv00 服务器。

### 3. 初始化配置 (安装后必看)
1.  **访问后台**：打开 `http://你的IP:3000/admin` (Serv00 请使用脚本分配的域名)。
2.  **默认账号**：用户名 `admin`，密码 `123456`。
3.  **安全修改**：进入 **[用户管理]** 菜单，第一时间修改管理员用户名和密码。
4.  **配置 AI**：进入 **[AI 智能生成]**，填入你的 API Key（推荐 DeepSeek），测试通过后即可享受一键生成功能。

### 4. 忘记密码？
如果忘记了管理员密码，可以通过以下方式重置：

**Linux 服务器用户**
```bash
# 方法1: 使用管理脚本
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/manage-linux.sh)
# 选择 2) 重置管理密码

# 方法2: 交互式重置
cd ~/Con-Nav-Item
node scripts/check-password.js interactive
```

**Serv00 用户**
```bash
# 使用管理脚本
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/manage-serv00.sh)
# 选择 3) 重置管理密码
```

**Docker 用户**
```bash
# 方法1: 使用重置脚本
curl -O https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/docker-reset-password.sh
chmod +x docker-reset-password.sh
./docker-reset-password.sh

# 方法2: 直接进入容器
docker exec -it Con-Nav-Item node scripts/check-password.js interactive
```

📖 详细说明请查看 [密码找回指南](docs/PASSWORD-RECOVERY.md)

---

## 📦 进阶使用指南

### 🌐 浏览器插件安装
想要实现“右键一键保存网站”或“新标签页即导航”？
1.  前往 [Releases](https://github.com/zczy-k/Con-Nav-Item/releases) 下载最新 `browser-extension.zip`。
2.  解压后，在 Chrome/Edge 浏览器进入 `chrome://extensions/`。
3.  开启 **开发者模式**，选择 **加载已解压的扩展程序**。
4.  在插件设置中填入你的导航站地址和密码，完成绑定。

### 🤖 如何让 AI 帮我干活？
1.  在后台添加一个只写了“URL”的卡片。
2.  勾选该卡片，点击 **批量 AI 生成**。
3.  AI 会自动爬取标题、描述、图标并分类，点击“覆盖”或“补全”保存。

### 🔄 维护与升级

#### Docker 用户
```bash
# 1. 拉取镜像
docker pull ghcr.io/zczy-k/con-nav-item:latest
# 2. 删除容器 (数据不会丢)
docker stop Con-Nav-Item && docker rm Con-Nav-Item
# 3. 重新运行上面的 docker run 命令
```

#### 脚本用户 (Linux/Serv00)
再次运行安装脚本，选择 **Update** 选项即可。

---

## 🛠️ 技术栈
*   **前端**: Vue 3 + Vite + Tailwind CSS
*   **后端**: Node.js + Express
*   **数据库**: SQLite3 (简单、快速、易迁移)
*   **AI 引擎**: 多模型适配器 (OpenAI, DeepSeek, Claude, GLM, etc.)

## 📚 文档
- [密码找回指南](docs/PASSWORD-RECOVERY.md) - 忘记密码的多种解决方案
- [安全最佳实践](docs/SECURITY.md) - 安全使用建议和风险缓解

## 🔒 安全特性
- ✅ bcrypt 密码哈希加密
- ✅ JWT 令牌认证
- ✅ 紧急重置令牌（SHA-256 哈希存储）
- ✅ 操作审计日志
- ✅ 文件权限保护（0600）
- ✅ 依赖包安全更新

## 📄 许可证
本项目采用 **Apache License 2.0** 许可证。
特别感谢 [nav-item](https://github.com/eooce/nav-item) 提供的灵感与基础。

---

⭐ 如果你喜欢这个项目，请点个 Star 鼓励一下！

## 🤝 贡献
欢迎提交 Issue 和 Pull Request！

## 📞 支持
- [GitHub Issues](https://github.com/zczy-k/Con-Nav-Item/issues)
- [更新日志](https://github.com/zczy-k/Con-Nav-Item/releases)
