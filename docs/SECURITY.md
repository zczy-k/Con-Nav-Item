# 安全最佳实践

本文档说明密码重置功能的安全设计和使用建议。

## 🔒 安全设计

### 1. 令牌安全

**哈希存储**
- 令牌使用 SHA-256 哈希后存储
- 原始令牌只显示一次，无法恢复
- 即使服务器被入侵，攻击者也无法获取原始令牌

**时效性**
- 令牌 1 小时后自动过期
- 使用后立即销毁
- 防止令牌被重复使用

**文件权限**
- 令牌文件权限设置为 0600（只有所有者可读写）
- 防止其他用户读取

### 2. 密码保护

**不显示明文**
- 所有重置操作完成后只显示 `********`
- 避免密码泄露到终端历史

**交互式输入**
- 推荐使用 `interactive` 模式
- 密码不会出现在进程列表中
- 不会记录到 Shell 历史

**命令行警告**
- 使用 `reset <密码>` 会显示安全警告
- 提示用户清除 Shell 历史

### 3. 审计日志

**操作记录**
- 所有密码重置操作都会记录
- 包括时间戳和操作类型
- 日志文件: `config/password-audit.log`

**日志内容**
```
[2024-02-09T10:30:00.000Z] TOKEN_GENERATED: Emergency reset token generated
[2024-02-09T10:35:00.000Z] PASSWORD_RESET_SUCCESS: Password reset via token
[2024-02-09T11:00:00.000Z] PASSWORD_RESET_SUCCESS: Password reset via interactive mode, username: admin
```

### 4. 防止暴力破解

**令牌复杂度**
- 使用 32 字节随机数生成（64 位十六进制）
- 理论上有 2^256 种可能性
- 无法通过暴力破解获取

**单次使用**
- 令牌使用后立即销毁
- 防止重放攻击

## ⚠️ 安全风险与缓解

### 风险1: 命令行参数泄露

**风险描述**
```bash
# 不安全：密码会出现在进程列表中
node check-password.js reset mypassword123
```

其他用户可以通过 `ps aux` 看到密码。

**缓解措施**
1. 使用交互式模式（推荐）
```bash
node check-password.js interactive
```

2. 使用后清除历史
```bash
history -c && history -w
```

3. 脚本会显示安全警告

### 风险2: Shell 历史记录

**风险描述**
- 命令会保存在 `~/.bash_history` 或 `~/.zsh_history`
- 包含密码的命令会被记录

**缓解措施**
1. 使用交互式模式
2. 清除历史记录
```bash
# Bash
history -c && history -w

# Zsh
history -p
```

3. 临时禁用历史记录
```bash
# 执行前
set +o history

# 执行密码重置命令

# 执行后
set -o history
```

### 风险3: 令牌文件泄露

**风险描述**
- 令牌文件存储在 `config/.reset-token`
- 如果服务器被入侵，文件可能被读取

**缓解措施**
1. 令牌使用哈希存储（已实现）
2. 文件权限设置为 0600（已实现）
3. 令牌 1 小时后自动过期（已实现）
4. 使用后立即销毁（已实现）
5. 定期检查文件权限
```bash
ls -la config/.reset-token
# 应该显示: -rw------- (600)
```

### 风险4: 日志文件泄露

**风险描述**
- 审计日志包含操作记录
- 可能暴露密码重置时间

**缓解措施**
1. 日志不包含密码明文
2. 只记录操作类型和时间
3. 定期清理旧日志
```bash
# 清理 30 天前的日志
find config/ -name "password-audit.log" -mtime +30 -delete
```

## ✅ 安全使用建议

### 1. 推荐的密码重置方式

**最安全**（按优先级排序）：

1. **交互式重置**
```bash
node scripts/check-password.js interactive
```
- ✅ 密码不出现在命令行
- ✅ 不记录到历史
- ✅ 有二次确认

2. **令牌重置**
```bash
# 提前生成令牌
node scripts/check-password.js generate-token

# 需要时使用
node scripts/check-password.js reset-token <令牌> <新密码>
```
- ✅ 有时效性
- ✅ 单次使用
- ⚠️ 密码仍在命令行

3. **前端修改**
- 登录后台 → 用户管理 → 修改密码
- ✅ 最安全的方式
- ❌ 需要记得当前密码

### 2. 密码强度建议

**弱密码示例**（不要使用）：
- `123456`
- `password`
- `admin123`
- `qwerty`

**强密码示例**：
- `Xk9#mP2$vL8@nQ5!` （随机生成）
- `correct-horse-battery-staple` （词组组合）
- `MyP@ssw0rd2024!` （混合字符）

**密码要求**：
- 最少 6 位（建议 12 位以上）
- 包含大小写字母
- 包含数字
- 包含特殊字符

### 3. 定期安全检查

**每月检查清单**：

```bash
# 1. 检查是否使用默认密码
node scripts/check-password.js check

# 2. 检查审计日志
cat config/password-audit.log

# 3. 检查文件权限
ls -la config/.reset-token 2>/dev/null || echo "无令牌文件（正常）"
ls -la config/password-audit.log

# 4. 检查数据库权限
ls -la database/nav.db
```

### 4. 应急响应

**如果怀疑密码泄露**：

1. 立即重置密码
```bash
node scripts/check-password.js interactive
```

2. 检查审计日志
```bash
cat config/password-audit.log
```

3. 检查最近登录
```bash
node scripts/check-password.js check
```

4. 检查数据库是否被篡改
```bash
# 检查数据库修改时间
ls -la database/nav.db
```

5. 考虑备份恢复
```bash
# 如果有备份，恢复到安全状态
cp backups/nav.db.backup database/nav.db
```

## 🔐 多因素认证（未来计划）

当前版本不支持 MFA，但计划在未来版本中添加：

- TOTP（Google Authenticator）
- 邮件验证码
- SMS 验证码
- WebAuthn（硬件密钥）

## 📋 安全审计

**审计日志位置**：
```
config/password-audit.log
```

**日志格式**：
```
[时间戳] 操作类型: 详细信息
```

**操作类型**：
- `TOKEN_GENERATED` - 生成令牌
- `TOKEN_RESET_FAILED` - 令牌重置失败
- `PASSWORD_RESET_SUCCESS` - 密码重置成功
- `PASSWORD_RESET_FAILED` - 密码重置失败

**查看最近操作**：
```bash
tail -n 20 config/password-audit.log
```

## 🚨 已知限制

1. **单用户系统**
   - 当前只支持一个管理员账号
   - 无法区分不同管理员的操作

2. **无 IP 限制**
   - 任何有 SSH 访问权限的用户都可以重置密码
   - 建议配合 SSH 密钥认证使用

3. **无通知机制**
   - 密码重置后不会发送通知
   - 建议定期检查审计日志

4. **审计日志可被删除**
   - 有 SSH 权限的用户可以删除日志
   - 建议配合系统级日志使用

## 📞 报告安全问题

如果发现安全漏洞，请：

1. **不要**公开披露
2. 发送邮件到项目维护者
3. 提供详细的漏洞描述和复现步骤
4. 等待修复后再公开

---

**记住**：安全是一个持续的过程，不是一次性的任务！
