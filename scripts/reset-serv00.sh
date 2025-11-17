#!/bin/bash

# Con-Nav-Item Serv00 完全重置脚本
# 作者: zczy-k
# GitHub: https://github.com/zczy-k/Con-Nav-Item
# 参考: eooce/Sing-box reset.sh

export LC_ALL=C
re="\033[0m"
red="\033[1;91m"
green="\e[1;32m"
yellow="\e[1;33m"
purple="\e[1;35m"

red() { echo -e "\e[1;91m$1\033[0m"; }
green() { echo -e "\e[1;32m$1\033[0m"; }
yellow() { echo -e "\e[1;33m$1\033[0m"; }
purple() { echo -e "\e[1;35m$1\033[0m"; }

HOSTNAME=$(hostname)
USERNAME=$(whoami | tr '[:upper:]' '[:lower:]')

echo ""
red "=========================================="
red "  Con-Nav-Item Serv00 完全重置脚本"
red "  这将彻底清理所有数据和进程！"
red "=========================================="
echo ""

yellow "系统初始化中，请稍等...\n"

# 1. 杀死所有用户进程（除了必要进程）
yellow "→ 终止所有运行中的进程...\n"
ps aux | grep "$USERNAME" | grep -v "sshd\|bash\|grep" | awk '{print $2}' | xargs -r kill -9 > /dev/null 2>&1

# 2. 删除所有网站
yellow "→ 删除所有网站配置...\n"
devil www list | awk 'NF>1 && $1 ~ /\./ {print $1}' | while read -r domain; do
    devil www del "$domain" > /dev/null 2>&1
done

# 3. 删除所有目录（除了关键目录）
yellow "→ 清理所有应用目录...\n"
find "$HOME" -mindepth 1 ! -name "domains" ! -name "mail" ! -name "repo" ! -name "backups" -exec rm -rf {} + > /dev/null 2>&1

# 4. 清理domains目录下的内容
if [ -d "$HOME/domains" ]; then
    yellow "→ 清理domains目录...\n"
    rm -rf $HOME/domains/* > /dev/null 2>&1
fi

# 5. 删除所有端口
yellow "→ 清理所有端口配置...\n"
devil port list | grep -E "^\s*[0-9]+" | while read -r line; do
    port=$(echo "$line" | awk '{print $1}')
    proto=$(echo "$line" | awk '{print $2}')
    
    if [[ "$proto" != "tcp" && "$proto" != "udp" ]]; then
        continue
    fi
    
    if ! [[ "$port" =~ ^[0-9]+$ ]]; then
        continue
    fi
    
    devil port del "$proto" "$port" > /dev/null 2>&1
done

# 6. 自动添加新的TCP端口
port_list=$(devil port list)
tcp_ports=$(echo "$port_list" | grep -c "tcp")

if [[ $tcp_ports -lt 1 ]]; then
    while true; do
        tcp_port=$(shuf -i 10000-65535 -n 1)
        result=$(devil port add tcp $tcp_port 2>&1)
        if [[ $result == *"successfully"* ]]; then
            green "✓ 已添加新的TCP端口: $tcp_port\n"
            break
        fi
    done
fi

# 7. 清理缓存和临时文件
yellow "→ 清理缓存和临时文件...\n"
rm -rf $HOME/.cache $HOME/.npm $HOME/.pm2 $HOME/.config 2>/dev/null
rm -f $HOME/npm-install.log $HOME/.bash_history 2>/dev/null

# 8. 清理npm全局包
yellow "→ 清理npm配置...\n"
npm config delete prefix 2>/dev/null
npm cache clean --force 2>/dev/null

# 9. 重置环境变量
yellow "→ 重置环境配置...\n"
echo '# Clean profile' > ~/.bash_profile
echo 'export PATH=/usr/local/bin:$PATH' >> ~/.bash_profile

# 10. 启用 binexec
yellow "→ 启用binexec...\n"
devil binexec on > /dev/null 2>&1

# 11. 确认重置完成
echo ""
green "=========================================="
green "  彻底重置完成！"
green "=========================================="
echo ""

# 显示当前状态
yellow "当前状态检查：\n"
echo -e "${green}可用端口：${purple}"
devil port list | grep -E "tcp|udp" | head -3
echo -e "${green}网站列表：${purple}"
website_count=$(devil www list | wc -l)
if [ $website_count -le 1 ]; then
    echo "无网站（已清理）"
else
    devil www list | head -3
fi
echo -e "${re}"

echo ""
yellow "现在可以重新部署Con-Nav-Item：\n"
echo -e "${purple}# 使用默认域名\n${yellow}bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-serv00.sh)${re}"
echo ""
echo -e "${purple}# 使用自定义域名\n${yellow}DOMAIN=your-domain.com bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-serv00.sh)${re}"
echo ""
green "==========================================" 
