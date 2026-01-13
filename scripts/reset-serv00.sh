#!/bin/bash

# Con-Nav-Item Serv00 Complete Reset Script
# Author: zczy-k
# GitHub: https://github.com/zczy-k/Con-Nav-Item
# Reference: eooce/Sing-box reset.sh

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
red "  Con-Nav-Item Serv00 Complete Reset"
red "  This will completely clean all data!"
red "=========================================="
echo ""

yellow "Initializing system, please wait...\n"

# 1. Kill all user processes (except essential ones)
yellow "-> Terminating all running processes...\n"
ps aux | grep "$USERNAME" | grep -v "sshd\|bash\|grep" | awk '{print $2}' | xargs -r kill -9 > /dev/null 2>&1

# 2. Delete all websites
yellow "-> Deleting all website configurations...\n"
devil www list | awk 'NF>1 && $1 ~ /\./ {print $1}' | while read -r domain; do
    devil www del "$domain" > /dev/null 2>&1
done

# 3. Delete all directories (except critical ones)
yellow "-> Cleaning all application directories...\n"
find "$HOME" -mindepth 1 ! -name "domains" ! -name "mail" ! -name "repo" ! -name "backups" -exec rm -rf {} + > /dev/null 2>&1

# 4. Clean domains directory contents
if [ -d "$HOME/domains" ]; then
    yellow "-> Cleaning domains directory...\n"
    rm -rf $HOME/domains/* > /dev/null 2>&1
fi

# 5. Delete all ports
yellow "-> Cleaning all port configurations...\n"
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

# 6. Auto-add new TCP port
port_list=$(devil port list)
tcp_ports=$(echo "$port_list" | grep -c "tcp")

if [[ $tcp_ports -lt 1 ]]; then
    while true; do
        tcp_port=$(shuf -i 10000-65535 -n 1)
        result=$(devil port add tcp $tcp_port 2>&1)
        if [[ $result == *"successfully"* ]]; then
            green "Added new TCP port: $tcp_port\n"
            break
        fi
    done
fi

# 7. Clean cache and temp files
yellow "-> Cleaning cache and temp files...\n"
rm -rf $HOME/.cache $HOME/.npm $HOME/.pm2 $HOME/.config 2>/dev/null
rm -f $HOME/npm-install.log $HOME/.bash_history 2>/dev/null

# 8. Clean npm global packages
yellow "-> Cleaning npm configuration...\n"
npm config delete prefix 2>/dev/null
npm cache clean --force 2>/dev/null

# 9. Reset environment variables
yellow "-> Resetting environment configuration...\n"
echo '# Clean profile' > ~/.bash_profile
echo 'export PATH=/usr/local/bin:$PATH' >> ~/.bash_profile

# 10. Enable binexec
yellow "-> Enabling binexec...\n"
devil binexec on > /dev/null 2>&1

# 11. Confirm reset complete
echo ""
green "=========================================="
green "  Complete Reset Done!"
green "=========================================="
echo ""

# Show current status
yellow "Current status check:\n"
echo -e "${green}Available ports:${purple}"
devil port list | grep -E "tcp|udp" | head -3
echo -e "${green}Website list:${purple}"
website_count=$(devil www list | wc -l)
if [ $website_count -le 1 ]; then
    echo "No websites (cleaned)"
else
    devil www list | head -3
fi
echo -e "${re}"

echo ""
yellow "You can now redeploy Con-Nav-Item:\n"
echo -e "${purple}# Using default domain\n${yellow}bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-serv00.sh)${re}"
echo ""
echo -e "${purple}# Using custom domain\n${yellow}DOMAIN=your-domain.com bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-serv00.sh)${re}"
echo ""
green "=========================================="
