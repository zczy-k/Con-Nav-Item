// background.js - 后台服务脚本
// 用于处理右键菜单、快速添加到导航页、分类子菜单

// 缓存的菜单数据
let cachedMenus = [];
let lastMenuFetchTime = 0;
const MENU_CACHE_MS = 5 * 60 * 1000; // 5分钟缓存
let isLoadingMenus = false; // 防止并发请求

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
        if (!config.navUrl) {
            console.warn('未配置导航站地址，跳过加载分类菜单');
            return;
        }
        
        const navServerUrl = config.navUrl.replace(/\/$/, '');
        
        // 检查缓存
        if (cachedMenus.length > 0 && Date.now() - lastMenuFetchTime < MENU_CACHE_MS) {
            createCategorySubMenus(cachedMenus);
            return;
        }
        
        // 防止并发请求
        if (isLoadingMenus) {
            return;
        }
        
        isLoadingMenus = true;
        
        // 获取菜单数据（带超时）
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时
        
        try {
            const response = await fetch(`${navServerUrl}/api/menus`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const menus = await response.json();
            
            // 验证数据格式
            if (!Array.isArray(menus)) {
                throw new Error('菜单数据格式错误');
            }
            
            cachedMenus = menus;
            lastMenuFetchTime = Date.now();
            
            // 持久化缓存到storage（离线可用）
            await chrome.storage.local.set({ 
                cachedMenus: menus,
                lastMenuFetchTime: Date.now()
            });
            
            createCategorySubMenus(menus);
        } catch (fetchError) {
            clearTimeout(timeoutId);
            
            // 如果网络失败，尝试从storage加载缓存
            if (cachedMenus.length === 0) {
                const stored = await chrome.storage.local.get(['cachedMenus', 'lastMenuFetchTime']);
                if (stored.cachedMenus && Array.isArray(stored.cachedMenus)) {
                    cachedMenus = stored.cachedMenus;
                    lastMenuFetchTime = stored.lastMenuFetchTime || 0;
                    createCategorySubMenus(cachedMenus);
                    return;
                }
            }
            
            throw fetchError;
        }
    } catch (e) {
        console.error('加载分类菜单失败:', e.message);
        // 即使失败也创建基础菜单，保证功能可用
    } finally {
        isLoadingMenus = false;
    }
}

// 创建分类子菜单
function createCategorySubMenus(menus) {
    if (!menus || menus.length === 0) {
        console.warn('没有可用的分类菜单');
        return;
    }
    
    // 最多显示12个常用分类
    const topMenus = menus.slice(0, 12);
    
    topMenus.forEach((menu) => {
        try {
            // 创建主分类
            chrome.contextMenus.create({
                id: `nav_menu_${menu.id}`,
                parentId: 'nav_category_parent',
                title: menu.name || '未命名分类',
                contexts: ['page', 'link']
            });
            
            // 如果有子分类，创建子菜单（最多显示8个）
            if (menu.subMenus && Array.isArray(menu.subMenus) && menu.subMenus.length > 0) {
                menu.subMenus.slice(0, 8).forEach(subMenu => {
                    chrome.contextMenus.create({
                        id: `nav_submenu_${menu.id}_${subMenu.id}`,
                        parentId: `nav_menu_${menu.id}`,
                        title: subMenu.name || '未命名子分类',
                        contexts: ['page', 'link']
                    });
                });
            }
        } catch (e) {
            console.error(`创建菜单项失败 (${menu.name}):`, e.message);
        }
    });
}

// 刷新分类菜单
async function refreshCategoryMenus() {
    try {
        const config = await chrome.storage.sync.get(['navUrl']);
        if (!config.navUrl) return;
        
        // 强制刷新缓存
        lastMenuFetchTime = 0;
        
        // 重新注册所有菜单（会自动获取最新数据）
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
        const tabId = tab?.id;
        
        if (!url) {
            console.warn('无法获取URL');
            return;
        }
        
        // 过滤特殊协议
        if (url.startsWith('chrome://') || url.startsWith('edge://') || 
            url.startsWith('about:') || url.startsWith('chrome-extension://')) {
            showNotification('无法添加', '不支持添加浏览器内部页面');
            return;
        }
        
        // 快速添加（使用上次分类）
        if (info.menuItemId === 'nav_quick_add') {
            await quickAddToNav(url, title, tabId);
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
            await addToSpecificCategory(info.menuItemId, url, title, tabId);
            return;
        }
    } catch (e) {
        console.error('处理右键菜单失败:', e);
        showNotification('操作失败', e.message || '请稍后重试');
    }
});

// 添加到指定分类
async function addToSpecificCategory(menuItemId, url, title, tabId = null) {
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
        
        // 构建卡片数据（包含自动生成的标签和描述）
        const card = await buildCardData(url, title, navServerUrl, token, tabId);
        
        const response = await fetch(`${navServerUrl}/api/batch/add`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                menu_id: menuId,
                sub_menu_id: subMenuId,
                cards: [card]
            })
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                await chrome.storage.local.remove(['navAuthToken']);
                showNotification('登录已过期', '正在打开登录页面...');
                // 打开登录页面并传递当前要添加的URL
                const bookmarksUrl = chrome.runtime.getURL('bookmarks.html') + 
                    `?addToNav=true&url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
                chrome.tabs.create({ url: bookmarksUrl });
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
async function quickAddToNav(url, title, tabId = null) {
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
        
        // 构建卡片数据（包含自动生成的标签和描述）
        const card = await buildCardData(url, title, navServerUrl, token, tabId);
        
        const response = await fetch(`${navServerUrl}/api/batch/add`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                menu_id: parseInt(config.lastMenuId),
                sub_menu_id: config.lastSubMenuId ? parseInt(config.lastSubMenuId) : null,
                cards: [card]
            })
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                await chrome.storage.local.remove(['navAuthToken']);
                showNotification('登录已过期', '正在打开登录页面...');
                // 打开登录页面并传递当前要添加的URL
                const bookmarksUrl = chrome.runtime.getURL('bookmarks.html') + 
                    `?addToNav=true&url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
                chrome.tabs.create({ url: bookmarksUrl });
                return;
            }
            throw new Error('添加失败');
        }
        
        const result = await response.json();
        
        if (result.added > 0) {
            showNotification('添加成功', `已添加 "${card.title}" 到导航页`);
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
    // 检查通知权限
    if (!chrome.notifications) {
        console.warn('通知API不可用');
        return;
    }
    
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: title,
        message: message,
        priority: 1
    }).catch(e => {
        console.warn('创建通知失败:', e.message);
    });
}

// ==================== 自动生成标签和描述 ====================

// 截断文本到指定长度
function truncateText(text, maxLength) {
    if (!text) return '';
    text = text.trim();
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 1) + '…';
}

// 自动生成描述
function generateDescription(title, domain) {
    if (!title && !domain) return '';
    
    let desc = '';
    if (title) {
        desc = title.replace(/[\|\-–—_]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    
    if (domain && !desc.toLowerCase().includes(domain.toLowerCase())) {
        desc = desc ? `${desc} - ${domain}` : domain;
    }
    
    return truncateText(desc, 100);
}

// 智能标签分析 - 扩展的域名映射
const DOMAIN_TAG_MAP = {
    // 开发技术
    'github.com': '开发', 'gitlab.com': '开发', 'bitbucket.org': '开发',
    'stackoverflow.com': '技术', 'stackexchange.com': '技术',
    'npmjs.com': '开发', 'pypi.org': '开发', 'maven.org': '开发',
    'docker.com': '开发', 'kubernetes.io': '开发',
    'juejin.cn': '技术', 'csdn.net': '技术', 'cnblogs.com': '技术',
    'segmentfault.com': '技术', 'oschina.net': '技术', 'gitee.com': '开发',
    'dev.to': '技术', 'hashnode.com': '技术', 'hackernews.com': '技术',
    'codepen.io': '开发', 'jsfiddle.net': '开发', 'codesandbox.io': '开发',
    
    // 视频娱乐
    'youtube.com': '视频', 'bilibili.com': '视频', 'youku.com': '视频',
    'iqiyi.com': '视频', 'v.qq.com': '视频', 'twitch.tv': '直播',
    'douyu.com': '直播', 'huya.com': '直播', 'netflix.com': '影视',
    'disneyplus.com': '影视', 'hbomax.com': '影视', 'primevideo.com': '影视',
    
    // 社交媒体
    'twitter.com': '社交', 'x.com': '社交', 'facebook.com': '社交',
    'instagram.com': '社交', 'linkedin.com': '职场', 'weibo.com': '社交',
    'douban.com': '社区', 'xiaohongshu.com': '社交', 'tiktok.com': '短视频',
    'reddit.com': '社区', 'v2ex.com': '社区', 'discord.com': '社区',
    'telegram.org': '通讯', 'slack.com': '协作',
    
    // 购物电商
    'taobao.com': '购物', 'tmall.com': '购物', 'jd.com': '购物',
    'amazon.com': '购物', 'amazon.cn': '购物', 'ebay.com': '购物',
    'pinduoduo.com': '购物', 'suning.com': '购物', 'dangdang.com': '购物',
    
    // 知识学习
    'zhihu.com': '问答', 'quora.com': '问答', 'wikipedia.org': '百科',
    'baike.baidu.com': '百科', 'coursera.org': '学习', 'udemy.com': '学习',
    'edx.org': '学习', 'mooc.cn': '学习', 'icourse163.org': '学习',
    'khan.academy': '学习', 'leetcode.com': '刷题', 'hackerrank.com': '刷题',
    
    // 设计创意
    'figma.com': '设计', 'sketch.com': '设计', 'canva.com': '设计',
    'dribbble.com': '设计', 'behance.net': '设计', 'pinterest.com': '灵感',
    'unsplash.com': '图片', 'pexels.com': '图片', 'pixabay.com': '图片',
    
    // 工具效率
    'notion.so': '笔记', 'evernote.com': '笔记', 'onenote.com': '笔记',
    'trello.com': '项目', 'asana.com': '项目', 'jira.atlassian.com': '项目',
    'google.com': '搜索', 'baidu.com': '搜索', 'bing.com': '搜索',
    'translate.google.com': '翻译', 'deepl.com': '翻译',
    
    // 音乐音频
    'spotify.com': '音乐', 'music.163.com': '音乐', 'music.qq.com': '音乐',
    'kugou.com': '音乐', 'kuwo.cn': '音乐', 'soundcloud.com': '音乐',
    
    // 新闻资讯
    'news.qq.com': '新闻', 'news.sina.com.cn': '新闻', 'thepaper.cn': '新闻',
    'bbc.com': '新闻', 'cnn.com': '新闻', 'reuters.com': '新闻',
    '36kr.com': '科技', 'techcrunch.com': '科技', 'wired.com': '科技',
    
    // 云服务
    'aws.amazon.com': '云服务', 'cloud.google.com': '云服务',
    'azure.microsoft.com': '云服务', 'aliyun.com': '云服务',
    'cloud.tencent.com': '云服务', 'huaweicloud.com': '云服务',
    
    // AI工具
    'openai.com': 'AI', 'chat.openai.com': 'AI', 'claude.ai': 'AI',
    'bard.google.com': 'AI', 'midjourney.com': 'AI', 'stability.ai': 'AI',
    'huggingface.co': 'AI', 'replicate.com': 'AI'
};

// 路径关键词映射
const PATH_KEYWORDS = {
    '/doc': '文档', '/docs': '文档', '/documentation': '文档',
    '/api': 'API', '/reference': '参考',
    '/blog': '博客', '/article': '文章', '/post': '文章',
    '/news': '新闻', '/press': '新闻',
    '/tool': '工具', '/tools': '工具', '/utility': '工具',
    '/download': '下载', '/release': '下载',
    '/learn': '学习', '/tutorial': '教程', '/guide': '指南', '/course': '课程',
    '/video': '视频', '/watch': '视频',
    '/shop': '购物', '/store': '商店', '/product': '产品',
    '/forum': '论坛', '/community': '社区', '/discuss': '讨论',
    '/dashboard': '控制台', '/admin': '管理', '/console': '控制台',
    '/pricing': '定价', '/plan': '方案',
    '/about': '关于', '/contact': '联系',
    '/login': '登录', '/signup': '注册', '/auth': '认证'
};

// 标题/内容关键词映射（中英文）
const CONTENT_KEYWORDS = {
    // 技术开发
    '文档': '文档', 'documentation': '文档', 'docs': '文档',
    'api': 'API', '接口': 'API',
    '教程': '教程', 'tutorial': '教程', 'guide': '指南',
    '工具': '工具', 'tool': '工具', 'utility': '工具',
    '官网': '官网', 'official': '官网', 'home': '首页',
    '开源': '开源', 'open source': '开源', 'opensource': '开源',
    '框架': '框架', 'framework': '框架',
    '库': '库', 'library': '库',
    '插件': '插件', 'plugin': '插件', 'extension': '扩展',
    
    // 内容类型
    '视频': '视频', 'video': '视频', 'watch': '视频',
    '音乐': '音乐', 'music': '音乐', 'song': '音乐',
    '图片': '图片', 'image': '图片', 'photo': '图片', 'gallery': '图库',
    '新闻': '新闻', 'news': '新闻', '资讯': '资讯',
    '博客': '博客', 'blog': '博客',
    '论坛': '论坛', 'forum': '论坛', 'bbs': '论坛',
    
    // 功能类型
    '下载': '下载', 'download': '下载',
    '在线': '在线', 'online': '在线',
    '免费': '免费', 'free': '免费',
    '登录': '登录', 'login': '登录', 'signin': '登录',
    '注册': '注册', 'register': '注册', 'signup': '注册',
    
    // AI相关
    'ai': 'AI', '人工智能': 'AI', 'artificial intelligence': 'AI',
    'chatgpt': 'AI', 'gpt': 'AI', 'llm': 'AI',
    '机器学习': 'AI', 'machine learning': 'AI', 'ml': 'AI',
    '深度学习': 'AI', 'deep learning': 'AI',
    
    // 其他
    '游戏': '游戏', 'game': '游戏', 'gaming': '游戏',
    '电影': '影视', 'movie': '影视', 'film': '影视',
    '购物': '购物', 'shop': '购物', 'store': '商店', 'buy': '购物',
    '学习': '学习', 'learn': '学习', 'course': '课程', 'education': '教育'
};

// 智能生成标签名称
function generateTagNames(url, title, description = '', keywords = '') {
    const tags = new Set();
    
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace(/^www\./, '');
        const pathname = urlObj.pathname.toLowerCase();
        const fullText = `${title} ${description} ${keywords}`.toLowerCase();
        
        // 1. 域名匹配（精确匹配）
        for (const [site, tag] of Object.entries(DOMAIN_TAG_MAP)) {
            if (domain === site || domain.endsWith('.' + site)) {
                tags.add(tag);
                break;
            }
        }
        
        // 2. 域名包含匹配（模糊匹配）
        if (tags.size === 0) {
            for (const [site, tag] of Object.entries(DOMAIN_TAG_MAP)) {
                if (domain.includes(site.split('.')[0])) {
                    tags.add(tag);
                    break;
                }
            }
        }
        
        // 3. 子域名分析
        const subdomains = domain.split('.');
        if (subdomains.length > 2) {
            const subdomain = subdomains[0];
            const subdomainTags = {
                'docs': '文档', 'doc': '文档', 'api': 'API',
                'blog': '博客', 'news': '新闻', 'shop': '购物',
                'store': '商店', 'app': '应用', 'dev': '开发',
                'admin': '管理', 'dashboard': '控制台',
                'learn': '学习', 'edu': '教育', 'help': '帮助',
                'support': '支持', 'community': '社区', 'forum': '论坛'
            };
            if (subdomainTags[subdomain]) {
                tags.add(subdomainTags[subdomain]);
            }
        }
        
        // 4. 路径关键词匹配
        for (const [path, tag] of Object.entries(PATH_KEYWORDS)) {
            if (pathname.includes(path)) {
                tags.add(tag);
                if (tags.size >= 3) break;
            }
        }
        
        // 5. 标题/描述/关键词内容分析
        for (const [keyword, tag] of Object.entries(CONTENT_KEYWORDS)) {
            if (fullText.includes(keyword.toLowerCase())) {
                tags.add(tag);
                if (tags.size >= 3) break;
            }
        }
        
        // 6. 特殊域名后缀分析
        if (domain.endsWith('.edu') || domain.endsWith('.edu.cn')) {
            tags.add('教育');
        } else if (domain.endsWith('.gov') || domain.endsWith('.gov.cn')) {
            tags.add('政府');
        } else if (domain.endsWith('.org')) {
            tags.add('组织');
        }
        
    } catch (e) {
        console.warn('标签生成失败:', e);
    }
    
    // 返回最多3个标签
    return Array.from(tags).slice(0, 3).map(tag => truncateText(tag, 8));
}

// 获取或创建标签ID
async function getOrCreateTagIds(tagNames, navServerUrl, token) {
    if (!tagNames || tagNames.length === 0) return [];
    
    const tagIds = [];
    
    // 获取已有标签
    let existingTags = [];
    try {
        const response = await fetch(`${navServerUrl}/api/tags`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            existingTags = await response.json();
        }
    } catch (e) {}
    
    for (const tagName of tagNames) {
        const existing = existingTags.find(t => t.name === tagName);
        if (existing) {
            tagIds.push(existing.id);
        } else {
            try {
                const response = await fetch(`${navServerUrl}/api/tags`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ name: tagName })
                });
                
                if (response.ok) {
                    const newTag = await response.json();
                    tagIds.push(newTag.id);
                    existingTags.push({ id: newTag.id, name: tagName });
                }
            } catch (e) {}
        }
    }
    
    return tagIds;
}

// 从当前标签页获取网页meta信息
async function getPageMetaInfo(tabId) {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                const getMeta = (name) => {
                    const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
                    return el ? el.getAttribute('content') : '';
                };
                return {
                    description: getMeta('description') || getMeta('og:description') || '',
                    keywords: getMeta('keywords') || '',
                    ogTitle: getMeta('og:title') || '',
                    ogType: getMeta('og:type') || '',
                    category: getMeta('category') || getMeta('article:section') || ''
                };
            }
        });
        return results[0]?.result || {};
    } catch (e) {
        console.warn('获取页面meta失败:', e);
        return {};
    }
}

// 构建卡片数据（包含自动生成的标签和描述）
async function buildCardData(url, title, navServerUrl, token, tabId = null) {
    let logo = '';
    let domain = '';
    let metaInfo = {};
    
    try {
        const urlObj = new URL(url);
        logo = `https://api.xinac.net/icon/?url=${urlObj.origin}&sz=128`;
        domain = urlObj.hostname.replace(/^www\./, '');
    } catch (e) {}
    
    // 尝试获取页面meta信息
    if (tabId) {
        metaInfo = await getPageMetaInfo(tabId);
    }
    
    const cardTitle = truncateText(title || metaInfo.ogTitle || domain || '无标题', 20);
    const description = truncateText(metaInfo.description || generateDescription(title, domain), 100);
    
    // 使用增强的标签生成，传入更多信息
    const tagNames = generateTagNames(url, title, metaInfo.description, metaInfo.keywords);
    const tagIds = await getOrCreateTagIds(tagNames, navServerUrl, token);
    
    return {
        title: cardTitle,
        url,
        logo,
        description,
        tagIds
    };
}

// 监听来自内容脚本和其他页面的消息
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
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
        // 立即返回，后台异步刷新
        sendResponse({ success: true });
        refreshCategoryMenus().catch(e => console.error('刷新菜单失败:', e));
        return false;
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


// ==================== 自动更新热门书签 ====================

const HOT_FOLDER_NAME = '🔥 热门书签';
const HOT_UPDATE_INTERVAL = 5 * 60 * 1000; // 5分钟
const HOT_BOOKMARKS_COUNT = 20; // 热门书签数量

// 特殊文件夹名称（这些文件夹中的书签不参与热门计算）
const SHORTCUT_FOLDER_NAMES = ['🔥 热门书签', '⭐ 常用', '🕐 最近使用'];

// 启动时设置定时器
let hotBookmarksTimer = null;

// 初始化热门书签自动更新
async function initHotBookmarksAutoUpdate() {
    // 检查是否启用自动更新
    const settings = await chrome.storage.local.get(['autoUpdateHotBookmarks']);
    if (settings.autoUpdateHotBookmarks === false) {
        return;
    }
    
    // 启动时先更新一次
    setTimeout(() => {
        autoUpdateHotBookmarks();
    }, 30000); // 延迟30秒，等待浏览器完全启动
    
    // 设置定时器
    if (hotBookmarksTimer) {
        clearInterval(hotBookmarksTimer);
    }
    hotBookmarksTimer = setInterval(autoUpdateHotBookmarks, HOT_UPDATE_INTERVAL);
}

// 自动更新热门书签
async function autoUpdateHotBookmarks() {
    try {
        // 获取所有书签
        const tree = await chrome.bookmarks.getTree();
        const allBookmarks = [];
        collectBookmarks(tree, allBookmarks);
        
        // 过滤掉特殊文件夹中的书签
        const normalBookmarks = allBookmarks.filter(b => !isInSpecialFolder(b, tree));
        
        if (normalBookmarks.length === 0) {
            return;
        }
        
        // 计算每个书签的热度分数
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        
        const scoredBookmarks = [];
        for (const bookmark of normalBookmarks) {
            try {
                const visits = await chrome.history.getVisits({ url: bookmark.url });
                const usage = visits.length;
                const lastVisit = visits.length > 0 ? Math.max(...visits.map(v => v.visitTime || 0)) : 0;
                
                // 频率分数
                const frequencyScore = Math.min(usage * 10, 100);
                
                // 时间分数
                let recencyScore = 0;
                if (lastVisit > 0) {
                    const daysAgo = (now - lastVisit) / dayMs;
                    if (daysAgo < 1) recencyScore = 100;
                    else if (daysAgo < 3) recencyScore = 80;
                    else if (daysAgo < 7) recencyScore = 60;
                    else if (daysAgo < 30) recencyScore = 40;
                    else if (daysAgo < 90) recencyScore = 20;
                    else recencyScore = 10;
                }
                
                const totalScore = frequencyScore * 0.6 + recencyScore * 0.4;
                
                if (totalScore > 0) {
                    scoredBookmarks.push({ bookmark, score: totalScore });
                }
            } catch (e) {
                // 忽略单个书签的错误
            }
        }
        
        // 按分数排序，取TOP N
        scoredBookmarks.sort((a, b) => b.score - a.score);
        const topBookmarks = scoredBookmarks.slice(0, HOT_BOOKMARKS_COUNT);
        
        if (topBookmarks.length === 0) {
            return;
        }
        
        // 获取或创建热门书签文件夹
        const bookmarkBar = tree[0]?.children?.[0];
        if (!bookmarkBar) {
            return;
        }
        
        let hotFolder = bookmarkBar.children?.find(c => c.title === HOT_FOLDER_NAME);
        
        if (hotFolder) {
            // 获取最新的文件夹内容
            const [updatedFolder] = await chrome.bookmarks.getSubTree(hotFolder.id);
            
            // 清空现有热门书签
            if (updatedFolder.children) {
                for (const child of updatedFolder.children) {
                    try {
                        await chrome.bookmarks.remove(child.id);
                    } catch (e) {}
                }
            }
        } else {
            // 创建热门书签文件夹
            hotFolder = await chrome.bookmarks.create({
                parentId: bookmarkBar.id,
                title: HOT_FOLDER_NAME,
                index: 0
            });
        }
        
        // 添加TOP N书签的副本
        for (const item of topBookmarks) {
            await chrome.bookmarks.create({
                parentId: hotFolder.id,
                title: item.bookmark.title,
                url: item.bookmark.url
            });
        }
        
        // 记录更新时间
        await chrome.storage.local.set({ lastHotBookmarksUpdate: Date.now() });
        
    } catch (error) {
        console.error('自动更新热门书签失败:', error);
    }
}

// 收集所有书签
function collectBookmarks(nodes, bookmarks) {
    for (const node of nodes) {
        if (node.children) {
            collectBookmarks(node.children, bookmarks);
        } else if (node.url) {
            bookmarks.push(node);
        }
    }
}

// 检查书签是否在特殊文件夹中
function isInSpecialFolder(bookmark, tree) {
    let parentId = bookmark.parentId;
    
    while (parentId && parentId !== '0') {
        const parent = findNodeById(tree, parentId);
        if (!parent) break;
        
        if (SHORTCUT_FOLDER_NAMES.includes(parent.title)) {
            return true;
        }
        
        parentId = parent.parentId;
    }
    
    return false;
}

// 在书签树中查找节点
function findNodeById(nodes, id) {
    for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
            const found = findNodeById(node.children, id);
            if (found) return found;
        }
    }
    return null;
}

// 监听设置变化
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.autoUpdateHotBookmarks) {
        if (changes.autoUpdateHotBookmarks.newValue === false) {
            // 禁用自动更新
            if (hotBookmarksTimer) {
                clearInterval(hotBookmarksTimer);
                hotBookmarksTimer = null;
            }
        } else {
            // 启用自动更新
            initHotBookmarksAutoUpdate();
        }
    }
});

// 扩展启动时初始化
chrome.runtime.onStartup.addListener(() => {
    initHotBookmarksAutoUpdate();
});

// 扩展安装/更新时初始化
chrome.runtime.onInstalled.addListener(() => {
    initHotBookmarksAutoUpdate();
});

// 监听手动触发更新的消息
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'updateHotBookmarks') {
        autoUpdateHotBookmarks()
            .then(() => sendResponse({ success: true }))
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }
    
    if (request.action === 'setAutoUpdateHotBookmarks') {
        chrome.storage.local.set({ autoUpdateHotBookmarks: request.enabled })
            .then(() => sendResponse({ success: true }))
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }
    
    // 手动触发书签备份（用于测试）
    if (request.action === 'testBookmarkBackup') {
        console.log('[书签备份] 收到手动测试请求');
        performAutoBackup('manual')
            .then(result => {
                console.log('[书签备份] 手动测试结果:', result);
                sendResponse(result);
            })
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }
    
    // 获取自动备份配置状态
    if (request.action === 'getBackupConfig') {
        loadAutoBackupConfig()
            .then(config => sendResponse({
                enabled: config.enabled,
                serverUrl: config.serverUrl ? '已配置' : '未配置',
                hasToken: !!config.token
            }))
            .catch(e => sendResponse({ error: e.message }));
        return true;
    }
});


// ==================== 自动书签云备份 ====================

const DAILY_BACKUP_HOUR = 2; // 每天凌晨2点

// 自动备份配置（使用Token认证）
let autoBackupConfig = {
    enabled: false,
    serverUrl: '',
    deviceName: '',
    token: ''  // 使用Token替代密码
};

// 加载自动备份配置
async function loadAutoBackupConfig() {
    try {
        const result = await chrome.storage.local.get([
            'autoBookmarkBackupEnabled',
            'cloudBackupServer',
            'backupDeviceName',
            'cloudBackupToken'  // 使用Token
        ]);
        
        autoBackupConfig = {
            enabled: result.autoBookmarkBackupEnabled || false,
            serverUrl: result.cloudBackupServer || '',
            deviceName: result.backupDeviceName || '',
            token: result.cloudBackupToken || ''  // 使用Token
        };
        
        return autoBackupConfig;
    } catch (e) {
        console.error('加载自动备份配置失败:', e);
        return autoBackupConfig;
    }
}

// 执行自动备份（使用Token认证）
async function performAutoBackup(type = 'auto') {
    try {
        await loadAutoBackupConfig();
        
        console.log('[书签备份] 开始执行备份, 类型:', type, '配置:', {
            enabled: autoBackupConfig.enabled,
            serverUrl: autoBackupConfig.serverUrl ? '已配置' : '未配置',
            token: autoBackupConfig.token ? '已授权' : '未授权'
        });
        
        if (!autoBackupConfig.enabled || !autoBackupConfig.serverUrl || !autoBackupConfig.token) {
            console.warn('[书签备份] 跳过: 自动备份未配置或未授权');
            return { success: false, reason: '自动备份未配置或未授权' };
        }
        
        // 获取所有书签
        const tree = await chrome.bookmarks.getTree();
        console.log('[书签备份] 获取书签树完成');
        
        // 上传备份（使用Token认证）
        const response = await fetch(`${autoBackupConfig.serverUrl}/api/bookmark-sync/upload`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${autoBackupConfig.token}`
            },
            body: JSON.stringify({
                bookmarks: tree,
                deviceName: autoBackupConfig.deviceName || 'Chrome',
                type: type,
                skipIfSame: true
            })
        });
        
        const data = await response.json();
        console.log('[书签备份] 服务器响应:', data);
        
        // 检查Token是否失效
        if (response.status === 401 && data.reason === 'token_invalid') {
            // Token失效，禁用自动备份并通知用户
            await chrome.storage.local.set({ autoBookmarkBackupEnabled: false });
            await chrome.storage.local.remove('cloudBackupToken');
            autoBackupConfig.enabled = false;
            autoBackupConfig.token = '';
            
            // 显示通知提醒用户
            showNotification('自动备份已暂停', '管理密码已更改，请重新授权以恢复自动备份');
            
            console.error('[书签备份] Token已失效');
            return { success: false, reason: 'token_invalid', message: '授权已失效' };
        }
        
        if (data.success) {
            console.log('[书签备份] ✅ 备份成功:', data.backup?.filename || '');
            return { success: true, data };
        } else {
            console.error('[书签备份] ❌ 备份失败:', data.message);
            return { success: false, message: data.message };
        }
    } catch (error) {
        console.error('[书签备份] ❌ 异常:', error.message);
        return { success: false, error: error.message };
    }
}

// 防抖备份常量
const BACKUP_ALARM_NAME = 'bookmarkAutoBackup';
const BACKUP_DEBOUNCE_MINUTES = 5; // 5分钟防抖

// 防抖备份（使用 Chrome Alarms API，即使 Service Worker 休眠也能触发）
async function triggerDebouncedBackup() {
    // 清除之前的定时器
    await chrome.alarms.clear(BACKUP_ALARM_NAME);
    
    console.log(`[书签备份] 书签变化，将在${BACKUP_DEBOUNCE_MINUTES}分钟后执行备份...`);
    
    // 创建新的 alarm（分钟为单位）
    chrome.alarms.create(BACKUP_ALARM_NAME, {
        delayInMinutes: BACKUP_DEBOUNCE_MINUTES
    });
}

// 监听 alarm 触发
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === BACKUP_ALARM_NAME) {
        console.log('[书签备份] 防抖时间到，开始执行备份');
        await performAutoBackup('auto');
    }
    
    // 定时备份 alarm
    if (alarm.name === 'dailyBackupCheck') {
        await checkScheduledBackups();
    }
});

// 监听书签变化
chrome.bookmarks.onCreated.addListener(() => {
    console.log('[书签备份] 检测到书签创建');
    loadAutoBackupConfig().then(config => {
        if (config.enabled) triggerDebouncedBackup();
        else console.log('[书签备份] 自动备份未启用，跳过');
    });
});

chrome.bookmarks.onRemoved.addListener(() => {
    console.log('[书签备份] 检测到书签删除');
    loadAutoBackupConfig().then(config => {
        if (config.enabled) triggerDebouncedBackup();
    });
});

chrome.bookmarks.onChanged.addListener(() => {
    console.log('[书签备份] 检测到书签修改');
    loadAutoBackupConfig().then(config => {
        if (config.enabled) triggerDebouncedBackup();
    });
});

chrome.bookmarks.onMoved.addListener(() => {
    console.log('[书签备份] 检测到书签移动');
    loadAutoBackupConfig().then(config => {
        if (config.enabled) triggerDebouncedBackup();
    });
});

// 获取周数
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// 检查并执行定时备份（每日/每周/每月）
async function checkScheduledBackups() {
    const now = new Date();
    const hour = now.getHours();
    
    // 只在凌晨2点执行定时备份
    if (hour !== DAILY_BACKUP_HOUR) return;
    
    const today = now.toISOString().slice(0, 10);
    const currentWeek = `${now.getFullYear()}-W${String(getWeekNumber(now)).padStart(2, '0')}`;
    const currentMonth = now.toISOString().slice(0, 7);
    const dayOfWeek = now.getDay(); // 0=周日, 1=周一...
    const dayOfMonth = now.getDate();
    
    const result = await chrome.storage.local.get([
        'lastDailyBackupDate',
        'lastWeeklyBackupWeek',
        'lastMonthlyBackupMonth'
    ]);
    
    // 每日备份
    if (result.lastDailyBackupDate !== today) {
        const backupResult = await performAutoBackup('daily');
        if (backupResult.success) {
            await chrome.storage.local.set({ lastDailyBackupDate: today });
        }
    }
    
    // 每周备份（周一执行）
    if (dayOfWeek === 1 && result.lastWeeklyBackupWeek !== currentWeek) {
        const backupResult = await performAutoBackup('weekly');
        if (backupResult.success) {
            await chrome.storage.local.set({ lastWeeklyBackupWeek: currentWeek });
        }
    }
    
    // 每月备份（每月1号执行）
    if (dayOfMonth === 1 && result.lastMonthlyBackupMonth !== currentMonth) {
        const backupResult = await performAutoBackup('monthly');
        if (backupResult.success) {
            await chrome.storage.local.set({ lastMonthlyBackupMonth: currentMonth });
        }
    }
}

// 初始化定时备份（使用 Chrome Alarms API）
async function initScheduledBackupTimer() {
    // 清除旧的 alarm
    await chrome.alarms.clear('dailyBackupCheck');
    
    // 每小时检查一次是否需要执行定时备份
    chrome.alarms.create('dailyBackupCheck', {
        delayInMinutes: 1,      // 1分钟后首次检查
        periodInMinutes: 60     // 之后每60分钟检查一次
    });
    
    console.log('[书签备份] 定时备份检查已初始化（每小时检查一次）');
}

// 监听自动备份设置变化
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        if (changes.autoBookmarkBackupEnabled) {
            const enabled = changes.autoBookmarkBackupEnabled.newValue;
            if (enabled) {
                initScheduledBackupTimer();
            } else {
                if (dailyBackupTimer) {
                    clearInterval(dailyBackupTimer);
                    dailyBackupTimer = null;
                }
                if (backupDebounceTimer) {
                    clearTimeout(backupDebounceTimer);
                    backupDebounceTimer = null;
                }
            }
        }
    }
});

// 扩展启动时初始化自动备份
chrome.runtime.onStartup.addListener(async () => {
    const config = await loadAutoBackupConfig();
    if (config.enabled) {
        initScheduledBackupTimer();
    }
});

// 扩展安装/更新时初始化
chrome.runtime.onInstalled.addListener(async () => {
    const config = await loadAutoBackupConfig();
    if (config.enabled) {
        initScheduledBackupTimer();
    }
});

// 监听手动触发备份的消息
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'triggerAutoBackup') {
        performAutoBackup(request.type || 'manual')
            .then(result => sendResponse(result))
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }
    
    if (request.action === 'getAutoBackupConfig') {
        loadAutoBackupConfig()
            .then(config => sendResponse({ success: true, config }))
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }
});
