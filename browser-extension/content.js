// content.js - 内容脚本
// 在网页中注入浮动快捷按钮

(function() {
    'use strict';
    
    // 避免重复注入
    if (window.__navFloatBtnInjected) return;
    window.__navFloatBtnInjected = true;
    
    // 检查是否应该显示浮动按钮
    async function shouldShowFloatBtn() {
        try {
            // 检查是否在特殊页面（不支持content script的页面）
            const url = window.location.href;
            if (url.startsWith('chrome://') || url.startsWith('edge://') || 
                url.startsWith('about:') || url.startsWith('chrome-extension://')) {
                return false;
            }
            
            const result = await chrome.storage.sync.get(['floatBtnEnabled', 'navUrl']);
            // 默认启用，且需要配置了导航站
            return result.floatBtnEnabled !== false && !!result.navUrl;
        } catch (e) {
            console.warn('检查浮动按钮配置失败:', e);
            return false;
        }
    }
    
    // 创建浮动按钮
    async function createFloatButton() {
        if (!await shouldShowFloatBtn()) return;
        
        // 创建容器
        const container = document.createElement('div');
        container.id = 'nav-float-container';
        container.innerHTML = `
            <style>
                #nav-float-container {
                    position: fixed;
                    z-index: 2147483647;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    transition: opacity 0.3s ease, transform 0.3s ease;
                }
                
                #nav-float-container.auto-hide {
                    opacity: 0.3;
                    transform: scale(0.8);
                }
                
                #nav-float-container.auto-hide:hover {
                    opacity: 1;
                    transform: scale(1);
                }
                
                #nav-float-container.dragging {
                    transition: none;
                    opacity: 0.8;
                }
                
                #nav-float-btn {
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border: none;
                    cursor: grab;
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s ease;
                    position: relative;
                    user-select: none;
                }
                
                #nav-float-btn:active {
                    cursor: grabbing;
                }
                
                #nav-float-btn:hover {
                    transform: scale(1.1);
                    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
                }
                
                #nav-float-btn:active {
                    transform: scale(0.95);
                }
                
                #nav-float-btn svg {
                    width: 24px;
                    height: 24px;
                    fill: white;
                }
                
                #nav-float-btn.success {
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                }
                
                #nav-float-btn.loading {
                    pointer-events: none;
                    opacity: 0.7;
                }
                
                #nav-float-btn .spinner {
                    width: 20px;
                    height: 20px;
                    border: 2px solid rgba(255,255,255,0.3);
                    border-top-color: white;
                    border-radius: 50%;
                    animation: nav-spin 0.8s linear infinite;
                }
                
                @keyframes nav-spin {
                    to { transform: rotate(360deg); }
                }
                
                #nav-float-menu {
                    position: absolute;
                    bottom: 56px;
                    right: 0;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                    min-width: 180px;
                    max-height: 300px;
                    overflow-y: auto;
                    display: none;
                    opacity: 0;
                    transform: translateY(10px);
                    transition: all 0.2s ease;
                }
                
                #nav-float-menu.show {
                    display: block;
                    opacity: 1;
                    transform: translateY(0);
                }
                
                .nav-menu-header {
                    padding: 12px 16px;
                    border-bottom: 1px solid #f0f0f0;
                    font-size: 12px;
                    color: #666;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .nav-menu-close {
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-size: 16px;
                    color: #999;
                    padding: 0;
                    line-height: 1;
                }
                
                .nav-menu-close:hover {
                    color: #333;
                }
                
                .nav-menu-item {
                    padding: 10px 16px;
                    cursor: pointer;
                    font-size: 14px;
                    color: #333;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: background 0.2s;
                    border: none;
                    background: none;
                    width: 100%;
                    text-align: left;
                }
                
                .nav-menu-item:hover {
                    background: #f5f5f5;
                }
                
                .nav-menu-item.quick {
                    background: #f0f7ff;
                    border-bottom: 1px solid #e0e0e0;
                }
                
                .nav-menu-item.quick:hover {
                    background: #e0efff;
                }
                
                .nav-menu-divider {
                    height: 1px;
                    background: #f0f0f0;
                    margin: 4px 0;
                }
                
                .nav-submenu {
                    padding-left: 24px;
                }
                
                .nav-submenu .nav-menu-item {
                    font-size: 13px;
                    color: #666;
                    padding: 8px 16px;
                }
                
                #nav-float-toast {
                    position: absolute;
                    bottom: 60px;
                    left: 50%;
                    transform: translateX(-50%) translateY(10px);
                    background: #333;
                    color: white;
                    padding: 10px 16px;
                    border-radius: 8px;
                    font-size: 13px;
                    z-index: 2147483647;
                    opacity: 0;
                    transform: translateY(10px);
                    transition: all 0.3s ease;
                    pointer-events: none;
                }
                
                #nav-float-toast.show {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
                
                #nav-float-toast.success {
                    background: #10b981;
                }
                
                #nav-float-toast.error {
                    background: #ef4444;
                }
            </style>
            
            <div id="nav-float-menu"></div>
            
            <button id="nav-float-btn" title="添加到导航页">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12h14" stroke="white"/>
                </svg>
            </button>
            
            <div id="nav-float-toast"></div>
        `;
        
        document.body.appendChild(container);
        
        const btn = document.getElementById('nav-float-btn');
        const menu = document.getElementById('nav-float-menu');
        
        let menuVisible = false;
        let longPressTimer = null;
        let autoHideTimer = null;
        let isDragging = false;
        let dragStartX, dragStartY, initialX, initialY;
        let hasMoved = false;
        
        // 从storage加载位置
        chrome.storage.sync.get(['floatBtnPosition'], (result) => {
            if (result.floatBtnPosition) {
                container.style.left = result.floatBtnPosition.left;
                container.style.top = result.floatBtnPosition.top;
                container.style.right = 'auto';
                container.style.bottom = 'auto';
            } else {
                // 默认位置
                container.style.bottom = '80px';
                container.style.right = '20px';
            }
        });
        
        // 自动隐藏功能
        function startAutoHideTimer() {
            clearTimeout(autoHideTimer);
            autoHideTimer = setTimeout(() => {
                if (!menuVisible && !isDragging) {
                    container.classList.add('auto-hide');
                }
            }, 3000); // 3秒后自动隐藏
        }
        
        function cancelAutoHide() {
            clearTimeout(autoHideTimer);
            container.classList.remove('auto-hide');
        }
        
        container.addEventListener('mouseenter', cancelAutoHide);
        container.addEventListener('mouseleave', startAutoHideTimer);
        
        // 初始启动自动隐藏计时器
        startAutoHideTimer();
        
        // 拖动功能
        btn.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // 只响应左键
            
            isDragging = false;
            hasMoved = false;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            
            const rect = container.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            
            // 长按计时器
            longPressTimer = setTimeout(() => {
                if (!hasMoved) {
                    showMenu();
                }
            }, 500);
            
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', onDragEnd);
        });
        
        function onDrag(e) {
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            
            // 移动超过5px才算拖动
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                hasMoved = true;
                isDragging = true;
                clearTimeout(longPressTimer);
                container.classList.add('dragging');
                cancelAutoHide();
                
                let newX = initialX + dx;
                let newY = initialY + dy;
                
                // 限制在视口内
                const btnSize = 48;
                newX = Math.max(0, Math.min(window.innerWidth - btnSize, newX));
                newY = Math.max(0, Math.min(window.innerHeight - btnSize, newY));
                
                container.style.left = newX + 'px';
                container.style.top = newY + 'px';
                container.style.right = 'auto';
                container.style.bottom = 'auto';
            }
        }
        
        function onDragEnd(e) {
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', onDragEnd);
            clearTimeout(longPressTimer);
            container.classList.remove('dragging');
            
            if (isDragging) {
                // 保存位置
                chrome.storage.sync.set({
                    floatBtnPosition: {
                        left: container.style.left,
                        top: container.style.top
                    }
                });
                isDragging = false;
            }
            
            startAutoHideTimer();
        }
        
        // 点击 - 快速添加（只有没有拖动时才触发）
        btn.addEventListener('click', async (e) => {
            if (hasMoved) {
                hasMoved = false;
                return;
            }
            if (menuVisible) {
                hideMenu();
                return;
            }
            await quickAdd();
        });
        
        // 点击其他地方关闭菜单
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                hideMenu();
            }
        });
        
        // 快速添加
        async function quickAdd() {
            btn.classList.add('loading');
            btn.innerHTML = '<div class="spinner"></div>';
            
            try {
                const response = await chrome.runtime.sendMessage({
                    action: 'quickAddToNav',
                    url: window.location.href,
                    title: document.title
                });
                
                btn.classList.remove('loading');
                
                if (response && response.success !== false) {
                    btn.classList.add('success');
                    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="white" stroke-width="2" fill="none"/></svg>';
                    showToast('已添加到导航页', 'success');
                    
                    setTimeout(() => {
                        btn.classList.remove('success');
                        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" stroke="white"/></svg>';
                    }, 2000);
                } else {
                    throw new Error(response?.error || '添加失败');
                }
            } catch (e) {
                console.error('快速添加失败:', e);
                btn.classList.remove('loading');
                btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" stroke="white"/></svg>';
                showToast(e.message || '添加失败，请稍后重试', 'error');
            }
        }
        
        // 显示分类菜单
        async function showMenu() {
            menu.innerHTML = '<div class="nav-menu-header">加载中...</div>';
            menu.classList.add('show');
            menuVisible = true;
            
            try {
                // 强制刷新获取最新分类
                const response = await chrome.runtime.sendMessage({ action: 'getMenus', forceRefresh: true });
                
                if (!response.success) {
                    menu.innerHTML = `<div class="nav-menu-header">加载失败</div>`;
                    return;
                }
                
                const config = await chrome.runtime.sendMessage({ action: 'getConfig' });
                
                let html = `
                    <div class="nav-menu-header">
                        <span>选择分类</span>
                        <button class="nav-menu-close" id="nav-menu-close">×</button>
                    </div>
                `;
                
                // 快速添加选项
                if (config.lastMenuId) {
                    const lastMenu = response.menus.find(m => m.id.toString() === config.lastMenuId);
                    if (lastMenu) {
                        let lastCategoryName = lastMenu.name;
                        if (config.lastSubMenuId && lastMenu.subMenus) {
                            const lastSubMenu = lastMenu.subMenus.find(s => s.id.toString() === config.lastSubMenuId);
                            if (lastSubMenu) lastCategoryName += ' / ' + lastSubMenu.name;
                        }
                        html += `<button class="nav-menu-item quick" data-action="quick">⚡ ${lastCategoryName}</button>`;
                    }
                }
                
                html += '<div class="nav-menu-divider"></div>';
                
                // 分类列表
                response.menus.slice(0, 8).forEach(menu => {
                    html += `<button class="nav-menu-item" data-menu-id="${menu.id}">📁 ${menu.name}</button>`;
                    
                    if (menu.subMenus && menu.subMenus.length > 0) {
                        html += '<div class="nav-submenu">';
                        menu.subMenus.slice(0, 5).forEach(sub => {
                            html += `<button class="nav-menu-item" data-menu-id="${menu.id}" data-submenu-id="${sub.id}">↳ ${sub.name}</button>`;
                        });
                        html += '</div>';
                    }
                });
                
                menu.innerHTML = html;
                
                // 绑定事件
                document.getElementById('nav-menu-close')?.addEventListener('click', hideMenu);
                
                menu.querySelectorAll('.nav-menu-item').forEach(item => {
                    item.addEventListener('click', async () => {
                        hideMenu();
                        
                        if (item.dataset.action === 'quick') {
                            await quickAdd();
                            return;
                        }
                        
                        btn.classList.add('loading');
                        btn.innerHTML = '<div class="spinner"></div>';
                        
                        try {
                            await chrome.runtime.sendMessage({
                                action: 'addToCategory',
                                menuId: item.dataset.menuId,
                                subMenuId: item.dataset.submenuId,
                                url: window.location.href,
                                title: document.title
                            });
                            
                            btn.classList.remove('loading');
                            btn.classList.add('success');
                            btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="white" stroke-width="2" fill="none"/></svg>';
                            showToast('已添加到导航页', 'success');
                            
                            setTimeout(() => {
                                btn.classList.remove('success');
                                btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" stroke="white"/></svg>';
                            }, 2000);
                        } catch (e) {
                            btn.classList.remove('loading');
                            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" stroke="white"/></svg>';
                            showToast('添加失败', 'error');
                        }
                    });
                });
            } catch (e) {
                menu.innerHTML = `<div class="nav-menu-header">加载失败</div>`;
            }
        }
        
        // 隐藏菜单
        function hideMenu() {
            menu.classList.remove('show');
            menuVisible = false;
        }
        
        // 显示提示
        function showToast(message, type = '') {
            const toast = document.getElementById('nav-float-toast');
            toast.textContent = message;
            toast.className = 'show ' + type;
            
            setTimeout(() => {
                toast.className = '';
            }, 2000);
        }
    }
    
    // 页面加载完成后创建按钮
    function initFloatButton() {
        // 延迟创建，避免与页面脚本冲突
        setTimeout(() => {
            createFloatButton().catch(e => {
                console.warn('创建浮动按钮失败:', e);
            });
        }, 500);
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFloatButton);
    } else {
        initFloatButton();
    }
})();
