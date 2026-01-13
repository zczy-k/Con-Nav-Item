#!/bin/bash

# Con-Nav-Item Linux Server Uninstall Script
# Completely uninstalls the application and restores pre-deployment state

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

echo ""
green "=========================================="
green "  Con-Nav-Item Uninstall Script"
green "  GitHub: github.com/zczy-k/Con-Nav-Item"
green "=========================================="
echo ""

# Default installation directory
INSTALL_DIR=${INSTALL_DIR:-"$HOME/Con-Nav-Item"}

# Confirm uninstall
confirm_uninstall() {
    red "WARNING: This will uninstall Con-Nav-Item and delete all data!"
    echo ""
    yellow "Operations to be performed:"
    echo "  1. Stop and delete PM2 process"
    echo "  2. Delete application directory: $INSTALL_DIR"
    echo "  3. Clean up PM2 startup configuration"
    echo ""
    red "Note: Data will be backed up to ${INSTALL_DIR}_uninstall_backup_$(date +%Y%m%d_%H%M%S)"
    echo ""
    
    read -p "Confirm uninstall? (yes/no): " -r
    echo
    
    if [ "$REPLY" != "yes" ]; then
        yellow "Uninstall cancelled"
        exit 0
    fi
}

# Check installation directory
check_installation() {
    if [ ! -d "$INSTALL_DIR" ]; then
        red "Error: Installation directory not found: $INSTALL_DIR"
        red "Please check the directory or use INSTALL_DIR environment variable"
        echo ""
        yellow "Example:"
        echo "  INSTALL_DIR=/opt/Con-Nav-Item bash uninstall-linux.sh"
        exit 1
    fi
    
    green "Found installation directory: $INSTALL_DIR"
}

# Stop PM2 process
stop_pm2_process() {
    yellow "Stopping PM2 process..."
    
    if ! command -v pm2 &> /dev/null; then
        yellow "PM2 not installed, skipping"
        return 0
    fi
    
    # Check if process exists
    if pm2 list | grep -q "Con-Nav-Item"; then
        pm2 stop Con-Nav-Item 2>/dev/null || true
        pm2 delete Con-Nav-Item 2>/dev/null || true
        green "PM2 process stopped"
    else
        yellow "No running Con-Nav-Item process found"
    fi
    
    # Save PM2 state
    pm2 save --force 2>/dev/null || true
}

# Backup data
backup_data() {
    yellow "Backing up data..."
    
    BACKUP_DIR="${INSTALL_DIR}_uninstall_backup_$(date +%Y%m%d_%H%M%S)"
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    
    # Backup database
    if [ -d "$INSTALL_DIR/database" ]; then
        cp -r "$INSTALL_DIR/database" "$BACKUP_DIR/"
        green "Database backed up"
    fi
    
    # Backup uploads
    if [ -d "$INSTALL_DIR/uploads" ]; then
        cp -r "$INSTALL_DIR/uploads" "$BACKUP_DIR/"
        green "Uploads backed up"
    fi
    
    # Backup config file
    if [ -f "$INSTALL_DIR/.env" ]; then
        cp "$INSTALL_DIR/.env" "$BACKUP_DIR/"
        green "Config file backed up"
    fi
    
    # Backup local backups
    if [ -d "$INSTALL_DIR/backups" ]; then
        cp -r "$INSTALL_DIR/backups" "$BACKUP_DIR/"
        green "Local backups backed up"
    fi
    
    # Backup auto-backup config
    if [ -d "$INSTALL_DIR/config" ]; then
        cp -r "$INSTALL_DIR/config" "$BACKUP_DIR/"
        green "Auto-backup config backed up"
    fi
    
    green "Data backed up to: $BACKUP_DIR"
    echo ""
}

# Remove application directory
remove_app_directory() {
    yellow "Removing application directory..."
    
    if [ -d "$INSTALL_DIR" ]; then
        rm -rf "$INSTALL_DIR"
        green "Application directory removed: $INSTALL_DIR"
    else
        yellow "Application directory does not exist, skipping"
    fi
}

# Clean up PM2 config (optional)
cleanup_pm2_config() {
    echo ""
    yellow "Clean up PM2 configuration?"
    echo "  - If you have other apps using PM2, select 'n'"
    echo "  - If only Con-Nav-Item uses PM2, you can select 'y'"
    echo ""
    read -p "Clean PM2 config and startup? (y/n): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if command -v pm2 &> /dev/null; then
            # Check if other processes exist
            PROCESS_COUNT=$(pm2 list | grep -c "online\|stopped\|errored" || echo "0")
            
            if [ "$PROCESS_COUNT" -gt 0 ]; then
                yellow "Other PM2 processes detected, keeping PM2 config"
            else
                yellow "Removing PM2 startup config..."
                pm2 unstartup systemd -u $USER --hp $HOME 2>/dev/null || true
                green "PM2 startup disabled"
            fi
        fi
    else
        yellow "Keeping PM2 configuration"
    fi
}

# Uninstall dependencies (optional)
cleanup_dependencies() {
    echo ""
    yellow "Uninstall dependencies?"
    echo "  - Node.js and PM2 may be used by other applications"
    echo "  - Recommended to keep unless you're sure they're not needed"
    echo ""
    read -p "Uninstall Node.js and PM2? (y/n): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        yellow "Keeping Node.js and PM2"
        return 0
    fi
    
    # Uninstall PM2
    if command -v pm2 &> /dev/null; then
        yellow "Uninstalling PM2..."
        npm uninstall -g pm2 2>/dev/null || sudo npm uninstall -g pm2 2>/dev/null || true
        green "PM2 uninstalled"
    fi
    
    # Uninstall Node.js
    if command -v node &> /dev/null; then
        yellow "Uninstalling Node.js..."
        
        if [ -f /etc/os-release ]; then
            . /etc/os-release
            OS=$ID
            
            case "$OS" in
                ubuntu|debian)
                    sudo apt-get remove -y nodejs npm 2>/dev/null || true
                    sudo apt-get autoremove -y 2>/dev/null || true
                    ;;
                centos|rhel|fedora)
                    sudo yum remove -y nodejs npm 2>/dev/null || true
                    ;;
                *)
                    yellow "Please uninstall Node.js manually"
                    ;;
            esac
            
            green "Node.js uninstalled"
        fi
    fi
}

# Show uninstall result
show_result() {
    echo ""
    green "=========================================="
    green "  Uninstall Complete!"
    green "=========================================="
    echo ""
    
    green "Completed operations:"
    echo "  - Stopped and deleted PM2 process"
    echo "  - Deleted application directory"
    echo "  - Backed up data to: $BACKUP_DIR"
    echo ""
    
    yellow "Backup contents:"
    echo "  - Database: $BACKUP_DIR/database/"
    echo "  - Uploads: $BACKUP_DIR/uploads/"
    echo "  - Config: $BACKUP_DIR/.env"
    echo "  - Local backups: $BACKUP_DIR/backups/"
    echo ""
    
    purple "To reinstall, run:"
    echo "  bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-linux.sh)"
    echo ""
    
    purple "To restore data after reinstall:"
    echo "  cp -r $BACKUP_DIR/database/* ~/Con-Nav-Item/database/"
    echo "  cp -r $BACKUP_DIR/uploads/* ~/Con-Nav-Item/uploads/"
    echo "  pm2 restart Con-Nav-Item"
    echo ""
    
    green "=========================================="
}

# Main function
main() {
    confirm_uninstall
    check_installation
    stop_pm2_process
    backup_data
    remove_app_directory
    cleanup_pm2_config
    cleanup_dependencies
    show_result
}

main
