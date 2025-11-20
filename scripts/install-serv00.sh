#!/bin/bash

# Con-Nav-Item Serv00 一键安装脚本

# Enable xtrace for detailed logging
set -x
# 作者: zczy-k
# GitHub: https://github.com/zczy-k/Con-Nav-Item

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
green "  Con-Nav-Item Serv00 一键安装脚本"
green "  GitHub: github.com/zczy-k/Con-Nav-Item"
green "=========================================="
echo ""

# 检查命令
command -v curl &>/dev/null && COMMAND="curl -so" || command -v wget &>/dev/null && COMMAND="wget -qO" || { red "错误: 未找到 curl 或 wget，请先安装其中之一。" >&2; exit 1; }

check_website() {
    yellow "正在检查站点配置...\n"
    CURRENT_SITE=$(devil www list | awk -v domain="$CURRENT_DOMAIN" '$1 == domain && $2 == "nodejs"')
    
    if [ -n "$CURRENT_SITE" ]; then
        green "已存在 ${CURRENT_DOMAIN} 站点\n"
    else
        EXIST_SITE=$(devil www list | awk -v domain="$CURRENT_DOMAIN" '$1 == domain')
        
        if [ -n "$EXIST_SITE" ]; then
            yellow "删除旧站点并创建新的 Node.js 站点...\n"
            devil www del "$CURRENT_DOMAIN" >/dev/null 2>&1
            devil www add "$CURRENT_DOMAIN" nodejs /usr/local/bin/node20 > /dev/null 2>&1
            green "已创建新站点 ${CURRENT_DOMAIN}\n"
        else
            yellow "创建新的 Node.js 站点...\n"
            devil www add "$CURRENT_DOMAIN" nodejs /usr/local/bin/node20 > /dev/null 2>&1
            green "已创建站点 ${CURRENT_DOMAIN}\n"
        fi
    fi
}

install_application() {
    yellow "正在安装应用，请稍等...\n"
    
    # 创建并进入工作目录
    mkdir -p "$WORKDIR"
    cd "$WORKDIR" || exit 1
    
    # 下载项目文件
    DOWNLOAD_URL="https://github.com/zczy-k/Con-Nav-Item/archive/refs/heads/main.zip"
    yellow "下载项目文件...\n"
    $COMMAND "${WORKDIR}/Con-Nav-Item.zip" "$DOWNLOAD_URL"
    
    if [ ! -f "${WORKDIR}/Con-Nav-Item.zip" ]; then
        red "下载失败！请检查网络连接。"
        exit 1
    fi
    
    # 解压文件
    yellow "解压文件...\n"
    unzip -oq "${WORKDIR}/Con-Nav-Item.zip" -d "${WORKDIR}"
    
    # 移动文件到当前目录
    if [ -d "${WORKDIR}/Con-Nav-Item-main" ]; then
        # 备份 database, data, .env
        yellow "-> Backing up existing data...\n"
        if [ -d "${WORKDIR}/database" ]; then
            mv "${WORKDIR}/database" "${WORKDIR}/database.backup"
            green "  ✔ Database backed up to database.backup" 
        fi
        if [ -d "${WORKDIR}/data" ]; then
            mv "${WORKDIR}/data" "${WORKDIR}/data.backup"
            green "  ✔ Data directory backed up to data.backup"
        fi
        if [ -f "${WORKDIR}/.env" ]; then
            mv "${WORKDIR}/.env" "${WORKDIR}/.env.backup"
            green "  ✔ .env file backed up to .env.backup"
        fi
        echo ""

        # 清理旧文件（特别注意清理 public 目录）
        yellow "-> Cleaning old application files...\n"
        # 先单独删除 public 目录以确保前端文件完全更新
        rm -rf "${WORKDIR}/public"
        find "${WORKDIR}" -mindepth 1 -maxdepth 1 ! -name 'database.backup' ! -name 'data.backup' ! -name '.env.backup' ! -name 'node_modules' ! -name 'Con-Nav-Item-main' ! -name 'Con-Nav-Item.zip' -exec rm -rf {} + 2>/dev/null || true
        green "  ✔ Old files cleaned."
        echo ""

        # 复制新文件
        yellow "-> Copying new application files...\n"
        cp -r ${WORKDIR}/Con-Nav-Item-main/* ${WORKDIR}/
        rm -rf ${WORKDIR}/Con-Nav-Item-main
        green "  ✔ New files copied."
        echo ""
        
        # 恢复备份
        yellow "-> Restoring data from backup...\n"
        if [ -d "${WORKDIR}/database.backup" ]; then
            rm -rf "${WORKDIR}/database"
            mv "${WORKDIR}/database.backup" "${WORKDIR}/database"
            green "  ✔ Database restored."
        fi
        if [ -d "${WORKDIR}/data.backup" ]; then
            mv "${WORKDIR}/data.backup" "${WORKDIR}/data"
            green "  ✔ Data directory restored."
        fi
        if [ -f "${WORKDIR}/.env.backup" ]; then
            mv "${WORKDIR}/.env.backup" "${WORKDIR}/.env"
            green "  ✔ .env file restored."
        fi
        echo ""
    fi
    
    rm -f "${WORKDIR}/Con-Nav-Item.zip"
    
    # 前端静态文件已经在 public 目录中，不需要额外处理
    if [ -d "${WORKDIR}/public" ] && [ -f "${WORKDIR}/public/index.html" ]; then
        green "前端文件已就绪\n"
        # 验证关键文件
        if [ -d "${WORKDIR}/public/assets" ]; then
            ASSET_COUNT=$(ls -1 "${WORKDIR}/public/assets"/*.js 2>/dev/null | wc -l)
            green "  ✔ 找到 ${ASSET_COUNT} 个前端 JS 文件\n"
        else
            yellow "  ⚠ 警告: public/assets 目录不存在\n"
        fi
    else
        red "错误: public 目录或 index.html 不存在\n"
        yellow "尝试重新下载前端文件...\n"
        
        # 重新下载并解压
        curl -L https://github.com/zczy-k/Con-Nav-Item/archive/refs/heads/main.zip -o "${WORKDIR}/temp.zip"
        unzip -o "${WORKDIR}/temp.zip" "Con-Nav-Item-main/public/*" -d "${WORKDIR}" >/dev/null 2>&1
        
        if [ -d "${WORKDIR}/Con-Nav-Item-main/public" ]; then
            cp -r "${WORKDIR}/Con-Nav-Item-main/public" "${WORKDIR}/"
            rm -rf "${WORKDIR}/Con-Nav-Item-main" "${WORKDIR}/temp.zip"
            green "  ✔ 前端文件已重新下载\n"
        else
            red "  ✗ 无法下载前端文件，请手动检查\n"
            exit 1
        fi
    fi
    
    # app.js 已统一，无需额外配置
    green "使用统一的 app.js 配置\n"
    
    # 配置 Node 环境
    mkdir -p ~/bin
    ln -fs /usr/local/bin/node20 ~/bin/node > /dev/null 2>&1
    ln -fs /usr/local/bin/npm20 ~/bin/npm > /dev/null 2>&1
    mkdir -p ~/.npm-global
    npm config set prefix '~/.npm-global' 2>/dev/null || true
    
    # 创建 .bash_profile 如果不存在
    touch ~/.bash_profile
    
    if ! grep -q "~/.npm-global/bin" ~/.bash_profile 2>/dev/null; then
        echo 'export PATH=~/.npm-global/bin:~/bin:$PATH' >> ~/.bash_profile
    fi
    
    # 导入环境变量
    export PATH=~/.npm-global/bin:~/bin:/usr/local/devil/node20/bin:$PATH
    
    # 安装依赖
    yellow "安装后端依赖...（这可能需要几分钟）\n"
    
    LOG_FILE="${HOME}/npm-install.log"
    # 确保在正确的目录下安装
    cd "${WORKDIR}" || exit 1
    
    if npm install 2>&1 | tee "$LOG_FILE" | grep -v "^npm warn"; then
        green "依赖安装成功\n"
        rm -f "$LOG_FILE"
    else
        red "依赖安装失败！\n"
        yellow "错误日志："
        tail -20 "$LOG_FILE"
        yellow "\n尝试重新安装依赖...\n"
        # 删除可能损坏的 node_modules 并重试
        rm -rf "${WORKDIR}/node_modules"
        if npm install 2>&1 | tee "$LOG_FILE"; then
            green "重试成功，依赖安装完成\n"
            rm -f "$LOG_FILE"
        else
            red "依赖安装彻底失败，请手动运行: cd ${WORKDIR} && npm install\n"
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
    
    # 运行数据库更新脚本并显示输出
    yellow "-> Running database update script...\n"
    echo "[DEBUG] Current directory: $(pwd)"
    echo "[DEBUG] Listing files in database directory:"
    ls -la "${WORKDIR}/database"
    echo "[DEBUG] Contents of update script:"
    cat "${WORKDIR}/update_logos_temp.js"
    if node "${WORKDIR}/update_logos_temp.js"; then
        green "  ✔ Database update script finished.
"
    else
        red "  ✖ Database update script may have failed. Please check logs.
"
    fi
    
    # 清理临时脚本
    rm -f "${WORKDIR}/update_logos_temp.js"
    
    # 生成安全的 .env 文件
    yellow "生成安全配置文件...\n"
    
    # 生成随机JWT密钥
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('base64'))")
    
    # 获取 devil 分配的 TCP 端口
    ASSIGNED_PORT=$(devil port list | awk '$2 == "tcp" {print $1; exit}')
    
    if [ -z "$ASSIGNED_PORT" ]; then
        yellow "  ⚠ 未找到分配的 TCP 端口，尝试添加...\n"
        devil port add tcp random > /dev/null 2>&1
        sleep 2
        ASSIGNED_PORT=$(devil port list | awk '$2 == "tcp" {print $1; exit}')
        
        if [ -z "$ASSIGNED_PORT" ]; then
            red "  ✗ 无法获取 TCP 端口\n"
            yellow "  提示：Serv00 会自动管理端口，应用仍可能正常工作\n"
        else
            green "  ✔ 已添加 TCP 端口: ${ASSIGNED_PORT}\n"
        fi
    else
        green "  ✔ 使用 TCP 端口: ${ASSIGNED_PORT}\n"
    fi
    
    # 创建 .env 文件，包含 PORT（如果获取到）
    cat > "${WORKDIR}/.env" <<EOF
ADMIN_USERNAME=admin
ADMIN_PASSWORD=123456
NODE_ENV=production
JWT_SECRET=${JWT_SECRET}
EOF
    
    # 如果获取到端口，添加到 .env
    if [ -n "$ASSIGNED_PORT" ]; then
        echo "PORT=${ASSIGNED_PORT}" >> "${WORKDIR}/.env"
    fi
    
    chmod 600 "${WORKDIR}/.env"
    green "✓ 安全配置文件已创建\n"
    yellow "⚠️  默认密码为 123456，请登录后立即修改！\n"
    
    # 重启应用
    devil www restart "${CURRENT_DOMAIN}" > /dev/null 2>&1
    green "应用已启动\n"
}

show_info() {
    echo ""
    green "=========================================="
    green "  安装完成！"
    green "=========================================="
    echo ""
    
    # 等待应用启动
    yellow "等待应用启动...\n"
    sleep 5
    
    # 验证部署
    yellow "验证部署状态...\n"
    
    # 检查进程
    if ps aux | grep -v grep | grep node20 | grep -q app.js; then
        green "  ✔ Node.js 进程运行正常\n"
    else
        yellow "  ⚠ Node.js 进程未找到，可能正在启动\n"
    fi
    
    # 检查前端文件
    if [ -f "${WORKDIR}/public/index.html" ]; then
        green "  ✔ 前端文件存在\n"
    else
        red "  ✗ 前端文件缺失\n"
    fi
    
    # 测试访问
    if [[ -z "$DOMAIN" ]]; then
        HTTP_CODE=$(curl -o /dev/null -s -w "%{http_code}\n" https://${CURRENT_DOMAIN} 2>/dev/null || echo "000")
        if [ "$HTTP_CODE" = "200" ]; then
            green "  ✔ 网站访问正常 (HTTP $HTTP_CODE)\n"
        else
            yellow "  ⚠ 网站访问异常 (HTTP $HTTP_CODE)，请稍等片刻后重试\n"
        fi
    else
        ip_address=$(devil vhost list | awk '$2 ~ /web/ {print $1}')
        echo ""
        purple "请将域名 ${yellow}${CURRENT_DOMAIN} ${purple}添加 A 记录指向："
        yellow "$ip_address"
        purple "并在 Cloudflare 开启代理（小黄云）\n"
    fi
    
    echo ""
    green "=========================================="
    green "  访问信息"
    green "=========================================="
    echo ""
    echo -e "${green}站点地址：${purple}https://${CURRENT_DOMAIN}${re}"
    echo -e "${green}后台管理：${purple}https://${CURRENT_DOMAIN}/admin${re}"
    echo -e "${green}管理账号：${purple}admin${re}"
    echo -e "${green}管理密码：${purple}123456${re}"
    echo ""
    red "⚠️  请登录后立即修改密码！"
    echo ""
    green "=========================================="
    green "  故障排查"
    green "=========================================="
    echo ""
    yellow "如果遇到问题，请运行以下命令检查：\n"
    echo "  # 检查进程"
    echo "  ps aux | grep node20"
    echo ""
    echo "  # 检查前端文件"
    echo "  ls -la ${WORKDIR}/public/"
    echo ""
    echo "  # 重启应用"
    echo "  devil www restart ${CURRENT_DOMAIN}"
    echo ""
    echo "  # 查看详细文档"
    echo "  https://github.com/zczy-k/Con-Nav-Item/blob/main/SERV00_FRONTEND_FIX.md"
    echo ""
    green "=========================================="
    echo ""
    echo -e "${yellow}项目地址：${re}${purple}https://github.com/zczy-k/Con-Nav-Item${re}"
    echo ""
}

# 主函数
main() {
    check_website
    install_application
    show_info
}

main
