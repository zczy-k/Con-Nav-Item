# 密码找回指南

忘记管理员密码了？不用担心！本文档提供多种密码找回方案。

## 🎯 快速选择方案

| 场景 | 推荐方案 | 难度 |
|------|---------|------|
| Linux 服务器 | [方案1: Linux 管理脚本](#方案1linux-管理脚本重置) | ⭐ 简单 |
| Serv00 部署 | [方案2: Serv00 管理脚本](#方案2serv00-管理脚本重置) | ⭐ 简单 |
| Docker 部署 | [方案3: Docker 容器重置](#方案3docker-容器重置) | ⭐ 简单 |
| 有 SSH 访问 | [方案4: 命令行快速重置](#方案4命令行快速重置) | ⭐⭐ 中等 |

---

## 方案1：Linux 管理脚本重置

**适用场景**：使用 Linux 服务器部署（Ubuntu/Debian/CentOS 等）

### 方法A：使用管理脚本（推荐）

```bash
# 运行管理脚本
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/SmartNavora/main/scripts/manage-linux.sh)

# 选择 2) 重置管理密码
# 按提示输入新密码即可
```

### 方法B：交互式重置

```bash
# 进入安装目录（默认 ~/SmartNavora）
cd ~/SmartNavora

# 交互式重置
node scripts/check-password.js interactive
```

### 示例输出

```
🔐 交互式密码重置向导

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
当前管理员账号:
   用户名: admin
   上次登录: 2024-02-09 10:30:00
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

请输入新用户名 (直接回车保持不变): 
请输入新密码 (至少6位): ******
请再次输入新密码: ******

🔧 正在更新...

✅ 更新成功!
   用户名: admin
   密码: ********

💡 现在可以使用新账号登录了
```

---

## 方案2：Serv00 管理脚本重置

**适用场景**：使用 Serv00/CT8 免费虚拟主机部署

### 步骤

```bash
# 运行管理脚本
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/SmartNavora/main/scripts/manage-serv00.sh)

# 选择 3) 重置管理密码
# 按提示输入新密码即可
```

脚本会自动调用交互式重置工具，安全可靠。

### 或者手动重置

```bash
# 进入项目目录
cd ~/domains/你的域名/public_nodejs

# 快速重置（密码会显示在命令行，不推荐）
node scripts/check-password.js reset 新密码123
```

⚠️ **注意**：Serv00 环境下不支持完整的交互式输入，建议使用管理脚本。

---

## 方案3：Docker 容器重置

**适用场景**：使用 Docker 部署

### 方法A：使用重置脚本（推荐）

```bash
# 下载重置脚本
curl -O https://raw.githubusercontent.com/zczy-k/SmartNavora/main/scripts/docker-reset-password.sh
chmod +x docker-reset-password.sh

# 运行脚本（默认容器名 SmartNavora）
./docker-reset-password.sh

# 或指定容器名
./docker-reset-password.sh my-container-name
```

脚本提供4种重置方式：
1. 交互式重置（最安全）
2. 使用环境变量重置
3. 生成紧急令牌
4. 使用令牌重置

### 方法B：直接进入容器

```bash
# 交互式重置
docker exec -it SmartNavora node scripts/check-password.js interactive

# 或快速重置
docker exec -it SmartNavora node scripts/check-password.js reset 新密码123
```

### 方法C：环境变量重置

```bash
# 停止并删除容器
docker stop SmartNavora
docker rm SmartNavora

# 使用新密码重启
docker run -d \
  --name SmartNavora \
  -p 3000:3000 \
  -v $(pwd)/database:/app/database \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=新密码123 \
  --restart unless-stopped \
  ghcr.io/zczy-k/smartnavora:latest

# 进入容器应用环境变量
docker exec -it SmartNavora node scripts/check-password.js reset-env
```

---

## 方案4：命令行快速重置

**适用场景**：有 SSH 访问权限，想快速重置（不推荐，密码会显示在命令行）

```bash
# 进入项目目录
cd /path/to/SmartNavora

# 直接重置（一行命令）
node scripts/check-password.js reset 新密码123
```

⚠️ **安全警告**：
- 密码会出现在进程列表中
- 会记录到 Shell 历史
- 建议使用后清除历史：`history -c && history -w`

---

## 检查当前密码信息

如果不确定是否是默认密码：

```bash
cd /path/to/SmartNavora
node scripts/check-password.js check
```

输出示例：
```
🔍 检查数据库中的管理员账号信息...

✅ 找到管理员账号:
   ID: 1
   用户名: admin
   密码哈希: $2a$10$abcdefg...
   上次登录: 2024-02-09 10:30:00
   登录IP: 192.168.1.100

💡 提示:
   - ADMIN_PASSWORD 环境变量仅在首次初始化数据库时生效
   - 如果数据库已存在，环境变量不会覆盖数据库中的密码
   - 要重置密码，请使用: node check-password.js reset <新密码>
   - 或者在前端管理界面修改密码

⚠️  当前密码是默认密码: 123456
```

---

## 🔒 安全建议

1. **首次安装后立即修改密码**
   - 默认密码 `123456` 非常不安全
   - 建议使用强密码（包含大小写字母、数字、特殊字符）

2. **定期更换密码**
   - 建议每 3-6 个月更换一次

3. **保存紧急令牌**
   - 安装后立即生成并保存紧急令牌
   - 将令牌保存在密码管理器中

4. **备份数据库**
   - 定期备份 `database/nav.db` 文件
   - 备份中包含加密后的密码

5. **使用前端修改密码**
   - 登录后台 → 用户管理 → 修改密码
   - 这是最安全的方式

---

## ❓ 常见问题

### Q1: 为什么修改 .env 文件中的密码无效？

**A**: `.env` 文件中的 `ADMIN_PASSWORD` 只在首次初始化数据库时生效。数据库创建后，密码存储在数据库中，不再读取环境变量。

### Q2: 重置密码后还是无法登录？

**A**: 请检查：
1. 是否清除了浏览器缓存
2. 是否使用了正确的用户名
3. 数据库文件是否有写入权限
4. 运行 `node scripts/check-password.js check` 确认密码已更新

### Q3: 令牌过期了怎么办？

**A**: 重新生成令牌：
```bash
node scripts/check-password.js generate-token
```

### Q4: 没有 SSH 访问权限怎么办？

**A**: 
1. 如果是 Docker 部署，可以通过 Docker 命令进入容器
2. 如果是虚拟主机，联系主机商获取 SSH 访问权限
3. 最后的办法：删除数据库文件重新初始化（会丢失所有数据）

### Q5: 可以通过 API 重置密码吗？

**A**: 出于安全考虑，不提供 API 重置密码功能。必须通过服务器端命令行操作。

---

## 📞 需要帮助？

如果以上方案都无法解决问题，请：

1. 查看项目 [Issues](https://github.com/zczy-k/SmartNavora/issues)
2. 提交新的 Issue 并详细描述问题
3. 加入社区讨论

---

**最后提醒**：请妥善保管密码，定期备份数据！
