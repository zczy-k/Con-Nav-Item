// content.js - 内容脚本
// 在网页中注入浮动快捷按钮和快捷添加弹窗

(function() {
    'use strict';
    
    // 监听后台管理页面发出的菜单更新事件
    if (!window.__navMenusListenerAdded) {
        window.__navMenusListenerAdded = true;
        window.addEventListener('nav-menus-updated', async () => {
            console.log('[导航站扩展] 检测到菜单更新，正在刷新右键菜单...');
            try {
                const result = await chrome.runtime.sendMessage({ action: 'refreshMenus' });
                if (result?.success) {
                    console.log('[导航站扩展] 右键菜单已刷新完成');
                } else {
                    console.warn('[导航站扩展] 右键菜单刷新失败:', result?.error);
                }
            } catch (e) {
                console.warn('[导航站扩展] 通知扩展失败:', e);
            }
        });
    }
    
    // 浮动按钮只在顶层窗口显示，不在iframe中显示
    if (window !== window.top) {
        return;
    }
    
    // 避免重复注入
    if (window.__navFloatBtnInjected) return;
    window.__navFloatBtnInjected = true;

    let floatingBtnHost = null;
    let floatingShadowRoot = null;
    let autoHideTimer = null;
    let isFloatingExpanded = false;
    const FLOATING_HIDE_DELAY = 900;
    let floatingTopPercent = 50;

    let dragState = {
        active: false,
        startY: 0,
        startTopPercent: 50,
        moved: false
    };

    function shouldShowFloatingButtonOnPage() {
        const href = window.location.href || '';
        if (!href) return false;
        if (href.startsWith('chrome://') || href.startsWith('edge://') || href.startsWith('about:') || href.startsWith('chrome-extension://')) {
            return false;
        }
        return true;
    }

    function collapseFloatingButton() {
        if (!floatingShadowRoot) return;
        const button = floatingShadowRoot.getElementById('nav-floating-btn');
        if (!button) return;
        button.classList.remove('expanded');
        isFloatingExpanded = false;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function applyFloatingTopPosition() {
        if (!floatingShadowRoot) return;
        const button = floatingShadowRoot.getElementById('nav-floating-btn');
        if (!button) return;
        button.style.top = `${floatingTopPercent}%`;
    }

    function saveFloatingTopPosition() {
        const rounded = Math.round(floatingTopPercent * 10) / 10;
        chrome.storage.sync.set({ floatingBtnTopPercent: rounded }, () => {});
    }

    function expandFloatingButton() {
        if (!floatingShadowRoot) return;
        const button = floatingShadowRoot.getElementById('nav-floating-btn');
        if (!button) return;

        applyFloatingTopPosition();
        button.classList.add('expanded');
        isFloatingExpanded = true;
    }

    function queueAutoHide() {
        if (autoHideTimer) {
            clearTimeout(autoHideTimer);
        }
        autoHideTimer = setTimeout(() => {
            collapseFloatingButton();
        }, FLOATING_HIDE_DELAY);
    }

    function removeFloatingButton() {
        if (autoHideTimer) {
            clearTimeout(autoHideTimer);
            autoHideTimer = null;
        }
        if (floatingBtnHost) {
            floatingBtnHost.remove();
            floatingBtnHost = null;
            floatingShadowRoot = null;
        }
    }

    function mountFloatingButton() {
        if (!shouldShowFloatingButtonOnPage()) return;
        if (floatingBtnHost) return;

        floatingBtnHost = document.createElement('div');
        floatingBtnHost.id = 'nav-floating-btn-host';
        document.documentElement.appendChild(floatingBtnHost);
        floatingShadowRoot = floatingBtnHost.attachShadow({ mode: 'closed' });

        floatingShadowRoot.innerHTML = `
            <style>
                .fab {
                    position: fixed;
                    right: -126px;
                    top: 50%;
                    transform: translateY(-50%);
                    z-index: 2147483645;
                    height: 44px;
                    border: none;
                    border-radius: 999px;
                    padding: 0 14px;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    color: #fff;
                    background: linear-gradient(135deg, #059669 0%, #0d9488 100%);
                    box-shadow: 0 8px 20px rgba(6, 95, 70, 0.35);
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                    font-size: 13px;
                    font-weight: 600;
                    transition: right 0.22s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.18s ease, box-shadow 0.2s ease, transform 0.2s ease;
                    width: 138px;
                    opacity: 0.92;
                }

                .fab:hover {
                    transform: translateY(-50%) translateX(-2px);
                    box-shadow: 0 10px 24px rgba(6, 95, 70, 0.42);
                }

                .fab .icon {
                    font-size: 16px;
                    line-height: 1;
                    flex-shrink: 0;
                }

                .fab .label {
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .fab::before {
                    content: "";
                    position: absolute;
                    right: 126px;
                    top: 12px;
                    width: 2px;
                    height: 20px;
                    border-radius: 999px;
                    background: rgba(13, 148, 136, 0.88);
                    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5);
                }

                .fab.expanded {
                    right: 12px;
                    opacity: 0.98;
                }

                .fab.expanded::before {
                    opacity: 0;
                }

                .fab:active {
                    transform: translateY(-50%) scale(0.995);
                }
            </style>
            <button class="fab" id="nav-floating-btn" type="button" title="添加当前网页到导航页">
                <span class="icon">+</span>
                <span class="label">添加到导航</span>
            </button>
        `;

        const button = floatingShadowRoot.getElementById('nav-floating-btn');
        if (!button) return;

        button.addEventListener('mouseenter', () => {
            if (autoHideTimer) {
                clearTimeout(autoHideTimer);
                autoHideTimer = null;
            }
            expandFloatingButton();
        });

        button.addEventListener('focus', () => {
            if (autoHideTimer) {
                clearTimeout(autoHideTimer);
                autoHideTimer = null;
            }
            expandFloatingButton();
        });

        button.addEventListener('mouseleave', () => {
            queueAutoHide();
        });

        button.addEventListener('blur', () => {
            queueAutoHide();
        });

        button.addEventListener('click', () => {
            if (dragState.moved) {
                dragState.moved = false;
                return;
            }
            const url = window.location.href;
            const title = document.title;
            openQuickAddDialog(url, title);
            expandFloatingButton();
            queueAutoHide();
        });

        button.addEventListener('pointerdown', (event) => {
            dragState.active = true;
            dragState.moved = false;
            dragState.startY = event.clientY;
            dragState.startTopPercent = floatingTopPercent;
            button.setPointerCapture(event.pointerId);
            if (autoHideTimer) {
                clearTimeout(autoHideTimer);
                autoHideTimer = null;
            }
            expandFloatingButton();
        });

        button.addEventListener('pointermove', (event) => {
            if (!dragState.active) return;
            const deltaY = event.clientY - dragState.startY;
            if (Math.abs(deltaY) > 3) {
                dragState.moved = true;
            }
            const deltaPercent = (deltaY / window.innerHeight) * 100;
            floatingTopPercent = clamp(dragState.startTopPercent + deltaPercent, 8, 92);
            applyFloatingTopPosition();
        });

        button.addEventListener('pointerup', (event) => {
            if (!dragState.active) return;
            dragState.active = false;
            button.releasePointerCapture(event.pointerId);
            if (dragState.moved) {
                saveFloatingTopPosition();
            }
            queueAutoHide();
        });

        button.addEventListener('pointercancel', () => {
            dragState.active = false;
            queueAutoHide();
        });

        queueAutoHide();
    }

    function applyFloatingButtonVisibility(enabled, topPercent) {
        if (typeof topPercent === 'number' && Number.isFinite(topPercent)) {
            floatingTopPercent = clamp(topPercent, 8, 92);
        }
        if (!enabled) {
            removeFloatingButton();
            return;
        }
        mountFloatingButton();
        collapseFloatingButton();
    }

    chrome.storage.sync.get(['showFloatingBtn', 'floatingBtnTopPercent'], (result) => {
        applyFloatingButtonVisibility(
            result.showFloatingBtn !== false,
            result.floatingBtnTopPercent
        );
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync') return;

        if (!changes.showFloatingBtn && !changes.floatingBtnTopPercent) return;

        chrome.storage.sync.get(['showFloatingBtn', 'floatingBtnTopPercent'], (result) => {
            applyFloatingButtonVisibility(
                result.showFloatingBtn !== false,
                result.floatingBtnTopPercent
            );
        });
    });
    
    // ==================== 快捷添加弹窗 ====================
    
    let quickAddDialog = null;
    let dialogShadowRoot = null;
    let dialogKeyInterceptor = null;

    function shouldIsolateDialogKey(target) {
        if (!dialogShadowRoot || !target) return false;

        const activeElement = dialogShadowRoot.activeElement;
        const element = activeElement || target;
        if (!element) return false;

        return element.tagName === 'INPUT' ||
            element.tagName === 'TEXTAREA' ||
            element.isContentEditable;
    }

    function attachDialogKeyInterceptor() {
        if (dialogKeyInterceptor) return;

        dialogKeyInterceptor = (event) => {
            if (!quickAddDialog || !dialogShadowRoot) return;
            if (!shouldIsolateDialogKey(event.target)) return;

            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
        };

        document.addEventListener('keydown', dialogKeyInterceptor, true);
        document.addEventListener('keyup', dialogKeyInterceptor, true);
        document.addEventListener('keypress', dialogKeyInterceptor, true);
    }

    function detachDialogKeyInterceptor() {
        if (!dialogKeyInterceptor) return;

        document.removeEventListener('keydown', dialogKeyInterceptor, true);
        document.removeEventListener('keyup', dialogKeyInterceptor, true);
        document.removeEventListener('keypress', dialogKeyInterceptor, true);
        dialogKeyInterceptor = null;
    }
    
    // 打开快捷添加弹窗
    async function openQuickAddDialog(url, title) {
        // 如果已存在弹窗，先关闭
        if (quickAddDialog) {
            closeQuickAddDialog();
        }
        
        url = url || window.location.href;
        title = title || document.title;
        
        // 创建弹窗容器（使用 Shadow DOM 隔离样式）
        quickAddDialog = document.createElement('div');
        quickAddDialog.id = 'nav-quick-add-dialog-host';
        document.body.appendChild(quickAddDialog);
        
        dialogShadowRoot = quickAddDialog.attachShadow({ mode: 'closed' });
        attachDialogKeyInterceptor();
        
        // 获取页面图标
        let favicon = '';
        try {
            const urlObj = new URL(url);
            favicon = `https://api.xinac.net/icon/?url=${urlObj.origin}&sz=64`;
        } catch (e) {}
        
        dialogShadowRoot.innerHTML = `
            <style>
                * {
                    box-sizing: border-box;
                    margin: 0;
                    padding: 0;
                }
                
                .overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    z-index: 2147483646;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: fadeIn 0.2s ease;
                }
                
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                @keyframes slideIn {
                    from { transform: translateY(-20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                
                .dialog {
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    width: 420px;
                    max-width: 95vw;
                    max-height: 90vh;
                    overflow: hidden;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                    animation: slideIn 0.3s ease;
                }
                
                .dialog-header {
                    padding: 16px 20px;
                    border-bottom: 1px solid #f0f0f0;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                
                .dialog-title {
                    font-size: 16px;
                    font-weight: 600;
                    color: #333;
                }
                
                .close-btn {
                    width: 28px;
                    height: 28px;
                    border: none;
                    background: #f5f5f5;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #666;
                    transition: all 0.2s;
                }
                
                .close-btn:hover {
                    background: #e0e0e0;
                    color: #333;
                }
                
                .dialog-body {
                    padding: 20px;
                    max-height: 60vh;
                    overflow-y: auto;
                }
                
                .page-preview {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px;
                    background: #f8f9fa;
                    border-radius: 10px;
                    margin-bottom: 20px;
                }
                
                .page-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 8px;
                    object-fit: contain;
                    background: white;
                    padding: 4px;
                }
                
                .page-info {
                    flex: 1;
                    min-width: 0;
                }
                
                .page-title {
                    font-size: 14px;
                    font-weight: 500;
                    color: #333;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                .page-url {
                    font-size: 12px;
                    color: #999;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    margin-top: 2px;
                }
                
                .quick-add-section {
                    margin-bottom: 16px;
                }
                
                .quick-add-btn {
                    width: 100%;
                    padding: 14px 16px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border: none;
                    border-radius: 10px;
                    color: white;
                    font-size: 15px;
                    font-weight: 500;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    transition: all 0.2s;
                }
                
                .quick-add-btn:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                }
                
                .quick-add-btn:active {
                    transform: translateY(0);
                }
                
                .quick-add-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                    transform: none;
                }
                
                .quick-add-btn .icon {
                    font-size: 18px;
                }
                
                .divider {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin: 16px 0;
                    color: #999;
                    font-size: 12px;
                }
                
                .divider::before,
                .divider::after {
                    content: '';
                    flex: 1;
                    height: 1px;
                    background: #e0e0e0;
                }
                
                .category-section {
                    margin-bottom: 16px;
                }
                
                .section-label {
                    font-size: 13px;
                    color: #666;
                    margin-bottom: 8px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    justify-content: space-between;
                }

                .section-label-main {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .section-tools {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .section-tip {
                    font-size: 11px;
                    color: #999;
                }

                .section-link-btn {
                    border: none;
                    background: none;
                    color: #667eea;
                    font-size: 12px;
                    cursor: pointer;
                    padding: 0;
                    font-weight: 600;
                }

                .section-link-btn:hover {
                    text-decoration: underline;
                }
                
                .search-input {
                    width: 100%;
                    padding: 10px 12px;
                    padding-left: 36px;
                    border: 1px solid #e0e0e0;
                    border-radius: 8px;
                    font-size: 14px;
                    outline: none;
                    transition: border-color 0.2s;
                    background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%23999" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>');
                    background-repeat: no-repeat;
                    background-position: 10px center;
                }
                
                .search-input:focus {
                    border-color: #667eea;
                }
                
                .search-input::placeholder {
                    color: #bbb;
                }
                
                .category-list {
                    max-height: 280px;
                    overflow-y: auto;
                    border: 1px solid #e0e0e0;
                    border-radius: 8px;
                    margin-top: 8px;
                }
                
                .category-list::-webkit-scrollbar {
                    width: 6px;
                }
                
                .category-list::-webkit-scrollbar-track {
                    background: #f1f1f1;
                    border-radius: 3px;
                }
                
                .category-list::-webkit-scrollbar-thumb {
                    background: #c1c1c1;
                    border-radius: 3px;
                }
                
                .category-list::-webkit-scrollbar-thumb:hover {
                    background: #a1a1a1;
                }
                
                .category-list:empty::after {
                    content: '暂无分类';
                    display: block;
                    padding: 20px;
                    text-align: center;
                    color: #999;
                    font-size: 13px;
                }
                
                .category-item {
                    padding: 11px 12px;
                    cursor: pointer;
                    font-size: 14px;
                    color: #333;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    border-bottom: 1px solid #f0f0f0;
                    transition: background 0.15s;
                    position: relative;
                }
                
                .category-item:last-child {
                    border-bottom: none;
                }
                
                .category-item:hover {
                    background: #f5f7ff;
                }
                
                .category-item.selected {
                    background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
                    color: #667eea;
                }
                
                .category-item.selected::before {
                    content: '';
                    position: absolute;
                    left: 0;
                    top: 0;
                    bottom: 0;
                    width: 3px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 0 2px 2px 0;
                }
                
                .category-item.parent {
                    font-weight: 500;
                    background: #fafafa;
                }
                
                .category-item.parent:hover {
                    background: #f0f2ff;
                }
                
                .category-item.child {
                    padding-left: 36px;
                    color: #555;
                    font-size: 13px;
                    font-weight: 400;
                    background: white;
                }
                
                .category-item.child::before {
                    content: '';
                    position: absolute;
                    left: 20px;
                    top: 50%;
                    width: 8px;
                    height: 1px;
                    background: #ddd;
                }
                
                .category-item.child.selected::before {
                    left: 0;
                    top: 0;
                    bottom: 0;
                    width: 3px;
                    height: auto;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 0 2px 2px 0;
                }
                
                .category-item .icon {
                    font-size: 14px;
                    flex-shrink: 0;
                }
                
                .category-item .name {
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                
                .category-item .count {
                    font-size: 11px;
                    color: #999;
                    background: #f0f0f0;
                    padding: 2px 6px;
                    border-radius: 10px;
                    margin-left: auto;
                }
                
                .category-item.selected .count {
                    background: #667eea20;
                    color: #667eea;
                }

                .category-actions {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    margin-left: auto;
                }

                .reorder-btn,
                .add-sub-btn {
                    border: none;
                    background: #eef2ff;
                    color: #5563d9;
                    border-radius: 6px;
                    min-width: 24px;
                    height: 24px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    font-size: 12px;
                    padding: 0 6px;
                }

                .reorder-btn:hover,
                .add-sub-btn:hover {
                    background: #dfe6ff;
                }

                .reorder-btn:disabled {
                    opacity: 0.45;
                    cursor: not-allowed;
                }

                .category-item.reordering {
                    cursor: default;
                }

                .reorder-hint {
                    margin-top: 8px;
                    font-size: 12px;
                    color: #7a7a7a;
                    line-height: 1.5;
                    background: #f8f9ff;
                    border: 1px solid #ecefff;
                    border-radius: 8px;
                    padding: 8px 10px;
                }
                
                .category-toggle {
                    margin-left: 4px;
                    color: #999;
                    transition: transform 0.2s;
                    font-size: 10px;
                    flex-shrink: 0;
                }
                
                .category-toggle.expanded {
                    transform: rotate(90deg);
                }
                
                .sub-categories {
                    display: none;
                    border-left: 2px solid #e8e8e8;
                    margin-left: 12px;
                }
                
                .sub-categories.show {
                    display: block;
                }
                
                .category-group {
                    border-bottom: 1px solid #e8e8e8;
                }
                
                .category-group:last-child {
                    border-bottom: none;
                }
                
                .more-options {
                    margin-top: 12px;
                }
                
                .toggle-btn {
                    width: 100%;
                    padding: 8px;
                    background: none;
                    border: 1px dashed #e0e0e0;
                    border-radius: 6px;
                    color: #666;
                    font-size: 13px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    transition: all 0.2s;
                }
                
                .toggle-btn:hover {
                    border-color: #667eea;
                    color: #667eea;
                }
                
                .options-panel {
                    display: none;
                    margin-top: 12px;
                    padding: 12px;
                    background: #f8f9fa;
                    border-radius: 8px;
                }
                
                .options-panel.show {
                    display: block;
                }
                
                .form-group {
                    margin-bottom: 12px;
                }
                
                .form-group:last-child {
                    margin-bottom: 0;
                }
                
                .form-label {
                    font-size: 12px;
                    color: #666;
                    margin-bottom: 4px;
                    display: block;
                }
                
                .form-input {
                    width: 100%;
                    padding: 8px 10px;
                    border: 1px solid #e0e0e0;
                    border-radius: 6px;
                    font-size: 13px;
                    outline: none;
                    transition: border-color 0.2s;
                }
                
                .form-input:focus {
                    border-color: #667eea;
                }
                
                .dialog-footer {
                    padding: 16px 20px;
                    border-top: 1px solid #f0f0f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .settings-link {
                    font-size: 13px;
                    color: #667eea;
                    text-decoration: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 6px 10px;
                    border-radius: 6px;
                    background: #f5f7ff;
                    border: 1px solid #e0e5ff;
                    transition: all 0.2s;
                }
                
                .settings-link:hover {
                    background: #e8ecff;
                    border-color: #667eea;
                }
                
                .settings-link:disabled,
                .settings-link.disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    background: #f5f5f5;
                    border-color: #e0e0e0;
                    color: #999;
                }
                
                .settings-link.success {
                    background: #d1fae5;
                    border-color: #10b981;
                    color: #059669;
                }
                
                .footer-actions {
                    display: flex;
                    gap: 8px;
                }
                
                .btn {
                    padding: 8px 16px;
                    border-radius: 6px;
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .btn-secondary {
                    background: #f5f5f5;
                    border: 1px solid #e0e0e0;
                    color: #666;
                }
                
                .btn-secondary:hover {
                    background: #e8e8e8;
                }
                
                .btn-primary {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border: none;
                    color: white;
                }
                
                .btn-primary:hover {
                    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
                }
                
                .btn-primary:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                
                .loading-spinner {
                    display: inline-block;
                    width: 14px;
                    height: 14px;
                    border: 2px solid rgba(255,255,255,0.3);
                    border-top-color: white;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }
                
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                
                .toast {
                    position: fixed;
                    top: 20px;
                    left: 50%;
                    transform: translateX(-50%) translateY(-100px);
                    background: #333;
                    color: white;
                    padding: 12px 20px;
                    border-radius: 8px;
                    font-size: 14px;
                    z-index: 2147483647;
                    transition: transform 0.3s ease;
                }
                
                .toast.show {
                    transform: translateX(-50%) translateY(0);
                }
                
                .toast.success {
                    background: #10b981;
                }
                
                .toast.error {
                    background: #ef4444;
                }
                
                .no-category-hint {
                    padding: 20px;
                    text-align: center;
                    color: #999;
                    font-size: 13px;
                }
                
                .add-category-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    padding: 10px 12px;
                    margin: 8px;
                    background: #f8f9fa;
                    border: 1px dashed #d0d0d0;
                    border-radius: 8px;
                    color: #666;
                    font-size: 13px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .add-category-btn:hover {
                    background: #f0f2ff;
                    border-color: #667eea;
                    color: #667eea;
                }
                
                .add-category-btn .icon {
                    font-size: 14px;
                }
                
                .add-sub-btn {
                    width: 22px;
                    height: 22px;
                    border: none;
                    background: transparent;
                    color: #999;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 4px;
                    font-size: 14px;
                    flex-shrink: 0;
                    margin-left: 4px;
                    transition: all 0.2s;
                }
                
                .add-sub-btn:hover {
                    background: #667eea20;
                    color: #667eea;
                }
                
                .inline-input-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 12px;
                    background: #f8f9fa;
                    border-bottom: 1px solid #e8e8e8;
                }
                
                .inline-input-wrapper.sub {
                    padding-left: 36px;
                    background: #fafafa;
                }
                
                .inline-input {
                    flex: 1;
                    padding: 6px 10px;
                    border: 1px solid #d0d0d0;
                    border-radius: 6px;
                    font-size: 13px;
                    outline: none;
                    transition: border-color 0.2s;
                }
                
                .inline-input:focus {
                    border-color: #667eea;
                }
                
                .inline-btn {
                    padding: 5px 10px;
                    border: none;
                    border-radius: 5px;
                    font-size: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .inline-btn.confirm {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }
                
                .inline-btn.confirm:hover {
                    box-shadow: 0 2px 6px rgba(102, 126, 234, 0.4);
                }
                
                .inline-btn.confirm:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                
                .inline-btn.cancel {
                    background: #f0f0f0;
                    color: #666;
                }
                
                .inline-btn.cancel:hover {
                    background: #e0e0e0;
                }
                
                .loading-state {
                    padding: 30px;
                    text-align: center;
                    color: #999;
                }
                
                .loading-state .loading-spinner {
                    width: 24px;
                    height: 24px;
                    border-color: rgba(102, 126, 234, 0.3);
                    border-top-color: #667eea;
                    margin-bottom: 10px;
                }
                
                .auth-section {
                    padding: 20px;
                    background: linear-gradient(135deg, #f8f9ff 0%, #fff5f5 100%);
                    border-radius: 12px;
                    border: 1px solid #e8e8ff;
                    margin-bottom: 16px;
                }
                
                .auth-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: #333;
                    margin-bottom: 4px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                
                .auth-desc {
                    font-size: 12px;
                    color: #666;
                    margin-bottom: 12px;
                }
                
                .auth-input-group {
                    display: flex;
                    gap: 8px;
                }
                
                .auth-input {
                    flex: 1;
                    padding: 10px 12px;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    font-size: 14px;
                    outline: none;
                    transition: all 0.2s;
                }
                
                .auth-input:focus {
                    border-color: #667eea;
                    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
                }
                
                .auth-input.error {
                    border-color: #ef4444;
                    background: #fef2f2;
                }
                
                .auth-btn {
                    padding: 10px 16px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border: none;
                    border-radius: 8px;
                    color: white;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    white-space: nowrap;
                }
                
                .auth-btn:hover {
                    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
                }
                
                .auth-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                
                .auth-error {
                    margin-top: 8px;
                    padding: 8px 10px;
                    background: #fef2f2;
                    border: 1px solid #fecaca;
                    border-radius: 6px;
                    color: #dc2626;
                    font-size: 12px;
                    display: none;
                }
                
                .auth-error.show {
                    display: block;
                }
                
                  .auth-success {
                      display: flex;
                      align-items: center;
                      gap: 8px;
                      padding: 10px 12px;
                      background: #ecfdf5;
                      border: 1px solid #a7f3d0;
                      border-radius: 8px;
                      color: #059669;
                      font-size: 13px;
                  }

                  /* 确认步骤样式 */
                  .confirm-section {
                      padding: 10px 0;
                      display: none;
                      animation: fadeIn 0.3s ease;
                  }
                  .confirm-title {
                      font-size: 14px;
                      color: #666;
                      margin-bottom: 12px;
                      font-weight: 500;
                  }
                  .confirm-info-box {
                      background: #f8f9fa;
                      border-radius: 12px;
                      padding: 16px;
                      border: 1px solid #eef0f2;
                  }
                  .confirm-row {
                      display: flex;
                      margin-bottom: 12px;
                  }
                  .confirm-row:last-child {
                      margin-bottom: 0;
                  }
                  .confirm-label {
                      width: 60px;
                      color: #999;
                      font-size: 13px;
                      flex-shrink: 0;
                  }
                  .confirm-value {
                      color: #333;
                      font-size: 13px;
                      word-break: break-all;
                      font-weight: 500;
                      flex: 1;
                  }
                  .confirm-category-path {
                      color: #667eea;
                      display: flex;
                      align-items: center;
                      gap: 4px;
                  }
              </style>
            
            <div class="overlay" id="overlay">
                <div class="dialog">
                    <div class="dialog-header">
                        <span class="dialog-title">快速添加到导航页</span>
                        <button class="close-btn" id="closeBtn">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    
                    <div class="dialog-body">
                        <div class="page-preview">
                            <img class="page-icon" src="${favicon}" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22 viewBox=%220 0 24 24%22 fill=%22%23999%22><path d=%22M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z%22/></svg>'">
                            <div class="page-info">
                                <div class="page-title" id="pageTitle">${escapeHtml(title)}</div>
                                <div class="page-url" id="pageUrl">${escapeHtml(url)}</div>
                            </div>
                        </div>
                        
                        <div class="auth-section" id="authSection" style="display: none;">
                            <div class="auth-title">
                                <span>🔐</span>
                                <span>需要验证管理密码</span>
                            </div>
                            <div class="auth-desc">首次使用需要输入导航站的管理密码进行验证</div>
                            <div class="auth-input-group">
                                <input type="password" class="auth-input" id="authPassword" placeholder="请输入管理密码" autocomplete="off">
                                <button class="auth-btn" id="authBtn">验证</button>
                            </div>
                            <div class="auth-error" id="authError"></div>
                        </div>
                        
                        <div class="quick-add-section" id="quickAddSection" style="display: none;">
                            <button class="quick-add-btn" id="quickAddBtn">
                                <span class="icon">⚡</span>
                                <span id="quickAddText">快速添加到「分类名」</span>
                            </button>
                        </div>
                        
                        <div class="divider" id="divider" style="display: none;">或选择其他分类</div>
                        
                        <div class="category-section">
                            <div class="section-label">
                                <div class="section-label-main">
                                    <span>📁</span>
                                    <span id="categorySectionTitle">选择分类</span>
                                </div>
                                <div class="section-tools">
                                    <span class="section-tip" id="categoryModeTip">分类不顺手？可就地调整</span>
                                    <button class="section-link-btn" id="reorderToggleBtn" type="button">管理顺序</button>
                                </div>
                            </div>
                            <input type="text" class="search-input" id="searchInput" placeholder="搜索分类...">
                            <div class="category-list" id="categoryList">
                                <div class="loading-state">
                                    <div class="loading-spinner"></div>
                                    <div>加载分类中...</div>
                                </div>
                            </div>
                            <div class="reorder-hint" id="reorderHint" style="display: none;">排序模式下可直接调整主分类和同一主分类内子分类的顺序；新建分类会插入到当前选中项后面。</div>
                        </div>
                        
                          <div class="confirm-section" id="confirmSection">
                              <div class="confirm-title">请确认添加信息：</div>
                              <div class="confirm-info-box">
                                  <div class="confirm-row">
                                      <span class="confirm-label">标题：</span>
                                      <span class="confirm-value" id="confirmTitleText"></span>
                                  </div>
                                  <div class="confirm-row">
                                      <span class="confirm-label">分类：</span>
                                      <span class="confirm-value confirm-category-path" id="confirmCategoryText"></span>
                                  </div>
                                  <div class="confirm-row">
                                      <span class="confirm-label">链接：</span>
                                      <span class="confirm-value" id="confirmUrlText"></span>
                                  </div>
                              </div>
                          </div>
                          
                          <div class="more-options">
                            <button class="toggle-btn" id="toggleOptions">
                                <span>⚙️</span>
                                <span>更多选项</span>
                                <span id="toggleIcon">▼</span>
                            </button>
                            <div class="options-panel" id="optionsPanel">
                                <div class="form-group">
                                    <label class="form-label">自定义标题</label>
                                    <input type="text" class="form-input" id="customTitle" value="${escapeHtml(title)}">
                                </div>
                                <div class="form-group">
                                    <label class="form-label">描述（可选）</label>
                                    <input type="text" class="form-input" id="customDesc" placeholder="输入描述...">
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="dialog-footer">
                        <button class="settings-link disabled" id="settingsLink" disabled>
                            <span>⚙️</span>
                            <span>设为默认分类</span>
                        </button>
                          <div class="footer-actions">
                              <button class="btn btn-secondary" id="backBtn" style="display: none;">返回</button>
                              <button class="btn btn-secondary" id="cancelBtn">取消</button>
                              <button class="btn btn-primary" id="submitBtn" disabled>下一步</button>
                          </div>
                    </div>
                </div>
            </div>
            
            <div class="toast" id="toast"></div>
        `;
        
        // 绑定事件
        const overlay = dialogShadowRoot.getElementById('overlay');
        const closeBtn = dialogShadowRoot.getElementById('closeBtn');
          const cancelBtn = dialogShadowRoot.getElementById('cancelBtn');
          const backBtn = dialogShadowRoot.getElementById('backBtn');
          const submitBtn = dialogShadowRoot.getElementById('submitBtn');
          const quickAddBtn = dialogShadowRoot.getElementById('quickAddBtn');

        const searchInput = dialogShadowRoot.getElementById('searchInput');
        const toggleOptions = dialogShadowRoot.getElementById('toggleOptions');
        const optionsPanel = dialogShadowRoot.getElementById('optionsPanel');
        const toggleIcon = dialogShadowRoot.getElementById('toggleIcon');
        const settingsLink = dialogShadowRoot.getElementById('settingsLink');
        const reorderToggleBtn = dialogShadowRoot.getElementById('reorderToggleBtn');
        
        // 关闭弹窗
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeQuickAddDialog();
        });
        closeBtn.addEventListener('click', closeQuickAddDialog);
        cancelBtn.addEventListener('click', closeQuickAddDialog);
        
        // ESC 关闭
        document.addEventListener('keydown', handleEscape);
        
        // 更多选项展开/收起
        toggleOptions.addEventListener('click', () => {
            optionsPanel.classList.toggle('show');
            toggleIcon.textContent = optionsPanel.classList.contains('show') ? '▲' : '▼';
        });
        
        // 设置默认分类 - 将当前选中的分类设为默认
        settingsLink.addEventListener('click', async () => {
            if (!selectedMenuId) return;
            
            try {
                // 找到选中的分类名称
                const menu = allMenus.find(m => m.id === selectedMenuId);
                let categoryName = menu ? menu.name : '';
                let subMenuName = '';
                
                if (selectedSubMenuId && menu && menu.subMenus) {
                    const subMenu = menu.subMenus.find(s => s.id === selectedSubMenuId);
                    if (subMenu) {
                        subMenuName = subMenu.name;
                        categoryName += ' / ' + subMenuName;
                    }
                }
                
                // 保存为默认分类
                await chrome.storage.sync.set({
                    defaultMenuId: selectedMenuId,
                    defaultSubMenuId: selectedSubMenuId || null,
                    defaultMenuName: menu?.name || '',
                    defaultSubMenuName: subMenuName,
                    lastMenuId: selectedMenuId.toString(),
                    lastSubMenuId: selectedSubMenuId?.toString() || ''
                });
                
                // 更新本地变量
                lastMenuId = selectedMenuId.toString();
                lastSubMenuId = selectedSubMenuId?.toString() || null;
                
                // 更新快速添加按钮
                const quickAddSection = dialogShadowRoot.getElementById('quickAddSection');
                const quickAddText = dialogShadowRoot.getElementById('quickAddText');
                const divider = dialogShadowRoot.getElementById('divider');
                
                quickAddText.textContent = `快速添加到「${categoryName}」`;
                quickAddSection.style.display = 'block';
                divider.style.display = 'flex';
                
                // 显示成功状态
                settingsLink.classList.add('success');
                settingsLink.innerHTML = '<span>✓</span><span>已设为默认</span>';
                
                setTimeout(() => {
                    settingsLink.classList.remove('success');
                    settingsLink.innerHTML = '<span>⚙️</span><span>设为默认分类</span>';
                }, 2000);
                
                showToast(`已将「${categoryName}」设为默认分类`, 'success');
            } catch (e) {
                console.error('设置默认分类失败:', e);
                showToast('设置失败', 'error');
            }
        });
        
        // 搜索分类
        searchInput.addEventListener('input', () => {
            filterCategories(searchInput.value);
        });

        reorderToggleBtn.addEventListener('click', () => {
            if (reorderInFlight) return;
            if (searchInput.value.trim()) {
                showToast('请先清空搜索后再调整顺序', 'error');
                return;
            }
            isReorderMode = !isReorderMode;
            updateCategorySectionMode();
            renderCategories(allMenus);
        });
        
          // 提交按钮
          submitBtn.addEventListener('click', () => {
              if (currentStep === 'selection') {
                  toggleStep('confirmation');
              } else {
                  submitAdd(url);
              }
          });
          
          // 返回按钮
          backBtn.addEventListener('click', () => {
              toggleStep('selection');
          });
          
          // 快速添加按钮
          quickAddBtn.addEventListener('click', () => {
              // 快速添加也进入确认步骤
              const menuId = parseInt(lastMenuId);
              const subMenuId = lastSubMenuId ? parseInt(lastSubMenuId) : null;
              selectCategory(menuId, subMenuId);
              toggleStep('confirmation');
          });
          
          // 切换步骤
          function toggleStep(step) {
              currentStep = step;
              const quickAddSection = dialogShadowRoot.getElementById('quickAddSection');
              const divider = dialogShadowRoot.getElementById('divider');
              const categorySection = dialogShadowRoot.querySelector('.category-section');
              const moreOptions = dialogShadowRoot.querySelector('.more-options');
              const confirmSection = dialogShadowRoot.getElementById('confirmSection');
              const pagePreview = dialogShadowRoot.querySelector('.page-preview');
              
              if (step === 'confirmation') {
                  // 进入确认步骤
                  quickAddSection.style.display = 'none';
                  divider.style.display = 'none';
                  categorySection.style.display = 'none';
                  moreOptions.style.display = 'none';
                  pagePreview.style.display = 'none';
                  confirmSection.style.display = 'block';
                  backBtn.style.display = 'block';
                  submitBtn.textContent = '确认添加';
                  
                  // 更新确认信息
                  const customTitle = dialogShadowRoot.getElementById('customTitle').value;
                  const menu = allMenus.find(m => m.id === selectedMenuId);
                  let categoryPath = menu ? menu.name : '';
                  if (selectedSubMenuId && menu && menu.subMenus) {
                      const subMenu = menu.subMenus.find(s => s.id === selectedSubMenuId);
                      if (subMenu) categoryPath += ' / ' + subMenu.name;
                  }
                  
                  dialogShadowRoot.getElementById('confirmTitleText').textContent = customTitle;
                  dialogShadowRoot.getElementById('confirmCategoryText').textContent = categoryPath;
                  dialogShadowRoot.getElementById('confirmUrlText').textContent = url;
              } else {
                  // 返回选择步骤
                  // 如果有上次选择，显示快速添加
                  if (lastMenuId) {
                      quickAddSection.style.display = 'block';
                      divider.style.display = 'flex';
                  }
                  categorySection.style.display = 'block';
                  moreOptions.style.display = 'block';
                  pagePreview.style.display = 'flex';
                  confirmSection.style.display = 'none';
                  backBtn.style.display = 'none';
                  submitBtn.textContent = '下一步';
              }
          }

        // 密码验证相关
        const authSection = dialogShadowRoot.getElementById('authSection');
        const authPassword = dialogShadowRoot.getElementById('authPassword');
        const authBtn = dialogShadowRoot.getElementById('authBtn');
        const authError = dialogShadowRoot.getElementById('authError');
        
        // 验证按钮点击
        authBtn.addEventListener('click', () => {
            verifyAdminPassword(url, title);
        });
        
        // 密码输入框回车
        authPassword.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                verifyAdminPassword(url, title);
            }
        });

        authPassword.addEventListener('keyup', (e) => {
            e.stopPropagation();
        });

        authPassword.addEventListener('keypress', (e) => {
            e.stopPropagation();
        });
        
        // 密码输入时清除错误状态
        authPassword.addEventListener('input', () => {
            authPassword.classList.remove('error');
            authError.classList.remove('show');
        });
        
        // 加载分类数据
        loadCategories(url, title);
    }
    
    // 关闭弹窗
    function closeQuickAddDialog() {
        if (quickAddDialog) {
            quickAddDialog.remove();
            quickAddDialog = null;
            dialogShadowRoot = null;
        }
        detachDialogKeyInterceptor();
        document.removeEventListener('keydown', handleEscape);
          // 重置状态
          isAddingCategory = false;
          isAddingSubCategory = null;
          isReorderMode = false;
          reorderInFlight = false;
          selectedMenuId = null;
          selectedSubMenuId = null;
          currentStep = 'selection';
      }
    
    // ESC 处理
    function handleEscape(e) {
        if (e.key === 'Escape') {
            closeQuickAddDialog();
        }
    }
    
    // 存储分类数据
    let allMenus = [];
    let selectedMenuId = null;
    let selectedSubMenuId = null;
    let lastMenuId = null;
    let lastSubMenuId = null;
      let isAuthenticated = false;
      let isAddingCategory = false;
      let isAddingSubCategory = null;
      let currentStep = 'selection'; // 'selection' or 'confirmation'
      let isReorderMode = false;
      let reorderInFlight = false;

    function getNewCategoryInsertAfterId() {
        if (selectedMenuId && !selectedSubMenuId) {
            return selectedMenuId;
        }
        if (selectedMenuId && selectedSubMenuId) {
            return selectedMenuId;
        }
        if (lastMenuId) {
            return parseInt(lastMenuId);
        }
        return null;
    }

    function getNewSubCategoryInsertAfterId(parentId) {
        if (selectedMenuId === parentId && selectedSubMenuId) {
            return selectedSubMenuId;
        }
        return null;
    }

    function scrollToSelectedCategory() {
        setTimeout(() => {
            if (!dialogShadowRoot) return;
            const selectedItem = dialogShadowRoot.querySelector('.category-item.selected');
            selectedItem?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        }, 30);
    }

    function updateCategorySectionMode() {
        if (!dialogShadowRoot) return;

        const titleEl = dialogShadowRoot.getElementById('categorySectionTitle');
        const tipEl = dialogShadowRoot.getElementById('categoryModeTip');
        const hintEl = dialogShadowRoot.getElementById('reorderHint');
        const search = dialogShadowRoot.getElementById('searchInput');
        const toggleBtn = dialogShadowRoot.getElementById('reorderToggleBtn');

        if (!titleEl || !tipEl || !hintEl || !search || !toggleBtn) return;

        if (isReorderMode) {
            titleEl.textContent = '调整分类顺序';
            tipEl.textContent = '完成后会保留当前已选分类';
            hintEl.style.display = 'block';
            search.style.display = 'none';
            toggleBtn.textContent = '完成调整';
        } else {
            titleEl.textContent = '选择分类';
            tipEl.textContent = '分类不顺手？可就地调整';
            hintEl.style.display = 'none';
            search.style.display = 'block';
            toggleBtn.textContent = '管理顺序';
        }
    }

    async function refreshMenusAndRender(options = {}) {
        const { preserveParentExpanded = null } = options;
        const response = await chrome.runtime.sendMessage({ action: 'getMenus', forceRefresh: true });
        if (!response.success) {
            throw new Error(response.error || '刷新分类失败');
        }
        allMenus = response.menus || [];
        if (preserveParentExpanded) {
            expandedMenus.add(preserveParentExpanded);
        }
        renderCategories(allMenus);
        scrollToSelectedCategory();
    }

    async function reorderMenuItem(menuId, targetOrder) {
        if (reorderInFlight) return;
        reorderInFlight = true;
        try {
            const result = await chrome.runtime.sendMessage({
                action: 'reorderMenu',
                menuId,
                order: targetOrder
            });

            if (!result.success) {
                if (result.needAuth) {
                    isAuthenticated = false;
                    showAuthSection();
                    showToast('登录已过期，请重新验证', 'error');
                    return;
                }
                throw new Error(result.error || '排序失败');
            }

            await refreshMenusAndRender();
            showToast('主分类顺序已更新', 'success');
        } catch (e) {
            showToast(e.message || '调整顺序失败', 'error');
        } finally {
            reorderInFlight = false;
        }
    }

    async function reorderSubMenuItem(parentId, subMenuId, targetOrder) {
        if (reorderInFlight) return;
        reorderInFlight = true;
        try {
            const result = await chrome.runtime.sendMessage({
                action: 'reorderSubCategory',
                subMenuId,
                order: targetOrder
            });

            if (!result.success) {
                if (result.needAuth) {
                    isAuthenticated = false;
                    showAuthSection();
                    showToast('登录已过期，请重新验证', 'error');
                    return;
                }
                throw new Error(result.error || '排序失败');
            }

            await refreshMenusAndRender({ preserveParentExpanded: parentId });
            showToast('子分类顺序已更新', 'success');
        } catch (e) {
            showToast(e.message || '调整顺序失败', 'error');
        } finally {
            reorderInFlight = false;
        }
    }

    
    // 加载分类数据
    async function loadCategories(url, title) {
        try {
            // 先检查是否已有 token
            const config = await chrome.runtime.sendMessage({ action: 'getConfig' });
            lastMenuId = config.lastMenuId;
            lastSubMenuId = config.lastSubMenuId;
            
            // 检查是否有 token
            const hasToken = config.hasToken;
            
            if (!hasToken) {
                // 没有 token，显示密码输入界面
                showAuthSection();
                return;
            }
            
            // 主动验证 Token 是否有效（密码可能已被修改）
            const tokenVerifyResult = await chrome.runtime.sendMessage({ action: 'verifyToken' });
            if (!tokenVerifyResult.valid) {
                // Token 无效（密码已更改或Token过期）
                isAuthenticated = false;
                
                if (tokenVerifyResult.reason === 'network_error') {
                    // 网络错误时继续尝试（可能只是暂时无法验证）
                    console.warn('Token验证网络错误，继续尝试加载');
                } else if (tokenVerifyResult.reason === 'password_changed') {
                    // 密码已更改，需要重新验证
                    showAuthSection();
                    showToast('管理密码已更改，请重新验证', 'error');
                    return;
                } else if (tokenVerifyResult.reason === 'expired') {
                    // Token过期，需要重新验证
                    showAuthSection();
                    showToast('登录已过期，请重新验证', 'error');
                    return;
                } else {
                    // 其他情况（invalid, no_token等）静默显示密码输入界面，不弹提示
                    showAuthSection();
                    return;
                }
            }
            
            isAuthenticated = true;
            
            // 强制刷新获取最新分类
            const response = await chrome.runtime.sendMessage({ action: 'getMenus' });
            
            if (!response.success) {
                showCategoryError('加载分类失败');
                return;
            }
            
            allMenus = response.menus || [];
            
            // 如果有上次选择的分类，显示快速添加
            if (lastMenuId) {
                const lastMenu = allMenus.find(m => m.id.toString() === lastMenuId);
                if (lastMenu) {
                    let categoryName = lastMenu.name;
                    if (lastSubMenuId && lastMenu.subMenus) {
                        const lastSubMenu = lastMenu.subMenus.find(s => s.id.toString() === lastSubMenuId);
                        if (lastSubMenu) categoryName += ' / ' + lastSubMenu.name;
                    }
                    
                    const quickAddSection = dialogShadowRoot.getElementById('quickAddSection');
                    const quickAddText = dialogShadowRoot.getElementById('quickAddText');
                    const divider = dialogShadowRoot.getElementById('divider');
                    
                    quickAddText.textContent = `快速添加到「${categoryName}」`;
                    quickAddSection.style.display = 'block';
                    divider.style.display = 'flex';
                }
            }
            
            renderCategories(allMenus);
            updateCategorySectionMode();
        } catch (e) {
            console.error('加载分类失败:', e);
            showCategoryError('加载分类失败');
        }
    }
    
    // 验证成功后加载分类（跳过 Token 验证）
    async function loadCategoriesAfterAuth(url, title) {
        try {
            const config = await chrome.runtime.sendMessage({ action: 'getConfig' });
            lastMenuId = config.lastMenuId;
            lastSubMenuId = config.lastSubMenuId;
            
            // 强制刷新获取最新分类
            const response = await chrome.runtime.sendMessage({ action: 'getMenus' });
            
            if (!response.success) {
                showCategoryError('加载分类失败');
                return;
            }
            
            allMenus = response.menus || [];
            
            // 如果有上次选择的分类，显示快速添加
            if (lastMenuId) {
                const lastMenu = allMenus.find(m => m.id.toString() === lastMenuId);
                if (lastMenu) {
                    let categoryName = lastMenu.name;
                    if (lastSubMenuId && lastMenu.subMenus) {
                        const lastSubMenu = lastMenu.subMenus.find(s => s.id.toString() === lastSubMenuId);
                        if (lastSubMenu) categoryName += ' / ' + lastSubMenu.name;
                    }
                    
                    const quickAddSection = dialogShadowRoot.getElementById('quickAddSection');
                    const quickAddText = dialogShadowRoot.getElementById('quickAddText');
                    const divider = dialogShadowRoot.getElementById('divider');
                    
                    quickAddText.textContent = `快速添加到「${categoryName}」`;
                    quickAddSection.style.display = 'block';
                    divider.style.display = 'flex';
                }
            }
            
            renderCategories(allMenus);
            updateCategorySectionMode();
        } catch (e) {
            console.error('加载分类失败:', e);
            showCategoryError('加载分类失败');
        }
    }
    
    // 显示密码验证区域
    function showAuthSection() {
        const authSection = dialogShadowRoot.getElementById('authSection');
        const categorySection = dialogShadowRoot.querySelector('.category-section');
        const quickAddSection = dialogShadowRoot.getElementById('quickAddSection');
        const divider = dialogShadowRoot.getElementById('divider');
        const moreOptions = dialogShadowRoot.querySelector('.more-options');
        const submitBtn = dialogShadowRoot.getElementById('submitBtn');
        const settingsLink = dialogShadowRoot.getElementById('settingsLink');
        
        // 显示密码输入区域
        authSection.style.display = 'block';
        
        // 隐藏分类选择和其他操作
        categorySection.style.display = 'none';
        quickAddSection.style.display = 'none';
        divider.style.display = 'none';
        moreOptions.style.display = 'none';
        submitBtn.disabled = true;
        settingsLink.disabled = true;
        settingsLink.classList.add('disabled');
        
        // 聚焦密码输入框
        setTimeout(() => {
            const authPassword = dialogShadowRoot.getElementById('authPassword');
            authPassword.focus();
        }, 100);
    }
    
    // 验证管理密码
    async function verifyAdminPassword(url, title) {
        const authPassword = dialogShadowRoot.getElementById('authPassword');
        const authBtn = dialogShadowRoot.getElementById('authBtn');
        const authError = dialogShadowRoot.getElementById('authError');
        
        const password = authPassword.value.trim();
        
        if (!password) {
            authPassword.classList.add('error');
            authError.textContent = '请输入管理密码';
            authError.classList.add('show');
            authPassword.focus();
            return;
        }
        
        // 禁用按钮，显示加载状态
        authBtn.disabled = true;
        authBtn.innerHTML = '<span class="loading-spinner" style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></span>';
        
        try {
            // 发送验证请求到 background
            const response = await chrome.runtime.sendMessage({
                action: 'verifyAdminPassword',
                password: password
            });
            
if (response.success) {
                  // 验证成功
                  isAuthenticated = true;
                  
                  // 隐藏密码输入，显示分类选择
                  const authSection = dialogShadowRoot.getElementById('authSection');
                  const categorySection = dialogShadowRoot.querySelector('.category-section');
                  const moreOptions = dialogShadowRoot.querySelector('.more-options');
                  
                  authSection.style.display = 'none';
                  categorySection.style.display = 'block';
                  moreOptions.style.display = 'block';
                  
                  showToast('验证成功', 'success');
                  
                  // 重新加载分类（跳过 Token 验证，因为刚刚验证成功）
                  loadCategoriesAfterAuth(url, title);
              } else {
                // 验证失败
                authPassword.classList.add('error');
                authError.textContent = response.error || '密码错误，请重新输入';
                authError.classList.add('show');
                authPassword.value = '';
                authPassword.focus();
            }
        } catch (e) {
            console.error('验证密码失败:', e);
            authError.textContent = '验证失败，请检查网络连接';
            authError.classList.add('show');
        } finally {
            // 恢复按钮状态
            authBtn.disabled = false;
            authBtn.textContent = '验证';
        }
    }
    
    // 存储展开状态
    let expandedMenus = new Set();
    
    // 渲染分类列表
    function renderCategories(menus, searchTerm = '') {
        const categoryList = dialogShadowRoot.getElementById('categoryList');
        
        let html = '';
        const term = searchTerm.toLowerCase();
        
        // 新建分类的输入框（放在列表最前面）
        if (isAddingCategory && !term) {
            html += `
                <div class="inline-input-wrapper" id="newCategoryWrapper">
                    <input type="text" class="inline-input" id="newCategoryInput" placeholder="输入分类名称..." maxlength="20" autofocus>
                    <button class="inline-btn confirm" id="confirmNewCategory">确定</button>
                    <button class="inline-btn cancel" id="cancelNewCategory">取消</button>
                </div>
            `;
        }
        
        if (!menus || menus.length === 0) {
            if (!isAddingCategory) {
                html += '<div class="no-category-hint">暂无分类</div>';
            }
            // 新建分类按钮
            if (!term) {
                html += `
                    <div class="add-category-btn" id="addCategoryBtn">
                        <span class="icon">➕</span>
                        <span>新建分类</span>
                    </div>
                `;
            }
            categoryList.innerHTML = html;
            bindCategoryEvents();
            return;
        }
        
        menus.forEach(menu => {
            const menuMatch = !term || menu.name.toLowerCase().includes(term);
            const subMatches = (menu.subMenus || []).filter(sub => 
                !term || sub.name.toLowerCase().includes(term)
            );
            
            if (menuMatch || subMatches.length > 0) {
                const isSelected = selectedMenuId === menu.id && !selectedSubMenuId;
                const hasChildren = menu.subMenus && menu.subMenus.length > 0;
                const childCount = menu.subMenus?.length || 0;
                const menuIndex = menus.findIndex(item => item.id === menu.id);
                const canMoveMenuUp = menuIndex > 0;
                const canMoveMenuDown = menuIndex < menus.length - 1;
                // 搜索时自动展开，否则保持用户的展开状态
                const shouldExpand = term ? true : expandedMenus.has(menu.id);
                
                html += `<div class="category-group">`;
                html += `
                    <div class="category-item parent ${isSelected ? 'selected' : ''}" 
                         data-menu-id="${menu.id}"
                         data-has-children="${hasChildren}">
                        <span class="icon">📁</span>
                        <span class="name">${escapeHtml(menu.name)}</span>
                        ${hasChildren ? `<span class="count">${childCount}</span>` : ''}
                        <div class="category-actions">
                            ${isReorderMode ? `
                                <button class="reorder-btn" data-reorder-type="menu-up" data-menu-id="${menu.id}" ${canMoveMenuUp ? '' : 'disabled'} title="上移">↑</button>
                                <button class="reorder-btn" data-reorder-type="menu-down" data-menu-id="${menu.id}" ${canMoveMenuDown ? '' : 'disabled'} title="下移">↓</button>
                            ` : ''}
                            <button class="add-sub-btn" data-parent-id="${menu.id}" title="添加子分类">➕</button>
                        </div>
                        ${hasChildren ? `<span class="category-toggle ${shouldExpand ? 'expanded' : ''}">▶</span>` : ''}
                    </div>
                `;
                
                // 子分类区域
                const showSubContainer = hasChildren || isAddingSubCategory === menu.id;
                if (showSubContainer) {
                    html += `<div class="sub-categories ${shouldExpand || isAddingSubCategory === menu.id ? 'show' : ''}" data-parent="${menu.id}">`;
                    
                    // 新建子分类的输入框
                    if (isAddingSubCategory === menu.id && !term) {
                        html += `
                            <div class="inline-input-wrapper sub" id="newSubCategoryWrapper">
                                <input type="text" class="inline-input" id="newSubCategoryInput" placeholder="输入子分类名称..." maxlength="20" autofocus>
                                <button class="inline-btn confirm" id="confirmNewSubCategory" data-parent-id="${menu.id}">确定</button>
                                <button class="inline-btn cancel" id="cancelNewSubCategory">取消</button>
                            </div>
                        `;
                    }
                    
                    const subsToShow = term ? subMatches : (menu.subMenus || []);
                    subsToShow.forEach((sub, subIndex) => {
                        const isSubSelected = selectedMenuId === menu.id && selectedSubMenuId === sub.id;
                        const canMoveSubUp = subIndex > 0;
                        const canMoveSubDown = subIndex < subsToShow.length - 1;
                        html += `
                            <div class="category-item child ${isSubSelected ? 'selected' : ''} ${isReorderMode ? 'reordering' : ''}" 
                                 data-menu-id="${menu.id}"
                                 data-submenu-id="${sub.id}">
                                <span class="name">${escapeHtml(sub.name)}</span>
                                ${isReorderMode ? `
                                    <div class="category-actions">
                                        <button class="reorder-btn" data-reorder-type="sub-up" data-menu-id="${menu.id}" data-submenu-id="${sub.id}" ${canMoveSubUp ? '' : 'disabled'} title="上移">↑</button>
                                        <button class="reorder-btn" data-reorder-type="sub-down" data-menu-id="${menu.id}" data-submenu-id="${sub.id}" ${canMoveSubDown ? '' : 'disabled'} title="下移">↓</button>
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    });
                    
                    html += '</div>';
                }
                html += `</div>`;
            }
        });
        
        // 没有匹配项时的提示
        if (!html || (html.indexOf('category-group') === -1 && !isAddingCategory)) {
            html += '<div class="no-category-hint">没有找到匹配的分类</div>';
        }
        
        // 新建分类按钮（放在列表底部，搜索时不显示）
        if (!term && !isAddingCategory) {
            html += `
                <div class="add-category-btn" id="addCategoryBtn">
                    <span class="icon">➕</span>
                    <span>新建分类</span>
                </div>
            `;
        }
        
        categoryList.innerHTML = html;
        bindCategoryEvents();
    }
    
    // 绑定分类相关事件
    function bindCategoryEvents() {
        const categoryList = dialogShadowRoot.getElementById('categoryList');

        categoryList.querySelectorAll('.reorder-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (btn.disabled) return;

                const type = btn.dataset.reorderType;
                const menuId = parseInt(btn.dataset.menuId);
                const subMenuId = btn.dataset.submenuId ? parseInt(btn.dataset.submenuId) : null;

                if (type === 'menu-up' || type === 'menu-down') {
                    const menu = allMenus.find(item => item.id === menuId);
                    if (!menu) return;
                    const targetOrder = Number(menu.order || 0) + (type === 'menu-up' ? -1 : 1);
                    await reorderMenuItem(menuId, targetOrder);
                    return;
                }

                if (type === 'sub-up' || type === 'sub-down') {
                    const parentMenu = allMenus.find(item => item.id === menuId);
                    const subMenus = parentMenu?.subMenus || [];
                    const currentIndex = subMenus.findIndex(item => item.id === subMenuId);
                    if (currentIndex === -1) return;
                    const targetIndex = currentIndex + (type === 'sub-up' ? -1 : 1);
                    if (targetIndex < 0 || targetIndex >= subMenus.length) return;
                    const targetOrder = Number(subMenus[targetIndex].order || 0);
                    await reorderSubMenuItem(menuId, subMenuId, targetOrder);
                }
            });
        });
        
        // 绑定点击事件
        categoryList.querySelectorAll('.category-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // 如果点击的是添加子分类按钮，不触发选中
                if (e.target.classList.contains('add-sub-btn') || e.target.classList.contains('reorder-btn')) {
                    return;
                }

                if (isReorderMode) {
                    return;
                }
                
                // 如果点击的是展开/折叠按钮，只展开不选中
                if (e.target.classList.contains('category-toggle')) {
                    const menuId = parseInt(item.dataset.menuId);
                    const toggle = item.querySelector('.category-toggle');
                    const subContainer = categoryList.querySelector(`[data-parent="${menuId}"]`);
                    
                    if (subContainer) {
                        const isExpanded = subContainer.classList.contains('show');
                        subContainer.classList.toggle('show');
                        if (toggle) {
                            toggle.classList.toggle('expanded', !isExpanded);
                        }
                        if (isExpanded) {
                            expandedMenus.delete(menuId);
                        } else {
                            expandedMenus.add(menuId);
                        }
                    }
                    return;
                }
                
                const menuId = parseInt(item.dataset.menuId);
                const subMenuId = item.dataset.submenuId ? parseInt(item.dataset.submenuId) : null;
                const hasChildren = item.dataset.hasChildren === 'true';
                
                // 如果是父级且有子分类，点击时展开并选中
                if (hasChildren && !subMenuId) {
                    const toggle = item.querySelector('.category-toggle');
                    const subContainer = categoryList.querySelector(`[data-parent="${menuId}"]`);
                    
                    if (subContainer) {
                        const isExpanded = subContainer.classList.contains('show');
                        if (!isExpanded) {
                            subContainer.classList.add('show');
                            if (toggle) {
                                toggle.classList.add('expanded');
                            }
                            expandedMenus.add(menuId);
                        }
                    }
                }
                
                // 选中分类
                selectCategory(menuId, subMenuId);
            });
        });
        
        // 新建分类按钮
        const addCategoryBtn = categoryList.querySelector('#addCategoryBtn');
        if (addCategoryBtn) {
            addCategoryBtn.addEventListener('click', () => {
                isAddingCategory = true;
                isAddingSubCategory = null;
                renderCategories(allMenus);
                // 聚焦输入框
                setTimeout(() => {
                    const input = dialogShadowRoot.getElementById('newCategoryInput');
                    if (input) input.focus();
                }, 50);
            });
        }
        
        // 新建分类确认/取消
        const confirmNewCategory = categoryList.querySelector('#confirmNewCategory');
        const cancelNewCategory = categoryList.querySelector('#cancelNewCategory');
        const newCategoryInput = categoryList.querySelector('#newCategoryInput');
        
        if (confirmNewCategory) {
            confirmNewCategory.addEventListener('click', () => createNewCategory());
        }
        if (cancelNewCategory) {
            cancelNewCategory.addEventListener('click', () => {
                isAddingCategory = false;
                renderCategories(allMenus);
            });
        }
        if (newCategoryInput) {
            newCategoryInput.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') createNewCategory();
                if (e.key === 'Escape') {
                    isAddingCategory = false;
                    renderCategories(allMenus);
                }
            });
        }
        
        // 添加子分类按钮
        categoryList.querySelectorAll('.add-sub-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const parentId = parseInt(btn.dataset.parentId);
                isAddingSubCategory = parentId;
                isAddingCategory = false;
                expandedMenus.add(parentId); // 自动展开父分类
                renderCategories(allMenus);
                // 聚焦输入框
                setTimeout(() => {
                    const input = dialogShadowRoot.getElementById('newSubCategoryInput');
                    if (input) input.focus();
                }, 50);
            });
        });
        
        // 新建子分类确认/取消
        const confirmNewSubCategory = categoryList.querySelector('#confirmNewSubCategory');
        const cancelNewSubCategory = categoryList.querySelector('#cancelNewSubCategory');
        const newSubCategoryInput = categoryList.querySelector('#newSubCategoryInput');
        
        if (confirmNewSubCategory) {
            confirmNewSubCategory.addEventListener('click', () => {
                const parentId = parseInt(confirmNewSubCategory.dataset.parentId);
                createNewSubCategory(parentId);
            });
        }
        if (cancelNewSubCategory) {
            cancelNewSubCategory.addEventListener('click', () => {
                isAddingSubCategory = null;
                renderCategories(allMenus);
            });
        }
        if (newSubCategoryInput) {
            newSubCategoryInput.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                    const parentId = isAddingSubCategory;
                    if (parentId) createNewSubCategory(parentId);
                }
                if (e.key === 'Escape') {
                    isAddingSubCategory = null;
                    renderCategories(allMenus);
                }
            });
        }
    }
    
    // 创建新分类
    async function createNewCategory() {
        const input = dialogShadowRoot.getElementById('newCategoryInput');
        const confirmBtn = dialogShadowRoot.getElementById('confirmNewCategory');
        const name = input?.value?.trim();
        
        if (!name) {
            input?.focus();
            return;
        }
        
        // 检查是否重名
        if (allMenus.some(m => m.name === name)) {
            showToast('分类名称已存在', 'error');
            input?.focus();
            return;
        }
        
        confirmBtn.disabled = true;
        confirmBtn.textContent = '...';
        
        try {
            const result = await chrome.runtime.sendMessage({
                action: 'createCategory',
                name: name,
                afterId: getNewCategoryInsertAfterId()
            });
            
            if (result.success) {
                showToast('分类创建成功', 'success');
                isAddingCategory = false;
                await refreshMenusAndRender();
                // 自动选中新建的分类
                if (result.menuId) {
                    selectCategory(result.menuId, null);
                }
            } else {
                // 检查是否需要认证
                if (result.needAuth) {
                    isAuthenticated = false;
                    showAuthSection();
                    showToast('请先验证密码', 'error');
                    return;
                }
                throw new Error(result.error || '创建失败');
            }
        } catch (e) {
            showToast(e.message || '创建分类失败', 'error');
            confirmBtn.disabled = false;
            confirmBtn.textContent = '确定';
        }
    }
    
    // 创建新子分类
    async function createNewSubCategory(parentId) {
        const input = dialogShadowRoot.getElementById('newSubCategoryInput');
        const confirmBtn = dialogShadowRoot.getElementById('confirmNewSubCategory');
        const name = input?.value?.trim();
        
        if (!name) {
            input?.focus();
            return;
        }
        
        // 检查是否重名
        const parentMenu = allMenus.find(m => m.id === parentId);
        if (parentMenu?.subMenus?.some(s => s.name === name)) {
            showToast('子分类名称已存在', 'error');
            input?.focus();
            return;
        }
        
        confirmBtn.disabled = true;
        confirmBtn.textContent = '...';
        
        try {
            const result = await chrome.runtime.sendMessage({
                action: 'createSubCategory',
                parentId: parentId,
                name: name,
                afterSubMenuId: getNewSubCategoryInsertAfterId(parentId)
            });
            
            if (result.success) {
                showToast('子分类创建成功', 'success');
                isAddingSubCategory = null;
                await refreshMenusAndRender({ preserveParentExpanded: parentId });
                // 自动选中新建的子分类
                if (result.subMenuId) {
                    selectCategory(parentId, result.subMenuId);
                }
            } else {
                // 检查是否需要认证
                if (result.needAuth) {
                    isAuthenticated = false;
                    showAuthSection();
                    showToast('请先验证密码', 'error');
                    return;
                }
                throw new Error(result.error || '创建失败');
            }
        } catch (e) {
            showToast(e.message || '创建子分类失败', 'error');
            confirmBtn.disabled = false;
            confirmBtn.textContent = '确定';
        }
    }
    
    // 选中分类
    function selectCategory(menuId, subMenuId) {
        selectedMenuId = menuId;
        selectedSubMenuId = subMenuId;
        
        // 更新选中状态
        const categoryList = dialogShadowRoot.getElementById('categoryList');
        categoryList.querySelectorAll('.category-item').forEach(item => {
            const itemMenuId = parseInt(item.dataset.menuId);
            const itemSubMenuId = item.dataset.submenuId ? parseInt(item.dataset.submenuId) : null;
            
            if (itemMenuId === menuId && itemSubMenuId === subMenuId) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
        
        // 启用提交按钮
        const submitBtn = dialogShadowRoot.getElementById('submitBtn');
        submitBtn.disabled = false;
        
        // 启用设为默认分类按钮
        const settingsLink = dialogShadowRoot.getElementById('settingsLink');
        settingsLink.disabled = false;
        settingsLink.classList.remove('disabled');

        scrollToSelectedCategory();
    }
    
    // 搜索过滤分类
    function filterCategories(searchTerm) {
        renderCategories(allMenus, searchTerm);
    }
    
    // 显示分类加载错误
    function showCategoryError(message) {
        const categoryList = dialogShadowRoot.getElementById('categoryList');
        categoryList.innerHTML = `<div class="no-category-hint">${escapeHtml(message)}</div>`;
    }
    
    // 快速添加到上次分类
    async function quickAddToLast(url) {
        if (!lastMenuId) return;
        
        const quickAddBtn = dialogShadowRoot.getElementById('quickAddBtn');
        quickAddBtn.disabled = true;
        quickAddBtn.innerHTML = '<span class="loading-spinner"></span><span>添加中...</span>';
        
        try {
            const customTitle = dialogShadowRoot.getElementById('customTitle').value;
            const customDesc = dialogShadowRoot.getElementById('customDesc').value;
            
            const response = await chrome.runtime.sendMessage({
                action: 'addToCategory',
                menuId: lastMenuId,
                subMenuId: lastSubMenuId,
                url: url,
                title: customTitle,
                description: customDesc
            });
            
            if (handleAddResponse(response)) {
            } else {
                // 检查是否是认证失败
                if (response?.needAuth || response?.error?.includes('登录') || response?.error?.includes('401') || response?.error?.includes('密码已更改')) {
                    isAuthenticated = false;
                    showAuthSection();
                    const message = response?.error?.includes('密码已更改') ? '管理密码已更改，请重新验证' : '登录已过期，请重新验证';
                    showToast(message, 'error');
                } else {
                    throw new Error(response?.error || '添加失败');
                }
            }
        } catch (e) {
            showToast(e.message || '添加失败', 'error');
            quickAddBtn.disabled = false;
            quickAddBtn.innerHTML = `<span class="icon">⚡</span><span id="quickAddText">快速添加</span>`;
        }
    }
    
    // 提交添加
    async function submitAdd(url) {
        if (!selectedMenuId) {
            showToast('请选择分类', 'error');
            return;
        }
        
        const submitBtn = dialogShadowRoot.getElementById('submitBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="loading-spinner"></span>';
        
        try {
            const customTitle = dialogShadowRoot.getElementById('customTitle').value;
            const customDesc = dialogShadowRoot.getElementById('customDesc').value;
            
            const response = await chrome.runtime.sendMessage({
                action: 'addToCategory',
                menuId: selectedMenuId.toString(),
                subMenuId: selectedSubMenuId?.toString(),
                url: url,
                title: customTitle,
                description: customDesc
            });
            
            if (handleAddResponse(response)) {
            } else {
                // 检查是否是认证失败
                if (response?.needAuth || response?.error?.includes('登录') || response?.error?.includes('401') || response?.error?.includes('密码已更改')) {
                    isAuthenticated = false;
                    showAuthSection();
                    const message = response?.error?.includes('密码已更改') ? '管理密码已更改，请重新验证' : '登录已过期，请重新验证';
                    showToast(message, 'error');
                } else {
                    throw new Error(response?.error || '添加失败');
                }
            }
        } catch (e) {
            showToast(e.message || '添加失败', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '添加';
        }
    }
    
    // 显示提示
    function showToast(message, type = '') {
        const toast = dialogShadowRoot.getElementById('toast');
        toast.textContent = message;
        toast.className = 'toast show ' + type;
        
        setTimeout(() => {
            toast.className = 'toast';
        }, 2000);
    }

    function handleAddResponse(response) {
        if (!response || response.success === false) {
            return false;
        }

        if (response.skipped > 0 && !response.added) {
            showToast('已跳过：该网站已存在', 'success');
            setTimeout(closeQuickAddDialog, 1000);
            return true;
        }

        if (response.added > 0 || response.success) {
            showToast('添加成功', 'success');
            setTimeout(closeQuickAddDialog, 1000);
            return true;
        }

        return false;
    }
    
    // HTML 转义
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // 监听来自 background.js 的消息（打开快捷添加弹窗）
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'openQuickAddDialog') {
            openQuickAddDialog(request.url, request.title);
            sendResponse({ success: true });
        }
        return true;
    });
})();
