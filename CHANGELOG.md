# 更新日志

所有重要的项目变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.3] - 2024-02-10

### 🐛 Bug 修复
- 修复 Docker 部署中 WebDAV 配置无法保存的问题（400 错误）
- 修复 Docker 容器重启后配置丢失的问题
- 添加 `config` 和 `backups` 目录的持久化挂载

### 📚 文档完善
- 新增 [Docker 故障排查指南](docs/DOCKER-TROUBLESHOOTING.md)
  - WebDAV 配置失败的解决方案
  - 数据迁移指南
  - 权限和端口问题排查
  - Docker 最佳实践
- 更新 README.md 添加 Docker 部署注意事项
- 更新 docker-compose.yml 示例配置

### 🔧 改进
- Docker 部署现在正确挂载 `config` 目录
- 优化 Docker 容器的目录结构
- 添加健康检查配置示例

## [1.0.2] - 2024-02-09

### 🔐 安全性增强
- 新增交互式密码重置功能，避免命令行参数泄露
- 新增紧急重置令牌系统（SHA-256 哈希存储，1小时过期，单次使用）
- 新增操作审计日志，记录所有密码重置操作
- 密码重置后不再显示明文，统一显示 `********`
- 添加命令行密码重置的安全警告提示
- 修复 GitHub Dependabot 检测到的所有安全漏洞（13个）

### 🛠️ 部署优化
- 修复 Serv00 重置功能会断开 SSH 连接的问题
- 改进 Serv00 重置流程，确保彻底清理所有残留
- Serv00 管理脚本新增密码重置选项（选项3）
- 优化安装流程，添加详细的进度提示（7步重置，5步安装）
- 改进站点检查和创建逻辑，添加错误处理
- Linux 管理脚本新增密码重置功能
- Docker 环境新增独立密码重置脚本

### 📚 文档完善
- 新增 [密码找回指南](docs/PASSWORD-RECOVERY.md)
  - 4种实用密码找回方案（按平台分类）
  - 详细的使用步骤和示例
  - 常见问题解答
- 新增 [安全最佳实践](docs/SECURITY.md)
  - 安全设计说明
  - 风险分析与缓解措施
  - 安全使用建议
  - 应急响应流程
- 更新 README.md
  - 添加 v1.0.2 更新内容
  - 添加忘记密码解决方案
  - 添加安全特性说明
  - 添加文档链接

### 🐛 Bug 修复与依赖更新
- 修复 `qs` 原型污染漏洞：升级到 ^6.14.2
- 修复 `tar` 路径遍历漏洞：升级到 ^7.5.10
- 修复 `fast-xml-parser` DoS 漏洞：升级到 ^5.3.8
- 修复 `minimatch` ReDoS 漏洞：升级到 ^10.0.1
- 修复 `@tootallnate/once` 竞态条件漏洞：升级到 ^3.0.1
- 更新 `express-rate-limit` 到 ^8.2.2
- 更新 `multer` 到 ^2.1.1
- 更新 `axios` 到 ^1.13.5
- 所有依赖包安全审计通过（0 vulnerabilities）

### 🔧 改进
- 优化密码检查脚本 `scripts/check-password.js`
  - 添加 `interactive` 交互式重置模式
  - 添加 `generate-token` 生成紧急令牌
  - 添加 `reset-token` 使用令牌重置
  - 改进帮助信息和错误提示
- 优化 Serv00 管理脚本 `scripts/manage-serv00.sh`
  - 菜单从3项扩展到4项
  - 添加密码重置功能
  - 改进重置流程的安全性
  - 优化进度显示和错误处理
- 优化 Linux 管理脚本 `scripts/manage-linux.sh`
  - 添加密码重置选项
- 新增 Docker 密码重置脚本 `scripts/docker-reset-password.sh`

### 🧹 代码清理
- 删除冗余文件：`check-password.js`（已移至 scripts/）
- 删除冗余文件：`AGENTS.md`（AI 助手配置）
- 删除冗余文件：`bun.lock` 和 `web/bun.lock`
- 更新 `.gitignore` 添加密码重置相关文件

## [1.0.1] - 2024-02-08

### 新增
- 优化移动端显示
- 添加自定义域名配置说明
- 整合部署脚本

### 修复
- 修复前端显示问题
- 优化部署脚本

## [1.0.0] - 2024-02-07

### 首次发布
- 基础导航功能
- AI 智能生成
- 浏览器插件
- Docker 支持
- Serv00 部署支持
- WebDAV 备份
- PWA 支持

---

## 版本说明

### 版本号格式：主版本号.次版本号.修订号

- **主版本号**：不兼容的 API 修改
- **次版本号**：向下兼容的功能性新增
- **修订号**：向下兼容的问题修正

### 更新类型

- **新增 (Added)**：新功能
- **修改 (Changed)**：现有功能的变更
- **弃用 (Deprecated)**：即将移除的功能
- **移除 (Removed)**：已移除的功能
- **修复 (Fixed)**：Bug 修复
- **安全 (Security)**：安全相关的修复
