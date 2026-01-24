## Project Summary
现代化个人导航站，提供美观的卡片式导航界面、AI 智能生成（OpenAI, Claude, DeepSeek等）和功能丰富的浏览器扩展。

## Tech Stack
- Frontend: Vue 3 + Vite
- Backend: Node.js + Express + SQLite
- AI: Multi-provider adapter (OpenAI, DeepSeek, etc.)
- Auth: JWT + bcrypt
- Extension: Chrome Extension Manifest V3

## Architecture
- `web/`: Frontend Vue application
- `routes/`: Backend API routes
- `utils/`: Utility functions (AI providers, encryption, etc.)
- `database/`: SQLite database files
- `public/`: Static assets

## User Preferences
- 优先支持 DeepSeek 作为 AI 提供商
- 备份恢复流程需要自动化，尽量减少用户二次配置

## Project Guidelines
- AI 配置加密存储
- 备份恢复后应自动测试连接并激活
- 保持 README.md 中的版本号和更新日志同步更新

## Common Patterns
- 使用 `probeBaseUrl` 测试 AI 连接
- 数据库恢复后需要手动重新建立数据库连接实例
