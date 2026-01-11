#!/bin/sh
set -e

echo "🚀 启动 Ai-Nav-Item..."

# 自动创建所有必需的目录
echo "📁 创建必需的目录..."
mkdir -p /app/database
mkdir -p /app/backups
mkdir -p /app/config
mkdir -p /app/web/dist

# 设置目录权限
chmod 755 /app/database
chmod 755 /app/backups
chmod 755 /app/config

echo "✅ 目录创建完成："
echo "   - /app/database (数据库)"
echo "   - /app/backups (备份文件)"
echo "   - /app/config (配置文件)"

# 检查是否为首次运行（数据库不存在）
if [ ! -f "/app/database/nav.db" ]; then
    echo "🔧 检测到首次运行，将使用环境变量初始化..."
    
    # 显示管理员账号信息
    ADMIN_USER="${ADMIN_USERNAME:-admin}"
    ADMIN_PASS="${ADMIN_PASSWORD:-123456}"
    
    echo "👤 管理员账号："
    echo "   用户名: $ADMIN_USER"
    if [ "$ADMIN_PASSWORD" = "123456" ]; then
        echo "   ⚠️  密码: $ADMIN_PASS (默认密码，请登录后立即修改！)"
    else
        echo "   密码: ******** (已自定义)"
    fi
else
    echo "📦 检测到现有数据库，将继续使用..."
fi

# 显示配置信息
echo ""
echo "🔧 应用配置："
echo "   端口: ${PORT:-3000}"
echo "   环境: ${NODE_ENV:-production}"
echo "   数据目录: /app"
echo ""

# 执行传入的命令（通常是 node app.js 或 node start-with-https.js）
echo "▶️  启动应用..."
exec "$@"
