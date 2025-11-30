// background.js - 后台服务脚本
// 用于处理右键菜单、快速添加到导航页、分类子菜单

// 缓存的菜单数据
let cachedMenus = [];
let lastMenuFetchTime = 0;
const MENU_CACHE_MS = 60 * 1000; // 1分钟缓存（减少延迟感）

// 扩展安装/更新时注册右键菜单
chrome.runtime.onInstalled.addListener(async () => {
    await registerContextMenus();
});

// 扩展启动时注册右键菜单
chrome.runtime.onStartup.addListener(async () => {
    await registerContextMenus();
});

// 注册基础右键菜单
async function registerContextMenus() {
    try {
        await chrome.contextMenus.removeAll();
        
        // 快速添加（使用上次分类）
        chrome.contextMenus.create({
            id: 'nav_quick_add',
            title: '⚡ 快速添加到导航页',
            contexts: ['page', 'link']
        });
        
        // 分类子菜单父项
        chrome.contextMenus.create({
            id: 'nav_category_parent',
            title: '📂 添加到分类...',
            contexts: ['page', 'link']
        });
        
        // 加载分类子菜单
        await loadAndCreateCategoryMenus();
        
        // 分隔线
        chrome.contextMenus.create({
            id: 'nav_separator',
            type: 'separator',
            contexts: ['page', 'link']
        });
        
        // 选择分类添加（打开完整界面）
        chrome.contextMenus.create({
            id: 'nav_add_with_dialog',
            title: '🚀 更多选项...',
            contexts: ['page', 'link']
        });
        
    } catch (e) {
        console.error('注册右键菜单失败:', e);
    }
}

// 加载分类并创建子菜单
async function loadAndCreateCategoryMenus() {
    try {
        const config = await chrome.storage.sync.get(['navUrl']);
        if (!config.navUrl) return;
        
        const navServerUrl = config.navUrl.replace(/\/$/, '');
        
        // 检查缓存
        if (cachedMenus.length > 0 && Date.now() - lastMenuFetchTime < MENU_CACHE_MS) {
            createCategorySubMenus(cachedMenus);
            return;
        }
        
        // 获取菜单数据
        const response = await fetch(`${navServerUrl}/api/menus`);
        if (!response.ok) return;
        
        const menus = await response.json();
        cachedMenus = menus;
        lastMenuFetchTime = Date.now();
        
        createCategorySubMenus(menus);
    } catch (e) {
        console.error('加载分类菜单失败:', e);
    }
}

// 创建分类子菜单
function createCategorySubMenus(menus) {
    // 最多显示10个常用分类
    const topMenus = menus.slice(0, 10);
    
    topMenus.forEach((menu, index) => {
        // 创建主分类
        chrome.contextMenus.create({
            id: `nav_menu_${menu.id}`,
            parentId: 'nav_category_parent',
            title: menu.name,
            contexts: ['page', 'link']
        });
        
        // 如果有子分类，创建子菜单
        if (menu.subMenus && menu.subMenus.length > 0) {
            menu.subMenus.forEach(subMenu => {
                chrome.contextMenus.create({
                    id: `nav_submenu_${menu.id}_${subMenu.id}`,
                    parentId: `nav_menu_${menu.id}`,
                    title: subMenu.name,
                    contexts: ['page', 'link']
                });
            });
        }
    });
}

// 刷新分类菜单
async function refreshCategoryMenus() {
    try {
        // 删除旧的分类子菜单
        const config = await chrome.storage.sync.get(['navUrl']);
        if (!config.navUrl) return;
        
        // 强制刷新
        lastMenuFetchTime = 0;
        cachedMenus = [];
        
        // 重新注册所有菜单
        await registerContextMenus();
    } catch (e) {
        console.error('刷新分类菜单失败:', e);
    }
}

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    try {
        let url = info.linkUrl || tab?.url || info.pageUrl;
        let title = info.linkText || tab?.title || '';
        
        if (!url) return;
        
        // 快速添加（使用上次分类）
        if (info.menuItemId === 'nav_quick_add') {
            await quickAddToNav(url, title);
            return;
        }
        
        // 打开完整界面
        if (info.menuItemId === 'nav_add_with_dialog') {
            const bookmarksUrl = chrome.runtime.getURL('bookmarks.html') + 
                `?addToNav=true&url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
            chrome.tabs.create({ url: bookmarksUrl });
            return;
        }
        
        // 添加到指定分类
        if (info.menuItemId.startsWith('nav_menu_') || info.menuItemId.startsWith('nav_submenu_')) {
            await addToSpecificCategory(info.menuItemId, url, title);
            return;
        }
    } catch (e) {
        console.error('处理右键菜单失败:', e);
    }
});

// 添加到指定分类
async function addToSpecificCategory(menuItemId, url, title) {
    try {
        let menuId, subMenuId = null;
        
        if (menuItemId.startsWith('nav_submenu_')) {
            // nav_submenu_menuId_subMenuId
            const parts = menuItemId.replace('nav_submenu_', '').split('_');
            menuId = parseInt(parts[0]);
            subMenuId = parseInt(parts[1]);
        } else {
            // nav_menu_menuId
            menuId = parseInt(menuItemId.replace('nav_menu_', ''));
        }
        
        const config = await chrome.storage.sync.get(['navUrl']);
        const token = (await chrome.storage.local.get(['navAuthToken'])).navAuthToken;
        
        if (!config.navUrl) {
            showNotification('请先配置', '请先在书签管理器中配置导航站地址');
            return;
        }
        
        if (!token) {
            showNotification('需要登录', '请在书签管理器中登录导航站');
            const bookmarksUrl = chrome.runtime.getURL('bookmarks.html') + 
                `?addToNav=true&url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
            chrome.tabs.create({ url: bookmarksUrl });
            return;
        }
        
        const navServerUrl = config.navUrl.replace(/\/$/, '');
        let logo = '';
        try {
            const urlObj = new URL(url);
            logo = `https://api.xinac.net/icon/?url=${urlObj.origin}&sz=128`;
        } catch (e) {}
        
        const response = await fetch(`${navServerUrl}/api/batch/add`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                menu_id: menuId,
                sub_menu_id: subMenuId,
                cards: [{ title: title || '无标题', url, logo, description: '' }]
            })
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                await chrome.storage.local.remove(['navAuthToken']);
                showNotification('登录已过期', '请重新登录');
                return;
            }
            throw new Error('添加失败');
        }
        
        const result = await response.json();
        
        // 保存为上次使用的分类
        await chrome.storage.sync.set({ lastMenuId: menuId.toString(), lastSubMenuId: subMenuId?.toString() || '' });
        
        if (result.added > 0) {
            showNotification('添加成功', `已添加到导航页`);
        } else if (result.skipped > 0) {
            showNotification('已跳过', '该网站已存在于导航页');
        }
    } catch (e) {
        console.error('添加到分类失败:', e);
        showNotification('添加失败', e.message);
    }
}

// 快速添加（使用上次分类）
async function quickAddToNav(url, title) {
    try {
        const config = await chrome.storage.sync.get(['navUrl', 'lastMenuId', 'lastSubMenuId']);
        const token = (await chrome.storage.local.get(['navAuthToken'])).navAuthToken;
        
        if (!config.navUrl || !config.lastMenuId) {
            showNotification('请先配置', '请先添加一次书签以设置默认分类');
            chrome.tabs.create({ url: chrome.runtime.getURL('bookmarks.html') });
            return;
        }
        
        if (!token) {
            showNotification('需要登录', '请在书签管理器中登录导航站');
            const bookmarksUrl = chrome.runtime.getURL('bookmarks.html') + 
                `?addToNav=true&url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
            chrome.tabs.create({ url: bookmarksUrl });
            return;
        }
        
        const navServerUrl = config.navUrl.replace(/\/$/, '');
        let logo = '';
        try {
            const urlObj = new URL(url);
            logo = `https://api.xinac.net/icon/?url=${urlObj.origin}&sz=128`;
        } catch (e) {}
        
        const response = await fetch(`${navServerUrl}/api/batch/add`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                menu_id: parseInt(config.lastMenuId),
                sub_menu_id: config.lastSubMenuId ? parseInt(config.lastSubMenuId) : null,
                cards: [{ title: title || '无标题', url, logo, description: '' }]
            })
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                await chrome.storage.local.remove(['navAuthToken']);
                showNotification('登录已过期', '请重新登录');
                return;
            }
            throw new Error('添加失败');
        }
        
        const result = await response.json();
        
        if (result.added > 0) {
            showNotification('添加成功', `已添加 "${title || '网站'}" 到导航页`);
        } else if (result.skipped > 0) {
            showNotification('已跳过', '该网站已存在于导航页');
        }
    } catch (e) {
        console.error('快速添加失败:', e);
        showNotification('添加失败', e.message);
    }
}

// 显示通知
function showNotification(title, message) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: title,
        message: message
    }).catch(e => console.warn('创建通知失败:', e));
}

// 监听来自内容脚本和其他页面的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'quickAddToNav') {
        quickAddToNav(request.url, request.title)
            .then(() => sendResponse({ success: true }))
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }
    
    if (request.action === 'addToCategory') {
        addToSpecificCategory(`nav_menu_${request.menuId}`, request.url, request.title)
            .then(() => sendResponse({ success: true }))
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }
    
    if (request.action === 'getMenus') {
        (async () => {
            try {
                const config = await chrome.storage.sync.get(['navUrl']);
                if (!config.navUrl) {
                    sendResponse({ success: false, error: '未配置导航站' });
                    return;
                }
                
                const navServerUrl = config.navUrl.replace(/\/$/, '');
                
                // 如果缓存有效且不是强制刷新，使用缓存
                if (!request.forceRefresh && cachedMenus.length > 0 && Date.now() - lastMenuFetchTime < MENU_CACHE_MS) {
                    sendResponse({ success: true, menus: cachedMenus });
                    return;
                }
                
                const response = await fetch(`${navServerUrl}/api/menus`);
                if (!response.ok) throw new Error('获取失败');
                
                const menus = await response.json();
                cachedMenus = menus;
                lastMenuFetchTime = Date.now();
                sendResponse({ success: true, menus });
            } catch (e) {
                // 如果请求失败但有缓存，返回缓存
                if (cachedMenus.length > 0) {
                    sendResponse({ success: true, menus: cachedMenus, fromCache: true });
                } else {
                    sendResponse({ success: false, error: e.message });
                }
            }
        })();
        return true;
    }
    
    if (request.action === 'refreshMenus') {
        refreshCategoryMenus()
            .then(() => sendResponse({ success: true }))
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }
    
    if (request.action === 'getConfig') {
        (async () => {
            const config = await chrome.storage.sync.get(['navUrl', 'lastMenuId', 'lastSubMenuId']);
            const token = (await chrome.storage.local.get(['navAuthToken'])).navAuthToken;
            sendResponse({ ...config, hasToken: !!token });
        })();
        return true;
    }
});
