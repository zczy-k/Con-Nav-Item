#!/bin/bash

# Docker 容器密码重置脚本
# 用法: ./docker-reset-password.sh [容器名称]

set -e

# 颜色定义
re="\033[0m"
red="\033[1;91m"
green="\e[1;32m"
yellow="\e[1;33m"

red() { echo -e "\e[1;91m$1${re}"; }
green() { echo -e "\e[1;32m$1${re}"; }
yellow() { echo -e "\e[1;33m$1${re}"; }

CONTAINER_NAME=${1:-"Con-Nav-Item"}

echo ""
green "=========================================="
green "  Docker 容器密码重置工具"
green "=========================================="
echo ""

# 检查容器是否存在
if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    red "❌ 错误: 容器 '${CONTAINER_NAME}' 不存在"
    echo ""
    yellow "可用的容器列表:"
    docker ps -a --format "  - {{.Names}}"
    echo ""
    exit 1
fi

# 检查容器是否运行
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    red "❌ 错误: 容器 '${CONTAINER_NAME}' 未运行"
    yellow "请先启动容器: docker start ${CONTAINER_NAME}"
    exit 1
fi

yellow "找到容器: ${CONTAINER_NAME}"
echo ""

# 提供多种重置方式
echo "请选择重置方式："
echo "  1) 交互式重置（推荐，最安全）"
echo "  2) 使用环境变量重置"
echo "  3) 生成紧急令牌"
echo "  4) 使用令牌重置"
echo "  q) 退出"
read -p "输入序号 [1-4]: " choice

case "$choice" in
    1)
        yellow "启动交互式密码重置..."
        echo ""
        docker exec -it "${CONTAINER_NAME}" node scripts/check-password.js interactive
        ;;
    2)
        yellow "使用环境变量重置密码..."
        echo ""
        yellow "⚠️  注意: 需要在容器中设置 ADMIN_PASSWORD 环境变量"
        echo ""
        read -p "是否继续? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker exec -it "${CONTAINER_NAME}" node scripts/check-password.js reset-env
        fi
        ;;
    3)
        yellow "生成紧急重置令牌..."
        echo ""
        docker exec -it "${CONTAINER_NAME}" node scripts/check-password.js generate-token
        echo ""
        yellow "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        yellow "  请妥善保存上面显示的令牌！"
        yellow "  令牌 1 小时后自动失效"
        yellow "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        ;;
    4)
        yellow "使用令牌重置密码..."
        echo ""
        read -p "请输入令牌: " token
        read -sp "请输入新密码 (至少6位): " password
        echo
        
        if [ -z "$token" ] || [ -z "$password" ]; then
            red "❌ 令牌和密码不能为空"
            exit 1
        fi
        
        docker exec -it "${CONTAINER_NAME}" node scripts/check-password.js reset-token "$token" "$password"
        ;;
    *)
        yellow "已取消"
        exit 0
        ;;
esac

echo ""
green "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
green "  操作完成！"
green "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
yellow "提示:"
echo "  - 查看容器日志: docker logs ${CONTAINER_NAME}"
echo "  - 进入容器: docker exec -it ${CONTAINER_NAME} bash"
echo "  - 重启容器: docker restart ${CONTAINER_NAME}"
echo ""
