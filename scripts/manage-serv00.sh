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
    
    # 检查站点是否存在
    CURRENT_SITE=$(devil www list 2>/dev/null | awk -v domain="$CURRENT_DOMAIN" '$1 == domain && $2 == "nodejs"')
    
    if [ -n "$CURRENT_SITE" ]; then
        green "  ✔ 站点已存在"
        return 0
    fi
    
    # 检查是否有同名但类型不同的站点
    EXIST_SITE=$(devil www list 2>/dev/null | awk -v domain="$CURRENT_DOMAIN" '$1 == domain')
    if [ -n "$EXIST_SITE" ]; then
        yellow "  → 删除旧站点配置..."
        devil www del "$CURRENT_DOMAIN" 2>&1 | grep -v "^$" || true
        sleep 2
    fi
    
    # 创建新站点
    yellow "  → 创建 Node.js 站点..."
    if devil www add "$CURRENT_DOMAIN" nodejs /usr/local/bin/node20 2>&1; then
        green "  ✔ 站点创建成功"
        sleep 1
    else
        red "  ✘ 站点创建失败"
        red "  提示: 请检查域名是否正确解析，或稍后重试"
        exit 1
    fi
}

# 执行安装/更新
do_install() {
    check_website
    yellow "安装应用到 $WORKDIR ..."
    echo ""
    
    mkdir -p "$WORKDIR"
    cd "$WORKDIR" || exit 1
    
    # 下载
    yellow "  [1/5] 下载项目文件..."
    curl -sLo "Con-Nav-Item.zip" "https://github.com/zczy-k/Con-Nav-Item/archive/refs/heads/main.zip"
    
    # 解压与更新
    yellow "  [2/5] 解压与数据恢复..."
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
    yellow "  [3/5] 配置环境..."
    mkdir -p ~/bin ~/.npm-global
    ln -fs /usr/local/bin/node20 ~/bin/node > /dev/null 2>&1
    ln -fs /usr/local/bin/npm20 ~/bin/npm > /dev/null 2>&1
    export PATH=~/.npm-global/bin:~/bin:/usr/local/devil/node20/bin:$PATH
    
    # 依赖安装
    yellow "  [4/5] 安装依赖（可能需要几分钟）..."
    npm run install:all >/dev/null 2>&1 || npm run install:all
    
    # 生成配置
    yellow "  [5/5] 生成配置文件..."
    if [ ! -f ".env" ]; then
        JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('base64'))")
        CRYPTO_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64'))")
        cat > ".env" <<EOF
ADMIN_USERNAME=admin
ADMIN_PASSWORD=123456
NODE_ENV=production
JWT_SECRET=${JWT_SECRET}
CRYPTO_SECRET=${CRYPTO_SECRET}
EOF
        chmod 600 ".env"
        green "      ✔ 新配置文件已生成"
    else
        green "      ✔ 使用现有配置文件"
    fi
    
    # 重启
    yellow "  → 重启服务..."
    devil www restart "${CURRENT_DOMAIN}" > /dev/null 2>&1
    
    echo ""
    green "✔ 安装完成！"
    show_finish_info
}

# 彻底重置环境
do_reset() {
    red "警告: 这将删除所有站点、端口、文件和数据！"
    echo ""
    yellow "将要删除的内容："
    yellow "  - 所有 devil www 站点配置"
    yellow "  - 所有 devil port 端口配置"
    yellow "  - ~/domains/ 下的所有文件"
    yellow "  - ~/bin/ 下的 node/npm 链接"
    yellow "  - ~/.npm-global/ 全局 npm 包"
    yellow "  - 运行中的 Node.js 应用进程（不影响 SSH）"
    echo ""
    read -p "确认重置? (yes/no): " -r
    [ "$REPLY" != "yes" ] && { yellow "已取消"; exit 0; }
    
    yellow "正在重置，请稍候..."
    echo ""
    
    # 1. 停止所有进程
    yellow "  [1/7] 停止运行中的 Node.js 进程..."
    # 只杀掉 Node.js 应用进程，不影响 SSH 和系统进程
    ps aux | grep "$USERNAME" | grep -E "node.*app\.js|node.*passenger\.js|node.*start" | grep -v grep | awk '{print $2}' | xargs -r kill -15 > /dev/null 2>&1 || true
    sleep 2
    # 如果还有残留，强制杀掉
    ps aux | grep "$USERNAME" | grep -E "node.*app\.js|node.*passenger\.js|node.*start" | grep -v grep | awk '{print $2}' | xargs -r kill -9 > /dev/null 2>&1 || true
    
    # 2. 删除所有站点（包括默认域名）
    yellow "  [2/7] 删除所有站点配置..."
    devil www list 2>/dev/null | awk 'NR>1 && $1 ~ /\./ {print $1}' | while read -r domain; do
        echo "      删除站点: $domain"
        devil www del "$domain" 2>&1 | grep -v "^$" || true
        sleep 1
    done
    
    # 3. 清理所有端口
    yellow "  [3/7] 清理所有端口..."
    devil port list 2>/dev/null | awk 'NR>1 && $1 ~ /^[0-9]+$/ {print $1, $2}' | while read -r port proto; do
        echo "      删除端口: $port ($proto)"
        devil port del "$proto" "$port" 2>&1 | grep -v "^$" || true
    done
    
    # 4. 清理 domains 目录
    yellow "  [4/7] 清理 domains 目录..."
    if [ -d "$HOME/domains" ]; then
        find "$HOME/domains" -mindepth 1 -maxdepth 1 -type d | while read -r dir; do
            echo "      删除: $dir"
            rm -rf "$dir" 2>/dev/null || true
        done
    fi
    
    # 5. 清理环境配置
    yellow "  [5/7] 清理环境配置..."
    rm -f ~/bin/node ~/bin/npm 2>/dev/null || true
    rm -rf ~/.npm-global 2>/dev/null || true
    
    # 6. 清理临时文件
    yellow "  [6/7] 清理临时文件..."
    rm -rf ~/tmp/npm-* 2>/dev/null || true
    rm -rf ~/.npm 2>/dev/null || true
    
    # 7. 重新启用 binexec
    yellow "  [7/7] 启用 binexec..."
    devil binexec on > /dev/null 2>&1 || true
    
    echo ""
    green "✔ 环境已彻底重置完成！"
    echo ""
    yellow "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    yellow "  重要提示："
    yellow "  1. 请等待 30-60 秒后再重新安装"
    yellow "  2. 如果使用自定义域名，请确保 DNS 已解析"
    yellow "  3. 重新安装命令："
    yellow "     DOMAIN=你的域名 bash <(curl -Ls ...)"
    yellow "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
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

# 重置密码
do_reset_password() {
    [ ! -d "$WORKDIR" ] && { red "错误: 未找到安装目录"; exit 1; }
    cd "$WORKDIR"
    
    yellow "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    yellow "  密码重置向导"
    yellow "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    yellow "⚠️  安全提示: 使用交互式重置更安全"
    echo ""
    
    # 使用交互式重置，避免密码出现在命令行
    if node scripts/check-password.js interactive 2>/dev/null; then
        echo ""
        green "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        green "  密码重置成功！"
        green "  管理后台: https://${CURRENT_DOMAIN}/admin"
        green "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
    else
        red "❌ 密码重置失败"
        red "   请尝试手动执行:"
        red "   cd $WORKDIR && node scripts/check-password.js interactive"
    fi
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
    password) do_reset_password ;;
    *)
        echo "请选择操作："
        echo "  1) 安装 / 更新 (Install)"
        echo "  2) 修复前端显示 (Fix Frontend)"
        echo "  3) 重置管理密码 (Reset Password)"
        echo "  4) 彻底重置环境 (Reset All - DANGEROUS)"
        echo "  q) 退出"
        read -p "输入序号 [1-4]: " choice
        case "$choice" in
            1) do_install ;;
            2) do_fix_frontend ;;
            3) do_reset_password ;;
            4) do_reset ;;
            *) exit 0 ;;
        esac
        ;;
esac
