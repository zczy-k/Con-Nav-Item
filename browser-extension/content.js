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
    
    // 监听来自 background.js 的消息（打开快捷添加弹窗）
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'openQuickAddDialog') {
            openQuickAddDialog(request.url, request.title);
            sendResponse({ success: true });
        }
        return true;
    });
    
    // 浮动按钮只在顶层窗口显示，不在iframe中显示
    if (window !== window.top) {
        return;
    }
    
    // 避免重复注入
    if (window.__navFloatBtnInjected) return;
    window.__navFloatBtnInjected = true;
    
    // ==================== 快捷添加弹窗 ====================
    
    let quickAddDialog = null;
    let dialogShadowRoot = null;
    
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
                        
                        <div class="quick-add-section" id="quickAddSection" style="display: none;">
                            <button class="quick-add-btn" id="quickAddBtn">
                                <span class="icon">⚡</span>
                                <span id="quickAddText">快速添加到「分类名」</span>
                            </button>
                        </div>
                        
                        <div class="divider" id="divider" style="display: none;">或选择其他分类</div>
                        
                        <div class="category-section">
                            <div class="section-label">
                                <span>📁</span>
                                <span>选择分类</span>
                            </div>
                            <input type="text" class="search-input" id="searchInput" placeholder="搜索分类...">
                            <div class="category-list" id="categoryList">
                                <div class="loading-state">
                                    <div class="loading-spinner"></div>
                                    <div>加载分类中...</div>
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
                            <button class="btn btn-secondary" id="cancelBtn">取消</button>
                            <button class="btn btn-primary" id="submitBtn" disabled>添加</button>
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
        const submitBtn = dialogShadowRoot.getElementById('submitBtn');
        const quickAddBtn = dialogShadowRoot.getElementById('quickAddBtn');
        const searchInput = dialogShadowRoot.getElementById('searchInput');
        const toggleOptions = dialogShadowRoot.getElementById('toggleOptions');
        const optionsPanel = dialogShadowRoot.getElementById('optionsPanel');
        const toggleIcon = dialogShadowRoot.getElementById('toggleIcon');
        const settingsLink = dialogShadowRoot.getElementById('settingsLink');
        
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
        
        // 提交按钮
        submitBtn.addEventListener('click', () => {
            submitAdd(url);
        });
        
        // 快速添加按钮
        quickAddBtn.addEventListener('click', () => {
            quickAddToLast(url);
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
        document.removeEventListener('keydown', handleEscape);
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
    
    // 加载分类数据
    async function loadCategories(url, title) {
        try {
            // 获取配置（上次选择的分类）
            const config = await chrome.runtime.sendMessage({ action: 'getConfig' });
            lastMenuId = config.lastMenuId;
            lastSubMenuId = config.lastSubMenuId;
            
            // 强制刷新获取最新分类
            const response = await chrome.runtime.sendMessage({ action: 'getMenus', forceRefresh: true });
            
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
        } catch (e) {
            console.error('加载分类失败:', e);
            showCategoryError('加载分类失败');
        }
    }
    
    // 存储展开状态
    let expandedMenus = new Set();
    
    // 渲染分类列表
    function renderCategories(menus, searchTerm = '') {
        const categoryList = dialogShadowRoot.getElementById('categoryList');
        
        if (!menus || menus.length === 0) {
            categoryList.innerHTML = '<div class="no-category-hint">暂无分类，请先在导航站创建分类</div>';
            return;
        }
        
        let html = '';
        const term = searchTerm.toLowerCase();
        
        menus.forEach(menu => {
            const menuMatch = !term || menu.name.toLowerCase().includes(term);
            const subMatches = (menu.subMenus || []).filter(sub => 
                !term || sub.name.toLowerCase().includes(term)
            );
            
            if (menuMatch || subMatches.length > 0) {
                const isSelected = selectedMenuId === menu.id && !selectedSubMenuId;
                const hasChildren = menu.subMenus && menu.subMenus.length > 0;
                const childCount = menu.subMenus?.length || 0;
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
                        ${hasChildren ? `<span class="category-toggle ${shouldExpand ? 'expanded' : ''}">▶</span>` : ''}
                    </div>
                `;
                
                if (hasChildren) {
                    html += `<div class="sub-categories ${shouldExpand ? 'show' : ''}" data-parent="${menu.id}">`;
                    
                    const subsToShow = term ? subMatches : menu.subMenus;
                    subsToShow.forEach(sub => {
                        const isSubSelected = selectedMenuId === menu.id && selectedSubMenuId === sub.id;
                        html += `
                            <div class="category-item child ${isSubSelected ? 'selected' : ''}" 
                                 data-menu-id="${menu.id}"
                                 data-submenu-id="${sub.id}">
                                <span class="name">${escapeHtml(sub.name)}</span>
                            </div>
                        `;
                    });
                    
                    html += '</div>';
                }
                html += `</div>`;
            }
        });
        
        categoryList.innerHTML = html || '<div class="no-category-hint">没有找到匹配的分类</div>';
        
        // 绑定点击事件
        categoryList.querySelectorAll('.category-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const menuId = parseInt(item.dataset.menuId);
                const subMenuId = item.dataset.submenuId ? parseInt(item.dataset.submenuId) : null;
                const hasChildren = item.dataset.hasChildren === 'true';
                
                // 如果是父级且有子分类
                if (hasChildren && !subMenuId) {
                    const toggle = item.querySelector('.category-toggle');
                    const subContainer = categoryList.querySelector(`[data-parent="${menuId}"]`);
                    
                    if (subContainer) {
                        const isExpanded = subContainer.classList.contains('show');
                        subContainer.classList.toggle('show');
                        if (toggle) {
                            toggle.classList.toggle('expanded', !isExpanded);
                        }
                        // 记住展开状态
                        if (isExpanded) {
                            expandedMenus.delete(menuId);
                        } else {
                            expandedMenus.add(menuId);
                        }
                    }
                    // 父分类有子分类时，点击只展开不选中
                    return;
                }
                
                // 选中分类（子分类或无子分类的父分类）
                selectCategory(menuId, subMenuId);
            });
        });
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
            
            if (response && response.success !== false) {
                showToast('添加成功', 'success');
                setTimeout(closeQuickAddDialog, 1000);
            } else {
                throw new Error(response?.error || '添加失败');
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
            
            if (response && response.success !== false) {
                showToast('添加成功', 'success');
                setTimeout(closeQuickAddDialog, 1000);
            } else {
                throw new Error(response?.error || '添加失败');
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
    
    // HTML 转义
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // ==================== 浮动按钮 ====================
    
    async function shouldShowFloatBtn() {
        try {
            const url = window.location.href;
            if (url.startsWith('chrome://') || url.startsWith('edge://') || 
                url.startsWith('about:') || url.startsWith('chrome-extension://')) {
                return false;
            }
            
            const result = await chrome.storage.sync.get(['floatBtnEnabled', 'navUrl']);
            return result.floatBtnEnabled !== false && !!result.navUrl;
        } catch (e) {
            console.warn('检查浮动按钮配置失败:', e);
            return false;
        }
    }
    
    async function createFloatButton() {
        if (!await shouldShowFloatBtn()) return;
        
        const container = document.createElement('div');
        container.id = 'nav-float-container';
        container.innerHTML = `
            <style>
                #nav-float-container {
                    position: fixed;
                    z-index: 2147483647;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                
                #nav-float-container.dragging {
                    transition: none;
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
                
                #nav-float-container.collapsed #nav-float-btn {
                    width: 6px;
                    height: 50px;
                    border-radius: 4px 0 0 4px;
                    box-shadow: -2px 0 8px rgba(102, 126, 234, 0.3);
                    opacity: 0.5;
                    transform: none;
                }
                
                #nav-float-container.collapsed.collapsed-left #nav-float-btn {
                    border-radius: 0 4px 4px 0;
                    box-shadow: 2px 0 8px rgba(102, 126, 234, 0.3);
                }
                
                #nav-float-container.collapsed #nav-float-btn svg {
                    opacity: 0;
                    transition: opacity 0.2s;
                }
                
                #nav-float-container.collapsed #nav-float-btn:hover {
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    opacity: 1;
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                }
                
                #nav-float-container.collapsed #nav-float-btn:hover svg {
                    opacity: 1;
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
                    white-space: nowrap;
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
            
            <button id="nav-float-btn" title="添加到导航页（长按打开分类选择）">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12h14" stroke="white"/>
                </svg>
            </button>
            
            <div id="nav-float-toast"></div>
        `;
        
        document.body.appendChild(container);
        
        const btn = document.getElementById('nav-float-btn');
        
        let longPressTimer = null;
        let autoHideTimer = null;
        let isDragging = false;
        let dragStartX, dragStartY, initialX, initialY;
        let hasMoved = false;
        
        chrome.storage.sync.get(['floatBtnPosition'], (result) => {
            if (result.floatBtnPosition) {
                container.style.left = result.floatBtnPosition.left;
                container.style.top = result.floatBtnPosition.top;
                container.style.right = 'auto';
                container.style.bottom = 'auto';
            } else {
                container.style.bottom = '80px';
                container.style.right = '20px';
            }
        });
        
        function isOnRightSide() {
            const rect = container.getBoundingClientRect();
            return rect.left > window.innerWidth / 2;
        }
        
        let expandedPosition = null;
        
        function startAutoHideTimer() {
            clearTimeout(autoHideTimer);
            autoHideTimer = setTimeout(() => {
                if (!isDragging) {
                    expandedPosition = {
                        left: container.style.left,
                        top: container.style.top,
                        right: container.style.right,
                        bottom: container.style.bottom
                    };
                    
                    container.classList.remove('collapsed', 'collapsed-left');
                    container.classList.add('collapsed');
                    
                    if (isOnRightSide()) {
                        container.style.left = 'auto';
                        container.style.right = '0px';
                    } else {
                        container.classList.add('collapsed-left');
                        container.style.right = 'auto';
                        container.style.left = '0px';
                    }
                }
            }, 1000);
        }
        
        function cancelAutoHide() {
            clearTimeout(autoHideTimer);
            if (container.classList.contains('collapsed') && expandedPosition) {
                container.style.left = expandedPosition.left;
                container.style.top = expandedPosition.top;
                container.style.right = expandedPosition.right;
                container.style.bottom = expandedPosition.bottom;
            }
            container.classList.remove('collapsed', 'collapsed-left');
        }
        
        container.addEventListener('mouseenter', cancelAutoHide);
        container.addEventListener('mouseleave', startAutoHideTimer);
        
        startAutoHideTimer();
        
        btn.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            
            isDragging = false;
            hasMoved = false;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            
            const rect = container.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            
            // 长按 500ms 打开弹窗
            longPressTimer = setTimeout(() => {
                if (!hasMoved) {
                    openQuickAddDialog(window.location.href, document.title);
                }
            }, 500);
            
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', onDragEnd);
        });
        
        function onDrag(e) {
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                hasMoved = true;
                isDragging = true;
                clearTimeout(longPressTimer);
                container.classList.add('dragging');
                cancelAutoHide();
                
                let newX = initialX + dx;
                let newY = initialY + dy;
                
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
        
        // 点击 - 快速添加
        btn.addEventListener('click', async (e) => {
            if (hasMoved) {
                hasMoved = false;
                return;
            }
            await quickAddFromFloat();
        });
        
        // 快速添加
        async function quickAddFromFloat() {
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
                    showFloatToast('已添加到导航页', 'success');
                    
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
                showFloatToast(e.message || '添加失败，请稍后重试', 'error');
            }
        }
        
        function showFloatToast(message, type = '') {
            const toast = document.getElementById('nav-float-toast');
            toast.textContent = message;
            toast.className = 'show ' + type;
            
            setTimeout(() => {
                toast.className = '';
            }, 2000);
        }
    }
    
    function initFloatButton() {
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
