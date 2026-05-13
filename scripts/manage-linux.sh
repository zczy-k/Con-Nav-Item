#!/bin/bash

# SmartNavora Linux 服务器综合管理脚本
# 支持：安装、更新、卸载
# 适用系统：Ubuntu, Debian, CentOS, RHEL, Fedora 等

set -e

# --- 环境变量与基础配置 ---
export LC_ALL=C
INSTALL_DIR=${INSTALL_DIR:-"$HOME/SmartNavora"}

# 颜色定义
re="\033[0m"
red="\033[1;91m"
green="\e[1;32m"
yellow="\e[1;33m"
purple="\e[1;35m"

# 打印函数
red() { echo -e "\e[1;91m$1${re}"; }
green() { echo -e "\e[1;32m$1${re}"; }
yellow() { echo -e "\e[1;33m$1${re}"; }
purple() { echo -e "\e[1;35m$1${re}"; }

# --- 核心功能函数 ---

# 检测操作系统
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    else
        red "无法检测操作系统"
        exit 1
    fi
    yellow "检测到操作系统: $OS $VERSION"
}

# 安装 Node.js 20
install_nodejs() {
    yellow "检查 Node.js..."
    if command -v node &> /dev/null; then
        green "  ✔ Node.js 已安装: $(node --version)"
        return 0
    fi
    
    yellow "  → 安装 Node.js 20..."
    case "$OS" in
        ubuntu|debian)
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >/dev/null 2>&1
            sudo apt-get install -y nodejs >/dev/null 2>&1
            ;;
        centos|rhel|fedora)
            curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - >/dev/null 2>&1
            sudo yum install -y nodejs >/dev/null 2>&1
            ;;
        *)
            red "  ✗ 不支持的操作系统: $OS"
            exit 1
            ;;
    esac
    green "  ✔ Node.js 安装完成: $(node --version)"
}

# 安装 PM2
install_pm2() {
    yellow "检查 PM2..."
    if command -v pm2 &> /dev/null; then
        green "  ✔ PM2 已安装"
        return 0
    fi
    yellow "  → 安装 PM2..."
    sudo npm install -g pm2 >/dev/null 2>&1
    green "  ✔ PM2 安装完成"
}

get_package_version() {
    [ -f "$1/package.json" ] || { echo "unknown"; return; }
    grep -m1 '"version"' "$1/package.json" | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/'
}

start_app() {
    PORT="$1"
    yellow "启动应用..."
    pm2 delete SmartNavora 2>/dev/null || true
    pm2 start app.js --name SmartNavora >/dev/null 2>&1
    pm2 save >/dev/null 2>&1
    pm2 startup 2>/dev/null | tail -n 1 | bash >/dev/null 2>&1 || true
}

# 执行首次安装
do_install() {
    detect_os
    install_nodejs
    install_pm2
    
    yellow "首次安装 SmartNavora..."
    
    # 如果目录存在，处理备份
    if [ -d "$INSTALL_DIR" ]; then
        yellow "  ⚠ 检测到已存在的安装目录: $INSTALL_DIR"
        yellow "  如果只是升级版本，建议选择“更新应用”。"
        read -p "是否备份并重新安装? (yes/no): " -r
        [ "$REPLY" != "yes" ] && { yellow "操作已取消"; exit 0; }
        BACKUP_DIR="${INSTALL_DIR}_backup_$(date +%Y%m%d_%H%M%S)"
        mv "$INSTALL_DIR" "$BACKUP_DIR"
        green "  ✔ 已备份到: $BACKUP_DIR"
    fi
    
    # 克隆与构建
    yellow "  → 克隆项目..."
    git clone --quiet https://github.com/zczy-k/SmartNavora.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    
    yellow "  → 安装依赖与构建..."
    npm run install:all >/dev/null 2>&1
    npm run build >/dev/null 2>&1
    green "  ✔ 项目安装与构建完成"
    
    # 配置环境
    yellow "配置环境变量..."
    read -p "设置管理员用户名 [admin]: " ADMIN_USER
    ADMIN_USER=${ADMIN_USER:-admin}
    
    yellow "密码要求：至少8位，包含字母、数字、特殊字符中至少2种"
    while true; do
        read -sp "输入管理员密码: " ADMIN_PASS
        echo
        if [ ${#ADMIN_PASS} -lt 8 ]; then
            red "✗ 密码至少8位"
            continue
        fi
        read -sp "再次输入密码确认: " ADMIN_PASS_CONFIRM
        echo
        if [ "$ADMIN_PASS" != "$ADMIN_PASS_CONFIRM" ]; then
            red "✗ 两次密码不一致"
            continue
        fi
        break
    done
    
    read -p "设置运行端口 [3000]: " PORT
    PORT=${PORT:-3000}
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('base64'))")
    CRYPTO_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64'))")
    
    cat > "$INSTALL_DIR/.env" <<EOF
PORT=${PORT}
ADMIN_USERNAME=${ADMIN_USER}
ADMIN_PASSWORD=${ADMIN_PASS}
NODE_ENV=production
JWT_SECRET=${JWT_SECRET}
CRYPTO_SECRET=${CRYPTO_SECRET}
EOF
    chmod 600 "$INSTALL_DIR/.env"
    green "✓ 配置文件已生成"
    
    # 启动
    start_app "$PORT"
    
    # 防火墙
    read -p "是否开放端口 $PORT 的防火墙规则? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if command -v ufw &> /dev/null; then
            sudo ufw allow $PORT/tcp >/dev/null 2>&1
        elif command -v firewall-cmd &> /dev/null; then
            sudo firewall-cmd --permanent --add-port=$PORT/tcp >/dev/null 2>&1
            sudo firewall-cmd --reload >/dev/null 2>&1
        fi
    fi
    
    show_finish_info "$PORT" "$ADMIN_USER"
}

# 执行更新
do_update() {
    detect_os
    install_nodejs
    install_pm2

    if [ ! -d "$INSTALL_DIR" ] || [ ! -f "$INSTALL_DIR/package.json" ]; then
        red "错误: 未检测到已安装的 SmartNavora，请先执行首次安装"
        exit 1
    fi

    CURRENT_VERSION=$(get_package_version "$INSTALL_DIR")
    BACKUP_DIR="${INSTALL_DIR}_update_backup_$(date +%Y%m%d_%H%M%S)"

    yellow "更新 SmartNavora..."
    yellow "  安装目录: $INSTALL_DIR"
    yellow "  当前版本: $CURRENT_VERSION"

    mkdir -p "$BACKUP_DIR"
    [ -d "$INSTALL_DIR/database" ] && cp -r "$INSTALL_DIR/database" "$BACKUP_DIR/"
    [ -d "$INSTALL_DIR/backups" ] && cp -r "$INSTALL_DIR/backups" "$BACKUP_DIR/"
    [ -d "$INSTALL_DIR/config" ] && cp -r "$INSTALL_DIR/config" "$BACKUP_DIR/"
    [ -f "$INSTALL_DIR/.env" ] && cp "$INSTALL_DIR/.env" "$BACKUP_DIR/"
    green "  ✔ 数据和配置已备份到: $BACKUP_DIR"

    TMP_DIR="${INSTALL_DIR}_new_$(date +%Y%m%d_%H%M%S)"
    yellow "  → 下载最新代码..."
    git clone --quiet https://github.com/zczy-k/SmartNavora.git "$TMP_DIR"
    TARGET_VERSION=$(get_package_version "$TMP_DIR")
    yellow "  目标版本: $TARGET_VERSION"

    [ -d "$INSTALL_DIR/database" ] && rm -rf "$TMP_DIR/database" && mv "$INSTALL_DIR/database" "$TMP_DIR/database"
    [ -d "$INSTALL_DIR/backups" ] && rm -rf "$TMP_DIR/backups" && mv "$INSTALL_DIR/backups" "$TMP_DIR/backups"
    [ -d "$INSTALL_DIR/config" ] && rm -rf "$TMP_DIR/config" && mv "$INSTALL_DIR/config" "$TMP_DIR/config"
    [ -f "$INSTALL_DIR/.env" ] && mv "$INSTALL_DIR/.env" "$TMP_DIR/.env"

    OLD_DIR="${INSTALL_DIR}_old_$(date +%Y%m%d_%H%M%S)"
    mv "$INSTALL_DIR" "$OLD_DIR"
    mv "$TMP_DIR" "$INSTALL_DIR"

    cd "$INSTALL_DIR"
    yellow "  → 安装依赖与构建..."
    npm run install:all >/dev/null 2>&1
    npm run build >/dev/null 2>&1
    green "  ✔ 项目更新与构建完成"

    PORT=$(grep '^PORT=' .env 2>/dev/null | cut -d'=' -f2)
    PORT=${PORT:-3000}
    start_app "$PORT"

    rm -rf "$OLD_DIR"

    echo ""
    green "✔ 更新完成！"
    green "  版本: $CURRENT_VERSION -> $(get_package_version "$INSTALL_DIR")"
    green "  数据库和 .env 配置已保留"
    show_finish_info "$PORT" "$(grep '^ADMIN_USERNAME=' .env 2>/dev/null | cut -d'=' -f2 || echo admin)" "update"
}

# 执行卸载
do_uninstall() {
    red "警告: 这将卸载 SmartNavora 并删除所有数据！"
    read -p "确认卸载? (yes/no): " -r
    echo
    [ "$REPLY" != "yes" ] && { yellow "已取消卸载"; exit 0; }
    
    if [ ! -d "$INSTALL_DIR" ]; then
        red "错误: 未找到安装目录 $INSTALL_DIR"
        exit 1
    fi
    
    # 备份
    BACKUP_DIR="${INSTALL_DIR}_uninstall_backup_$(date +%Y%m%d_%H%M%S)"
    yellow "正在备份重要数据到: $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
    [ -d "$INSTALL_DIR/database" ] && cp -r "$INSTALL_DIR/database" "$BACKUP_DIR/"
    [ -d "$INSTALL_DIR/uploads" ] && cp -r "$INSTALL_DIR/uploads" "$BACKUP_DIR/"
    [ -f "$INSTALL_DIR/.env" ] && cp "$INSTALL_DIR/.env" "$BACKUP_DIR/"
    
    # 停止服务
    yellow "停止 PM2 进程..."
    if command -v pm2 &> /dev/null; then
        pm2 stop SmartNavora 2>/dev/null || true
        pm2 delete SmartNavora 2>/dev/null || true
        pm2 save --force 2>/dev/null || true
    fi
    
    # 删除文件
    rm -rf "$INSTALL_DIR"
    green "✔ 卸载完成，应用目录已删除"
}

# 重置密码
do_reset_password() {
    if [ ! -d "$INSTALL_DIR" ]; then
        red "错误: 未找到安装目录 $INSTALL_DIR"
        exit 1
    fi
    
    cd "$INSTALL_DIR"
    
    yellow "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    yellow "  密码重置向导"
    yellow "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    yellow "⚠️  安全提示: 使用交互式重置更安全"
    echo ""
    
    # 使用交互式重置
    if node scripts/check-password.js interactive 2>/dev/null; then
        echo ""
        green "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        green "  密码重置成功！"
        green "  管理后台: http://YOUR_IP:$(grep PORT .env | cut -d'=' -f2)/admin"
        green "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
    else
        red "❌ 密码重置失败"
        red "   请尝试手动执行:"
        red "   cd $INSTALL_DIR && node scripts/check-password.js interactive"
    fi
}

show_finish_info() {
    IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")
    MODE=${3:-install}
    echo ""
    green "=========================================="
    if [ "$MODE" = "update" ]; then
        green "  ✔ 更新完成！"
    else
        green "  ✔ 安装完成！"
    fi
    green "=========================================="
    echo -e "${green}访问地址：${purple}http://${IP}:$1${re}"
    echo -e "${green}后台管理：${purple}http://${IP}:$1/admin${re}"
    echo -e "${green}管理账号：${purple}$2${re}"
    echo ""
    yellow "常用命令："
    echo "  pm2 status              - 查看状态"
    echo "  pm2 logs SmartNavora    - 查看日志"
    echo "  pm2 restart SmartNavora - 重启应用"
    echo ""
}

# --- 主逻辑 ---

echo ""
green "=========================================="
green "  SmartNavora Linux 综合管理脚本"
green "=========================================="
echo ""

case "$1" in
    install)
        do_install
        ;;
    update)
        do_update
        ;;
    uninstall)
        do_uninstall
        ;;
    password)
        do_reset_password
        ;;
    *)
        echo "请选择操作："
        echo "  1) 首次安装 (Install)"
        echo "  2) 更新应用 (Update)"
        echo "  3) 重置管理密码 (Reset Password)"
        echo "  4) 彻底卸载 (Uninstall)"
        echo "  q) 退出"
        read -p "输入序号 [1-4]: " choice
        case "$choice" in
            1) do_install ;;
            2) do_update ;;
            3) do_reset_password ;;
            4) do_uninstall ;;
            *) exit 0 ;;
        esac
        ;;
esac
