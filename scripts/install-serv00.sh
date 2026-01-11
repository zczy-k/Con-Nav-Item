#!/bin/bash

# Ai-Nav-Item Serv00 一键安装脚本
# 作者: zczy-k
# GitHub: https://github.com/zczy-k/Ai-Nav-Item

# 静默模式，只显示关键信息
set -e

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
reading() { read -p "$(red "$1")" "$2"; }

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
green "  Ai-Nav-Item Serv00 一键安装脚本"
green "  GitHub: github.com/zczy-k/Ai-Nav-Item"
green "=========================================="
echo ""

# 检查命令
command -v curl &>/dev/null && COMMAND="curl -so" || command -v wget &>/dev/null && COMMAND="wget -qO" || { red "错误: 未找到 curl 或 wget，请先安装其中之一。" >&2; exit 1; }

check_website() {
    yellow "检查站点配置...\n"
    CURRENT_SITE=$(devil www list | awk -v domain="$CURRENT_DOMAIN" '$1 == domain && $2 == "nodejs"')
    
    if [ -n "$CURRENT_SITE" ]; then
        green "  ? 站点已存在\n"
    else
        EXIST_SITE=$(devil www list | awk -v domain="$CURRENT_DOMAIN" '$1 == domain')
        
        if [ -n "$EXIST_SITE" ]; then
            devil www del "$CURRENT_DOMAIN" >/dev/null 2>&1
        fi
        devil www add "$CURRENT_DOMAIN" nodejs /usr/local/bin/node20 > /dev/null 2>&1
        green "  ? 站点创建成功\n"
    fi
}

install_application() {
    yellow "安装应用...\n"
    
    # 创建并进入工作目录
    mkdir -p "$WORKDIR"
    cd "$WORKDIR" || exit 1
    
    # 下载项目文件
    DOWNLOAD_URL="https://github.com/zczy-k/Ai-Nav-Item/archive/refs/heads/main.zip"
    yellow "  → 下载项目文件...\n"
    $COMMAND "${WORKDIR}/Ai-Nav-Item.zip" "$DOWNLOAD_URL"
    
    if [ ! -f "${WORKDIR}/Ai-Nav-Item.zip" ]; then
        red "  ? 下载失败！请检查网络连接。"
        exit 1
    fi
    green "  ? 下载完成\n"
    
    # 解压文件
    yellow "  → 解压文件...\n"
    unzip -oq "${WORKDIR}/Ai-Nav-Item.zip" -d "${WORKDIR}"
    
    # 移动文件到当前目录
    if [ -d "${WORKDIR}/Ai-Nav-Item-main" ]; then
        # 备份 database, data, .env
        yellow "  → 备份数据...\n"
        [ -d "${WORKDIR}/database" ] && mv "${WORKDIR}/database" "${WORKDIR}/database.backup"
        [ -d "${WORKDIR}/data" ] && mv "${WORKDIR}/data" "${WORKDIR}/data.backup"
        [ -f "${WORKDIR}/.env" ] && mv "${WORKDIR}/.env" "${WORKDIR}/.env.backup"

        # 清理旧文件
        rm -rf "${WORKDIR}/public"
        find "${WORKDIR}" -mindepth 1 -maxdepth 1 ! -name 'database.backup' ! -name 'data.backup' ! -name '.env.backup' ! -name 'node_modules' ! -name 'Ai-Nav-Item-main' ! -name 'Ai-Nav-Item.zip' -exec rm -rf {} + 2>/dev/null || true

        # 复制新文件
        cp -r ${WORKDIR}/Ai-Nav-Item-main/* ${WORKDIR}/
        rm -rf ${WORKDIR}/Ai-Nav-Item-main
        
        # 恢复备份
        [ -d "${WORKDIR}/database.backup" ] && rm -rf "${WORKDIR}/database" && mv "${WORKDIR}/database.backup" "${WORKDIR}/database"
        [ -d "${WORKDIR}/data.backup" ] && mv "${WORKDIR}/data.backup" "${WORKDIR}/data"
        [ -f "${WORKDIR}/.env.backup" ] && mv "${WORKDIR}/.env.backup" "${WORKDIR}/.env"
        green "  ? 文件更新完成\n"
    fi
    
    rm -f "${WORKDIR}/Ai-Nav-Item.zip"
    
    # 检查前端文件
    if [ -d "${WORKDIR}/public" ] && [ -f "${WORKDIR}/public/index.html" ]; then
        green "  ? 前端文件就绪\n"
    else
        yellow "  → 重新下载前端文件...\n"
        curl -sL https://github.com/zczy-k/Ai-Nav-Item/archive/refs/heads/main.zip -o "${WORKDIR}/temp.zip"
        unzip -oq "${WORKDIR}/temp.zip" "Ai-Nav-Item-main/public/*" -d "${WORKDIR}" 2>/dev/null
        
        if [ -d "${WORKDIR}/Ai-Nav-Item-main/public" ]; then
            cp -r "${WORKDIR}/Ai-Nav-Item-main/public" "${WORKDIR}/"
            rm -rf "${WORKDIR}/Ai-Nav-Item-main" "${WORKDIR}/temp.zip"
            green "  ? 前端文件已修复\n"
        else
            red "  ? 无法下载前端文件\n"
            exit 1
        fi
    fi
    
    # 配置 Node 环境
    yellow "  → 配置环境...\n"
    mkdir -p ~/bin ~/.npm-global
    ln -fs /usr/local/bin/node20 ~/bin/node > /dev/null 2>&1
    ln -fs /usr/local/bin/npm20 ~/bin/npm > /dev/null 2>&1
    npm config set prefix '~/.npm-global' 2>/dev/null || true
    
    touch ~/.bash_profile
    grep -q "~/.npm-global/bin" ~/.bash_profile 2>/dev/null || echo 'export PATH=~/.npm-global/bin:~/bin:$PATH' >> ~/.bash_profile
    export PATH=~/.npm-global/bin:~/bin:/usr/local/devil/node20/bin:$PATH
    green "  ? 环境配置完成\n"
    
    # 安装依赖
    yellow "安装后端依赖...\n"
    
    # 确保在正确的目录下安装
    cd "${WORKDIR}" || exit 1
    
    # 静默安装，只在失败时显示错误
    if npm install --silent 2>/dev/null; then
        green "  ? 依赖安装成功\n"
    else
        yellow "  ? 首次安装失败，重试中...\n"
        rm -rf "${WORKDIR}/node_modules"
        if npm install 2>&1 | tail -5; then
            green "  ? 依赖安装成功\n"
        else
            red "  ? 依赖安装失败，请手动运行: cd ${WORKDIR} && npm install\n"
            exit 1
        fi
    fi
    
    # 更新数据库中的 logo_url 为 CDN 格式
    yellow "正在更新数据库图标链接...\n"
    
    # 创建更新脚本（使用绝对路径）
    cat > "${WORKDIR}/update_logos_temp.js" << 'EOFSCRIPT'
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'database', 'nav.db');
const db = new sqlite3.Database(dbPath);

db.all('SELECT id, url, logo_url FROM cards', (err, rows) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    process.exit(1);
  }
  
  if (rows.length === 0) {
    console.log('No cards found, database might be new');
    db.close();
    return;
  }
  
  let processed = 0;
  let updated = 0;
  
  rows.forEach(card => {
    // 检查是否已经是 CDN 格式
    if (card.logo_url && card.logo_url.includes('api.xinac.net') && card.logo_url.includes('&sz=128')) {
      processed++;
      if (processed === rows.length) {
        console.log(`Updated ${updated} logos to CDN format`);
        db.close();
      }
      return;
    }
    
    try {
      const urlObj = new URL(card.url);
      const newLogo = `https://api.xinac.net/icon/?url=${urlObj.origin}&sz=128`;
      
      db.run('UPDATE cards SET logo_url = ? WHERE id = ?', [newLogo, card.id], (error) => {
        if (!error) updated++;
        processed++;
        if (processed === rows.length) {
          console.log(`Updated ${updated} logos to CDN format`);
          db.close();
        }
      });
    } catch (e) {
      processed++;
      if (processed === rows.length) {
        console.log(`Updated ${updated} logos to CDN format`);
        db.close();
      }
    }
  });
});
EOFSCRIPT
    
    # 运行数据库更新脚本
    if node "${WORKDIR}/update_logos_temp.js" 2>/dev/null; then
        green "  ? 数据库图标已更新\n"
    else
        yellow "  ? 数据库更新跳过（可能是新安装）\n"
    fi
    
    # 清理临时脚本
    rm -f "${WORKDIR}/update_logos_temp.js"
    
    # 生成安全的 .env 文件
    yellow "  → 生成配置文件...\n"
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('base64'))")
    
    cat > "${WORKDIR}/.env" <<EOF
ADMIN_USERNAME=admin
ADMIN_PASSWORD=123456
NODE_ENV=production
JWT_SECRET=${JWT_SECRET}
EOF
    
    chmod 600 "${WORKDIR}/.env"
    green "  ? 配置文件已创建\n"
    
    # 重启应用
    yellow "  → 启动应用...\n"
    devil www restart "${CURRENT_DOMAIN}" > /dev/null 2>&1
    green "  ? 应用已启动\n"
}

show_info() {
    echo ""
    green "=========================================="
    green "  ? 安装完成！"
    green "=========================================="
    echo ""
    
    # 等待应用启动
    sleep 3
    
    # 简单验证
    if ps aux | grep -v grep | grep node20 | grep -q app.js; then
        green "  ? 服务运行正常\n"
    fi
    
    echo ""
    echo -e "${green}站点地址：${purple}https://${CURRENT_DOMAIN}${re}"
    echo -e "${green}后台管理：${purple}https://${CURRENT_DOMAIN}/admin${re}"
    echo -e "${green}管理账号：${purple}admin${re}"
    echo -e "${green}管理密码：${purple}123456${re}"
    echo ""
    red "??  请登录后立即修改密码！"
    echo ""
    
    if [[ -n "$DOMAIN" ]]; then
        ip_address=$(devil vhost list | awk '$2 ~ /web/ {print $1}')
        yellow "请将域名 ${CURRENT_DOMAIN} 添加 A 记录指向: ${ip_address}\n"
    fi
    
    echo -e "${yellow}项目地址：${purple}https://github.com/zczy-k/Ai-Nav-Item${re}"
    echo ""
}

# 主函数
main() {
    check_website
    install_application
    show_info
}

main
