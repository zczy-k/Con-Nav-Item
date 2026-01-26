# Con-Nav-Item - 现代化个人导航站 v1.0.1

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-1.0.1-brightgreen.svg)](https://github.com/zczy-k/Con-Nav-Item/releases)
[![Node](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)

现代化的个人导航站，提供美观的卡片式导航界面、AI 智能生成。

**🎉 正式版本 1.0.1 发布！请先部署项目，可搭配扩展插件使用更加方便，插件可以到[Releases](https://github.com/zczy-k/Con-Nav-Item/releases) 下载最新版本的扩展包** 功能完整稳定。

示例站：https://con-nav-item.zeabur.app/

## 📸 界面预览

<div align="center">
  <img width="1898" height="903" alt="image" src="https://github.com/user-attachments/assets/3b974405-312b-4cb1-9c16-5b87d45e79e5" />
  <p><i>首页导航界面</i></p>
  
 <img width="1907" height="905" alt="image" src="https://github.com/user-attachments/assets/b3a4bac2-f7b8-4742-8982-11a7381782cb" />

  <p><i>后台管理界面</i></p>
  
  <img width="1909" height="910" alt="image" src="https://github.com/user-attachments/assets/87e50b23-9844-42a0-aa12-cbf4b523db06" />

  <p><i>备份管理功能</i></p>
  
  <img width="1895" height="899" alt="image" src="https://github.com/user-attachments/assets/e34ab03c-fe3a-43d2-835a-775b5ceb61ed" />

  <p><i>后台AI配置界面</i></p>
</div>

## 📝 更新日志

### v1.0.1 (2026-01-24)
- **✨ 增强**：备份恢复逻辑优化，支持自动测试并激活备份中的 AI 配置。
- **🤖 优化**：新增 AI 服务自动连通性校验，确保恢复后立即进入可用状态。
- **🔧 修复**：增强了数据库在大数据量恢复时的重连稳定性。

### v1.0.0
- **🎉 初始版本发布**：支持多端同步、AI 智能生成卡片信息、浏览器扩展集成等核心功能。

## ✨ 核心功能

### 🏠 导航界面
- **卡片式导航** - 美观的渐变卡片，支持拖拽排序
- **多级菜单** - 主菜单和子菜单分类管理
- **智能搜索** - 支持拼音搜索和多引擎聚合搜索
- **响应式设计** - 完美适配桌面端和移动端
- **PWA 支持** - 可安装为独立应用
- **前端编辑** - 无需进入后台，直接在首页编辑卡片和菜单

### 🤖 AI 智能生成
支持多种 AI 服务，自动为卡片生成名称、描述和标签：
- **支持服务**：OpenAI、Claude、Gemini、DeepSeek、智谱GLM、通义千问、Ollama等
- **批量生成** - 筛选卡片，一键批量生成内容
- **多种模式** - 补全模式/覆盖模式，多种生成风格
- **安全存储** - API Key 加密存储

### 🔧 后台管理
- **用户管理** - 修改管理员账号密码
- **内容管理** - 菜单、卡片、标签、友链、宣传位管理
- **AI 配置** - 配置 AI 提供商和模型
- **备份管理** - 本地备份 + WebDAV 云备份，支持自动备份

### 🌐 浏览器扩展
功能强大的浏览器扩展，支持 Chrome/Edge/Firefox 等：
- **新标签页** - 新标签页直接显示导航站
- **快速添加** - 右键菜单或浮动按钮快速添加网站
- **书签管理** - 本地书签管理和云端同步
- **智能标签** - 自动生成标签和分类

## 🚀 快速部署

### 一键安装脚本

**Serv00 / CT8 / Hostuno**：
```bash
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-serv00.sh)
```

**Linux 服务器**：
```bash
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-linux.sh)
```

### Docker 部署

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

### 源码部署

```bash
git clone https://github.com/zczy-k/Con-Nav-Item.git
cd Con-Nav-Item
npm install
cd web && npm install && npm run build && cd ..
npm start
```

**访问地址**：
- 首页：`http://localhost:3000`
- 后台：`http://localhost:3000/admin`
- 默认账号：admin / 123456

⚠️ **首次登录后请立即修改密码！**

## 📱 浏览器扩展

从 [Releases](https://github.com/zczy-k/Con-Nav-Item/releases) 下载最新版本的扩展包。

### 安装方法

**Chrome / Edge / Brave**：
1. 下载并解压扩展包
2. 打开 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"

**Firefox 127+**：
1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击"临时载入附加组件"
3. 选择扩展包文件

### 配置使用

1. 点击扩展图标进入设置
2. 输入导航站地址和管理员密码
3. 选择新标签页模式
4. 开始使用：右键添加网站、新标签页导航、书签同步等

## 🤖 AI 功能使用

1. 进入后台管理 → AI 智能生成
2. 选择 AI 提供商（推荐 DeepSeek）
3. 填写 API Key 并测试连接
4. 使用批量生成向导为卡片生成内容

推荐配置：
- **DeepSeek**：性价比高，中文效果好
- **智谱 GLM**：国内服务，响应快
- **Ollama**：本地部署，完全免费

## 🔧 常见问题

### 密码管理
```bash
# 检查当前密码
npm run check-password check

# 重置密码
npm run check-password reset 新密码
```

### Serv00 部署问题
如果遇到 524 错误或前端无法显示：
```bash
# 一键修复
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/fix-serv00-frontend.sh)
```

### 前端编辑模式
1. 点击首页右下角的"+"按钮
2. 选择"编辑模式"并输入密码
3. 现在可以拖拽排序、编辑删除卡片和菜单
4. 点击空白区域退出编辑模式

## 🛠️ 技术栈

- **前端**：Vue 3 + Vite
- **后端**：Node.js + Express + SQLite
- **AI**：多提供商适配器
- **认证**：JWT + bcrypt
- **扩展**：Chrome Extension Manifest V3

## 📄 许可证

本项目采用 **Apache License 2.0** 开源许可证。基于 [nav-item](https://github.com/eooce/nav-item) 开发。

## 🔗 相关链接

- [GitHub 仓库](https://github.com/zczy-k/Con-Nav-Item)
- [版本发布](https://github.com/zczy-k/Con-Nav-Item/releases)
- [问题反馈](https://github.com/zczy-k/Con-Nav-Item/issues)

---

⭐ 如果这个项目对你有帮助，请给它一个星标！



