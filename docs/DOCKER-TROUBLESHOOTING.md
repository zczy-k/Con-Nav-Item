# Docker 部署故障排查指南

## 问题 1: WebDAV 配置保存失败 (400 错误)

### 症状
- 在 Docker 部署的实例中配置 WebDAV 时出现 400 错误
- 控制台显示: `POST /api/backup/webdav/config 400 (Bad Request)`
- Linux 直接部署则正常工作

### 原因
Docker 容器中 `config` 目录没有被持久化挂载,导致:
1. WebDAV 配置文件无法保存
2. 加密密钥每次重启都会重新生成
3. 配置数据丢失

### 解决方案

#### 方案 1: 使用 docker-compose (推荐)
更新 `docker-compose.yml` 文件,添加 `config` 和 `backups` 目录挂载:

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
      - ADMIN_PASSWORD=123456
      - JWT_SECRET=change-this-secret
    volumes:
      - ./database:/app/database       # 持久化数据库
      - ./config:/app/config           # 持久化配置文件 ⭐ 必须添加
      - ./backups:/app/backups         # 持久化备份文件 ⭐ 必须添加
    restart: unless-stopped
```

然后重新启动:
```bash
docker-compose down
docker-compose up -d
```

#### 方案 2: 使用 docker run 命令
如果使用 `docker run` 命令启动,需要添加 `-v` 参数挂载目录:

```bash
# 停止并删除旧容器
docker stop Con-Nav-Item
docker rm Con-Nav-Item

# 使用正确的挂载参数重新启动
docker run -d \
  --name Con-Nav-Item \
  -p 3000:3000 \
  -v $(pwd)/database:/app/database \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/backups:/app/backups \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=your_password \
  --restart unless-stopped \
  ghcr.io/zczy-k/con-nav-item:latest
```

#### 方案 3: 已有容器的数据迁移
如果你已经在旧容器中配置了数据,需要先导出数据:

```bash
# 1. 创建备份
docker exec Con-Nav-Item node -e "
const fs = require('fs');
const path = require('path');
// 备份数据库
if (fs.existsSync('/app/database')) {
  fs.cpSync('/app/database', '/app/backup-db', { recursive: true });
}
console.log('备份完成');
"

# 2. 复制备份到宿主机
docker cp Con-Nav-Item:/app/backup-db ./database

# 3. 停止并删除旧容器
docker stop Con-Nav-Item
docker rm Con-Nav-Item

# 4. 使用新配置启动容器 (参考方案2)
```

### 验证修复
配置完成后,验证目录挂载是否正确:

```bash
# 检查挂载点
docker inspect Con-Nav-Item | grep -A 10 Mounts

# 应该看到类似输出:
# "Mounts": [
#     {
#         "Type": "bind",
#         "Source": "/your/path/database",
#         "Destination": "/app/database",
#     },
#     {
#         "Type": "bind",
#         "Source": "/your/path/config",
#         "Destination": "/app/config",
#     },
#     ...
# ]
```

## 问题 2: 容器重启后配置丢失

### 症状
- 每次重启容器后,WebDAV 配置需要重新设置
- AI 配置丢失
- 备份文件消失

### 原因
没有正确挂载持久化目录

### 解决方案
参考"问题 1"的解决方案,确保挂载了以下目录:
- `database` - 数据库文件
- `config` - 配置文件 (WebDAV、加密密钥等)
- `backups` - 备份文件

## 问题 3: 权限问题

### 症状
- 容器日志显示 `EACCES: permission denied`
- 无法创建或写入文件

### 解决方案
```bash
# 修改宿主机目录权限
chmod -R 755 ./database ./config ./backups

# 或者使用 root 用户运行容器
docker run -d \
  --user root \
  --name Con-Nav-Item \
  ...其他参数...
```

## 问题 4: 端口冲突

### 症状
- 容器启动失败
- 错误信息: `port is already allocated`

### 解决方案
```bash
# 方案1: 更改宿主机端口
docker run -d \
  -p 3001:3000 \  # 使用 3001 端口
  ...其他参数...

# 方案2: 停止占用端口的服务
# 查找占用端口的进程
netstat -tulpn | grep 3000
# 或
lsof -i :3000

# 停止该进程
kill -9 <PID>
```

## 问题 5: 数据库锁定

### 症状
- 错误信息: `database is locked`
- 无法保存配置

### 解决方案
```bash
# 重启容器
docker restart Con-Nav-Item

# 如果问题持续,检查是否有多个进程访问数据库
docker exec Con-Nav-Item ps aux | grep node
```

## 最佳实践

### 1. 使用 docker-compose
推荐使用 `docker-compose.yml` 管理容器,配置更清晰:

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
      - ADMIN_PASSWORD=your_secure_password  # 修改为强密码
      - JWT_SECRET=your_random_jwt_secret    # 修改为随机字符串
    volumes:
      - ./database:/app/database
      - ./config:/app/config
      - ./backups:/app/backups
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### 2. 定期备份
```bash
# 创建备份脚本
cat > backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="./docker-backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r ./database "$BACKUP_DIR/"
cp -r ./config "$BACKUP_DIR/"
cp -r ./backups "$BACKUP_DIR/"
echo "备份完成: $BACKUP_DIR"
EOF

chmod +x backup.sh

# 添加到 crontab (每天凌晨2点备份)
crontab -e
# 添加: 0 2 * * * /path/to/backup.sh
```

### 3. 监控容器状态
```bash
# 查看容器日志
docker logs -f Con-Nav-Item

# 查看容器资源使用
docker stats Con-Nav-Item

# 进入容器调试
docker exec -it Con-Nav-Item sh
```

## 获取帮助

如果以上方案都无法解决问题,请:
1. 查看容器日志: `docker logs Con-Nav-Item`
2. 检查目录权限: `ls -la database config backups`
3. 提交 Issue 到 GitHub,附上错误日志和配置信息

---

📖 更多文档:
- [密码找回指南](PASSWORD-RECOVERY.md)
- [安全最佳实践](SECURITY.md)
- [主文档](../README.md)
