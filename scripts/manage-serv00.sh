#!/bin/bash

# Con-Nav-Item Serv00 综合管理脚本
# 支持：安装、重置、修复前端
# 作者: zczy-k

set -e

# --- 环境变量与基础配置 ---
export LC_ALL=C
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

# 获取环境信息
HOSTNAME=$(hostname)
USERNAME=$(whoami | tr '[:upper:]' '[:lower:]')
export DOMAIN=${DOMAIN:-''}

if [[ -z "$DOMAIN" ]]; then
    if [[ "$HOSTNAME" =~ ct8 ]]; then
        CURRENT_DOMAIN="${USERNAME}.ct8.pl"
    elif [[ "$HOSTNAME" =~ hostuno ]]; then
        CURRENT_DOMAIN="${USERNAME}.useruno.com"
    else
        CURRENT_DOMAIN="${USERNAME}.serv00.net"
    fi
else
    CURRENT_DOMAIN="$DOMAIN"
fi

WORKDIR="${HOME}/domains/${CURRENT_DOMAIN}/public_nodejs"

# --- 核心功能函数 ---

# 检查/创建站点
check_website() {
    yellow "检查站点配置..."
    CURRENT_SITE=$(devil www list | awk -v domain="$CURRENT_DOMAIN" '$1 == domain && $2 == "nodejs"')
    
    if [ -n "$CURRENT_SITE" ]; then
        green "  ✔ 站点已存在"
    else
        EXIST_SITE=$(devil www list | awk -v domain="$CURRENT_DOMAIN" '$1 == domain')
        if [ -n "$EXIST_SITE" ]; then
            devil www del "$CURRENT_DOMAIN" >/dev/null 2>&1
        fi
        devil www add "$CURRENT_DOMAIN" nodejs /usr/local/bin/node20 > /dev/null 2>&1
        green "  ✔ 站点创建成功"
    fi
}

# 执行安装/更新
do_install() {
    check_website
    yellow "安装应用到 $WORKDIR ..."
    
    mkdir -p "$WORKDIR"
    cd "$WORKDIR" || exit 1
    
    # 下载
    yellow "  → 下载项目文件..."
    curl -so "Con-Nav-Item.zip" "https://github.com/zczy-k/Con-Nav-Item/archive/refs/heads/main.zip"
    
    # 解压与更新
    yellow "  → 解压与数据恢复..."
    unzip -oq "Con-Nav-Item.zip" -d "."
    if [ -d "Con-Nav-Item-main" ]; then
        [ -d "database" ] && mv "database" "database.backup"
        [ -d "data" ] && mv "data" "data.backup"
        [ -f ".env" ] && mv ".env" ".env.backup"

        rm -rf "public"
        find . -mindepth 1 -maxdepth 1 ! -name 'database.backup' ! -name 'data.backup' ! -name '.env.backup' ! -name 'node_modules' ! -name 'Con-Nav-Item-main' ! -name 'Con-Nav-Item.zip' -exec rm -rf {} + 2>/dev/null || true

        cp -r Con-Nav-Item-main/* ./
        rm -rf Con-Nav-Item-main "Con-Nav-Item.zip"
        
        [ -d "database.backup" ] && rm -rf "database" && mv "database.backup" "database"
        [ -d "data.backup" ] && mv "data.backup" "data"
        [ -f ".env.backup" ] && mv ".env.backup" ".env"
    fi
    
    # 环境配置
    yellow "  → 配置环境..."
    mkdir -p ~/bin ~/.npm-global
    ln -fs /usr/local/bin/node20 ~/bin/node > /dev/null 2>&1
    ln -fs /usr/local/bin/npm20 ~/bin/npm > /dev/null 2>&1
    export PATH=~/.npm-global/bin:~/bin:/usr/local/devil/node20/bin:$PATH
    
    # 依赖安装
    yellow "  → 安装依赖..."
    npm install --silent 2>/dev/null || npm install
    
    # 生成配置
    if [ ! -f ".env" ]; then
        yellow "  → 生成配置文件..."
        JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('base64'))")
        cat > ".env" <<EOF
ADMIN_USERNAME=admin
ADMIN_PASSWORD=123456
NODE_ENV=production
JWT_SECRET=${JWT_SECRET}
EOF
        chmod 600 ".env"
    fi
    
    # 重启
    devil www restart "${CURRENT_DOMAIN}" > /dev/null 2>&1
    green "✔ 安装完成！"
    show_finish_info
}

# 彻底重置环境
do_reset() {
    red "警告: 这将删除所有域名、端口和数据！"
    read -p "确认重置? (yes/no): " -r
    [ "$REPLY" != "yes" ] && { yellow "已取消"; exit 0; }
    
    yellow "正在重置，请稍候..."
    
    # 停止进程
    ps aux | grep "$USERNAME" | grep -v "sshd\|bash\|grep" | awk '{print $2}' | xargs -r kill -9 > /dev/null 2>&1
    
    # 删除站点
    devil www list | awk 'NF>1 && $1 ~ /\./ {print $1}' | while read -r domain; do
        devil www del "$domain" > /dev/null 2>&1
    done
    
    # 清理目录
    find "$HOME" -mindepth 1 ! -name "domains" ! -name "mail" ! -name "repo" ! -name "backups" -exec rm -rf {} + > /dev/null 2>&1
    rm -rf $HOME/domains/* > /dev/null 2>&1
    
    # 清理端口
    devil port list | grep -E "^\s*[0-9]+" | while read -r line; do
        port=$(echo "$line" | awk '{print $1}')
        proto=$(echo "$line" | awk '{print $2}')
        [[ "$proto" =~ ^(tcp|udp)$ ]] && devil port del "$proto" "$port" > /dev/null 2>&1
    done
    
    # 重新启用 binexec
    devil binexec on > /dev/null 2>&1
    green "✔ 环境已彻底重置"
}

# 修复前端显示
do_fix_frontend() {
    [ ! -d "$WORKDIR" ] && { red "错误: 未找到安装目录"; exit 1; }
    cd "$WORKDIR"
    
    yellow "正在修复前端文件..."
    curl -L https://github.com/zczy-k/Con-Nav-Item/archive/refs/heads/main.zip -o temp.zip
    unzip -oq temp.zip "Con-Nav-Item-main/public/*" -d "."
    rm -rf public && mv Con-Nav-Item-main/public ./
    rm -rf Con-Nav-Item-main temp.zip
    
    # 强制端口注入
    ASSIGNED_PORT=$(devil port list | awk '$2 == "tcp" {print $1; exit}')
    if [ -n "$ASSIGNED_PORT" ] && [ -f ".env" ]; then
        sed -i '' "/^PORT=/d" .env
        echo "PORT=${ASSIGNED_PORT}" >> .env
    fi
    
    devil www restart "$CURRENT_DOMAIN" >/dev/null 2>&1
    green "✔ 前端修复尝试完成"
}

show_finish_info() {
    echo ""
    green "=========================================="
    green "  站点地址：https://${CURRENT_DOMAIN}"
    green "  管理账号：admin / 123456"
    green "=========================================="
    echo ""
}

# --- 主逻辑 ---

echo ""
green "=========================================="
green "  Con-Nav-Item Serv00 综合管理脚本"
green "=========================================="
echo ""

case "$1" in
    install) do_install ;;
    reset) do_reset ;;
    fix) do_fix_frontend ;;
    *)
        echo "请选择操作："
        echo "  1) 安装 / 更新 (Install)"
        echo "  2) 修复前端显示 (Fix Frontend)"
        echo "  3) 彻底重置环境 (Reset All - DANGEROUS)"
        echo "  q) 退出"
        read -p "输入序号 [1-3]: " choice
        case "$choice" in
            1) do_install ;;
            2) do_fix_frontend ;;
            3) do_reset ;;
            *) exit 0 ;;
        esac
        ;;
esac
