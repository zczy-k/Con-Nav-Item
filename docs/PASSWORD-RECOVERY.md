# 密码找回指南

忘记管理员密码了？不用担心！本文档提供多种密码找回方案。

## 🎯 快速选择方案

| 场景 | 推荐方案 | 难度 |
|------|---------|------|
| 有 SSH 访问权限 | [方案1: 交互式重置](#方案1交互式重置推荐) | ⭐ 简单 |
| 使用 Docker 部署 | [方案2: 环境变量重置](#方案2docker-环境变量重置) | ⭐⭐ 中等 |
| 使用 Serv00 部署 | [方案3: 管理脚本重置](#方案3serv00-管理脚本重置) | ⭐ 简单 |
| 无 SSH 但能访问文件 | [方案4: 紧急令牌重置](#方案4紧急令牌重置) | ⭐⭐⭐ 复杂 |

---

## 方案1：交互式重置（推荐）

**适用场景**：有 SSH 访问权限

### 步骤

1. SSH 登录到服务器
2. 进入项目目录
3. 运行交互式重置命令

```bash
# 进入项目目录
cd /path/to/Con-Nav-Item

# 运行交互式重置
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
   密码: ******

💡 现在可以使用新账号登录了
```

---

## 方案2：Docker 环境变量重置

**适用场景**：使用 Docker 部署

### 步骤

1. 停止容器
2. 使用新的环境变量重启

```bash
# 停止并删除容器
docker stop Con-Nav-Item
docker rm Con-Nav-Item

# 使用新密码重启
docker run -d \
  --name Con-Nav-Item \
  -p 3000:3000 \
  -v $(pwd)/database:/app/database \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=新密码123 \
  --restart unless-stopped \
  ghcr.io/zczy-k/con-nav-item:latest

# 进入容器重置密码
docker exec -it Con-Nav-Item node scripts/check-password.js reset-env
```

---

## 方案3：Serv00 管理脚本重置

**适用场景**：使用 Serv00 部署脚本安装

### 步骤

```bash
# 运行管理脚本
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/manage-serv00.sh)

# 选择 3) 重置管理密码
# 输入新密码即可
```

### 或者直接命令

```bash
# 进入项目目录
cd ~/domains/你的域名/public_nodejs

# 快速重置
node scripts/check-password.js reset 新密码123
```

---

## 方案4：紧急令牌重置

**适用场景**：无法 SSH 但能通过其他方式访问文件系统（如 FTP、文件管理器）

### 步骤

#### 第1步：生成令牌

在能访问服务器的任何时候（比如安装后立即执行）：

```bash
cd /path/to/Con-Nav-Item
node scripts/check-password.js generate-token
```

输出示例：
```
🔐 生成紧急重置令牌...

✅ 紧急重置令牌已生成！

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
令牌: a1b2c3d4e5f6...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  重要提示:
   1. 此令牌 1 小时后自动失效
   2. 请妥善保管，不要泄露给他人
   3. 使用后令牌会自动销毁
```

**请将令牌保存到安全的地方！**

#### 第2步：使用令牌重置

当忘记密码时：

```bash
cd /path/to/Con-Nav-Item
node scripts/check-password.js reset-token <令牌> <新密码>
```

---

## 方案5：快速命令行重置

**适用场景**：有 SSH 访问权限，想快速重置

```bash
# 进入项目目录
cd /path/to/Con-Nav-Item

# 直接重置（一行命令）
node scripts/check-password.js reset 新密码123
```

---

## 方案6：检查当前密码信息

如果不确定是否是默认密码：

```bash
cd /path/to/Con-Nav-Item
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

1. 查看项目 [Issues](https://github.com/zczy-k/Con-Nav-Item/issues)
2. 提交新的 Issue 并详细描述问题
3. 加入社区讨论

---

**最后提醒**：请妥善保管密码，定期备份数据！
