#!/bin/bash

# Con-Nav-Item Serv00 Frontend Display Fix Script
# Fixes issues where frontend cannot display after deployment

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
green "  Con-Nav-Item Frontend Display Fix"
green "=========================================="
echo ""

# Check working directory
if [ ! -d "$WORKDIR" ]; then
    red "Error: Project directory not found: ${WORKDIR}"
    yellow "Please run the install script first"
    exit 1
fi

cd "$WORKDIR" || exit 1

# 1. Backup current app.js
yellow "1. Backing up current app.js..."
if [ -f "app.js" ]; then
    cp app.js "app.js.backup.$(date +%Y%m%d_%H%M%S)"
    green "   Backed up to app.js.backup.$(date +%Y%m%d_%H%M%S)"
else
    red "   app.js not found"
    exit 1
fi

# 2. Download fixed app.js
yellow "2. Downloading fixed app.js..."
if curl -s https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/app.js -o app.js.new; then
    mv app.js.new app.js
    green "   Download successful"
else
    red "   Download failed"
    exit 1
fi

# 2.5. Ensure .env has correct PORT
yellow "2.5. Configuring port..."
ASSIGNED_PORT=$(devil port list | awk '$2 == "tcp" {print $1; exit}')

if [ -n "$ASSIGNED_PORT" ]; then
    # Check if .env exists
    if [ -f ".env" ]; then
        # Remove old PORT line
        grep -v "^PORT=" .env > .env.tmp && mv .env.tmp .env
        # Add new PORT
        echo "PORT=${ASSIGNED_PORT}" >> .env
        green "   Port configured: ${ASSIGNED_PORT}"
    else
        # Create new .env
        cat > .env <<EOF
ADMIN_USERNAME=admin
ADMIN_PASSWORD=123456
NODE_ENV=production
PORT=${ASSIGNED_PORT}
EOF
        green "   .env file created, port: ${ASSIGNED_PORT}"
    fi
else
    yellow "   TCP port not found, Passenger will manage automatically"
fi

# 3. Check public directory
yellow "3. Checking public directory..."
if [ -d "public" ] && [ -f "public/index.html" ]; then
    green "   public directory exists"
    
    # Check assets directory
    if [ -d "public/assets" ]; then
        ASSET_COUNT=$(ls -1 public/assets/*.js 2>/dev/null | wc -l)
        green "   Found ${ASSET_COUNT} JS files"
    else
        yellow "   assets directory missing, attempting to re-download..."
        
        # Download and extract public directory
        curl -L https://github.com/zczy-k/Con-Nav-Item/archive/refs/heads/main.zip -o temp.zip
        unzip -o temp.zip "Con-Nav-Item-main/public/*" >/dev/null 2>&1
        
        if [ -d "Con-Nav-Item-main/public" ]; then
            rm -rf public
            mv Con-Nav-Item-main/public ./
            rm -rf Con-Nav-Item-main temp.zip
            green "   public directory re-downloaded"
        else
            red "   Failed to download public directory"
            exit 1
        fi
    fi
else
    yellow "   public directory missing, downloading..."
    
    # Download and extract public directory
    curl -L https://github.com/zczy-k/Con-Nav-Item/archive/refs/heads/main.zip -o temp.zip
    unzip -o temp.zip "Con-Nav-Item-main/public/*" >/dev/null 2>&1
    
    if [ -d "Con-Nav-Item-main/public" ]; then
        mv Con-Nav-Item-main/public ./
        rm -rf Con-Nav-Item-main temp.zip
        green "   public directory downloaded"
    else
        red "   Failed to download public directory"
        exit 1
    fi
fi

# 4. Restart application
yellow "4. Restarting application..."
devil www restart "$CURRENT_DOMAIN" >/dev/null 2>&1
green "   Application restarted"

# 5. Wait for startup
yellow "5. Waiting for application to start..."
sleep 5

# 6. Test access
yellow "6. Testing access..."
echo ""

# Test local access
ASSIGNED_PORT=$(devil port list | awk '$2 == "tcp" {print $1; exit}')
if [ -n "$ASSIGNED_PORT" ]; then
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:${ASSIGNED_PORT}" | grep -q "200"; then
        green "   Local access OK (port ${ASSIGNED_PORT})"
    else
        yellow "   Local access issue"
    fi
fi

# Test external access
if curl -s -o /dev/null -w "%{http_code}" "https://${CURRENT_DOMAIN}" | grep -q "200"; then
    green "   External access OK"
else
    yellow "   External access issue, please wait and retry"
fi

echo ""
green "=========================================="
green "  Fix Complete!"
green "=========================================="
echo ""
green "Visit: https://${CURRENT_DOMAIN}"
echo ""
yellow "If issues persist, check logs:"
echo "  ps aux | grep node20"
echo "  devil www restart ${CURRENT_DOMAIN}"
echo ""
