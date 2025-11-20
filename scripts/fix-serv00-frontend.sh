#!/bin/bash

# Con-Nav-Item Serv00 前端显示修复脚本
# 用于修复已部署但前端无法显示的问题

export LC_ALL=C
red() { echo -e "\e[1;91m$1\033[0m"; }
green() { echo -e "\e[1;32m$1\033[0m"; }
yellow() { echo -e "\e[1;33m$1\033[0m"; }

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

echo ""
green "=========================================="
green "  Con-Nav-Item 前端显示修复脚本"
green "=========================================="
echo ""

# 检查工作目录
if [ ! -d "$WORKDIR" ]; then
    red "错误: 未找到项目目录 ${WORKDIR}"
    yellow "请先运行安装脚本"
    exit 1
fi

cd "$WORKDIR" || exit 1

# 1. 备份当前 app.js
yellow "1. 备份当前 app.js..."
if [ -f "app.js" ]; then
    cp app.js "app.js.backup.$(date +%Y%m%d_%H%M%S)"
    green "   ✓ 已备份到 app.js.backup.$(date +%Y%m%d_%H%M%S)"
else
    red "   ✗ 未找到 app.js"
    exit 1
fi

# 2. 下载修复后的 app.js
yellow "2. 下载修复后的 app.js..."
if curl -s https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/app.js -o app.js.new; then
    mv app.js.new app.js
    green "   ✓ 下载成功"
else
    red "   ✗ 下载失败"
    exit 1
fi

# 3. 检查 public 目录
yellow "3. 检查 public 目录..."
if [ -d "public" ] && [ -f "public/index.html" ]; then
    green "   ✓ public 目录存在"
    
    # 检查 assets 目录
    if [ -d "public/assets" ]; then
        ASSET_COUNT=$(ls -1 public/assets/*.js 2>/dev/null | wc -l)
        green "   ✓ 找到 ${ASSET_COUNT} 个 JS 文件"
    else
        yellow "   ⚠ assets 目录不存在，尝试重新下载..."
        
        # 下载并解压 public 目录
        curl -L https://github.com/zczy-k/Con-Nav-Item/archive/refs/heads/main.zip -o temp.zip
        unzip -o temp.zip "Con-Nav-Item-main/public/*" >/dev/null 2>&1
        
        if [ -d "Con-Nav-Item-main/public" ]; then
            rm -rf public
            mv Con-Nav-Item-main/public ./
            rm -rf Con-Nav-Item-main temp.zip
            green "   ✓ public 目录已重新下载"
        else
            red "   ✗ 下载 public 目录失败"
            exit 1
        fi
    fi
else
    yellow "   ⚠ public 目录不存在，正在下载..."
    
    # 下载并解压 public 目录
    curl -L https://github.com/zczy-k/Con-Nav-Item/archive/refs/heads/main.zip -o temp.zip
    unzip -o temp.zip "Con-Nav-Item-main/public/*" >/dev/null 2>&1
    
    if [ -d "Con-Nav-Item-main/public" ]; then
        mv Con-Nav-Item-main/public ./
        rm -rf Con-Nav-Item-main temp.zip
        green "   ✓ public 目录已下载"
    else
        red "   ✗ 下载 public 目录失败"
        exit 1
    fi
fi

# 4. 重启应用
yellow "4. 重启应用..."
devil www restart "$CURRENT_DOMAIN" >/dev/null 2>&1
green "   ✓ 应用已重启"

# 5. 等待启动
yellow "5. 等待应用启动..."
sleep 5

# 6. 测试
yellow "6. 测试访问..."
echo ""

# 测试本地访问
ASSIGNED_PORT=$(devil port list | awk '$2 == "tcp" {print $1; exit}')
if [ -n "$ASSIGNED_PORT" ]; then
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:${ASSIGNED_PORT}" | grep -q "200"; then
        green "   ✓ 本地访问正常 (端口 ${ASSIGNED_PORT})"
    else
        yellow "   ⚠ 本地访问异常"
    fi
fi

# 测试外部访问
if curl -s -o /dev/null -w "%{http_code}" "https://${CURRENT_DOMAIN}" | grep -q "200"; then
    green "   ✓ 外部访问正常"
else
    yellow "   ⚠ 外部访问异常，请稍等片刻后重试"
fi

echo ""
green "=========================================="
green "  修复完成！"
green "=========================================="
echo ""
green "请访问: https://${CURRENT_DOMAIN}"
echo ""
yellow "如果仍有问题，请查看日志："
echo "  ps aux | grep node20"
echo "  devil www restart ${CURRENT_DOMAIN}"
echo ""
