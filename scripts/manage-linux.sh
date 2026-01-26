#!/bin/bash

# Con-Nav-Item Linux 服务器综合管理脚本
# 支持：安装、更新、卸载
# 适用系统：Ubuntu, Debian, CentOS, RHEL, Fedora 等

set -e

# --- 环境变量与基础配置 ---
export LC_ALL=C
INSTALL_DIR=${INSTALL_DIR:-"$HOME/Con-Nav-Item"}

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

# 执行安装/更新
do_install() {
    detect_os
    install_nodejs
    install_pm2
    
    yellow "安装 Con-Nav-Item..."
    
    # 如果目录存在，处理备份
    if [ -d "$INSTALL_DIR" ]; then
        yellow "  ⚠ 检测到已存在的安装目录: $INSTALL_DIR"
        read -p "是否备份并重新安装? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            BACKUP_DIR="${INSTALL_DIR}_backup_$(date +%Y%m%d_%H%M%S)"
            mv "$INSTALL_DIR" "$BACKUP_DIR"
            green "  ✔ 已备份到: $BACKUP_DIR"
        else
            yellow "操作已取消"
            exit 0
        fi
    fi
    
    # 克隆与构建
    yellow "  → 克隆项目..."
    git clone --quiet https://github.com/zczy-k/Con-Nav-Item.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    
    yellow "  → 安装依赖与构建..."
    npm install --silent 2>/dev/null
    cd web
    npm install --silent 2>/dev/null
    npm run build:prod >/dev/null 2>&1
    cd ..
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
    
    cat > "$INSTALL_DIR/.env" <<EOF
PORT=${PORT}
ADMIN_USERNAME=${ADMIN_USER}
ADMIN_PASSWORD=${ADMIN_PASS}
NODE_ENV=production
JWT_SECRET=${JWT_SECRET}
EOF
    chmod 600 "$INSTALL_DIR/.env"
    green "✓ 配置文件已生成"
    
    # 启动
    yellow "启动应用..."
    pm2 delete Con-Nav-Item 2>/dev/null || true
    pm2 start app.js --name Con-Nav-Item >/dev/null 2>&1
    pm2 save >/dev/null 2>&1
    pm2 startup 2>/dev/null | tail -n 1 | bash >/dev/null 2>&1 || true
    
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

# 执行卸载
do_uninstall() {
    red "警告: 这将卸载 Con-Nav-Item 并删除所有数据！"
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
        pm2 stop Con-Nav-Item 2>/dev/null || true
        pm2 delete Con-Nav-Item 2>/dev/null || true
        pm2 save --force 2>/dev/null || true
    fi
    
    # 删除文件
    rm -rf "$INSTALL_DIR"
    green "✔ 卸载完成，应用目录已删除"
}

show_finish_info() {
    IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")
    echo ""
    green "=========================================="
    green "  ✔ 安装完成！"
    green "=========================================="
    echo -e "${green}访问地址：${purple}http://${IP}:$1${re}"
    echo -e "${green}后台管理：${purple}http://${IP}:$1/admin${re}"
    echo -e "${green}管理账号：${purple}$2${re}"
    echo ""
    yellow "常用命令："
    echo "  pm2 status              - 查看状态"
    echo "  pm2 logs Con-Nav-Item   - 查看日志"
    echo "  pm2 restart Con-Nav-Item - 重启应用"
    echo ""
}

# --- 主逻辑 ---

echo ""
green "=========================================="
green "  Con-Nav-Item Linux 综合管理脚本"
green "=========================================="
echo ""

case "$1" in
    install)
        do_install
        ;;
    uninstall)
        do_uninstall
        ;;
    *)
        echo "请选择操作："
        echo "  1) 安装 / 更新 (Install)"
        echo "  2) 彻底卸载 (Uninstall)"
        echo "  q) 退出"
        read -p "输入序号 [1-2]: " choice
        case "$choice" in
            1) do_install ;;
            2) do_uninstall ;;
            *) exit 0 ;;
        esac
        ;;
esac
