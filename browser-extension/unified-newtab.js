// 统一新标签页 - 整合卡片和书签搜索
let allCards = [];
let allBookmarks = [];
let navUrl = '';
let searchEngines = [];
let selectedEngine = null;

// 分隔符书签URL
const SEPARATOR_URLS = [
    'https://separator.mayastudios.com/',
    'http://separator.mayastudios.com/'
];

function isSeparatorBookmark(url) {
    if (!url) return false;
    return SEPARATOR_URLS.some(sep => url.startsWith(sep));
}

// 初始化
document.addEventListener('DOMContentLoaded', init);

async function init() {
    await loadConfig();
    await Promise.all([
        loadCards(),
        loadBookmarks(),
        loadSearchEngines()
    ]);
    bindEvents();
    renderQuickAccess();
}

// 加载配置
async function loadConfig() {
    return new Promise(resolve => {
        chrome.storage.sync.get(['navUrl'], result => {
            navUrl = result.navUrl || '';
            if (!navUrl) {
                document.getElementById('setupHint').style.display = 'block';
            }
            resolve();
        });
    });
}

// 从服务端加载卡片
async function loadCards() {
    if (!navUrl) return;
    
    try {
        const apiBase = navUrl.replace(/\/$/, '');
        const response = await fetch(`${apiBase}/api/cards/all`);
        if (response.ok) {
            allCards = await response.json();
            console.log(`已加载 ${allCards.length} 张卡片`);
        }
    } catch (e) {
        console.error('加载卡片失败:', e);
    }
}

// 加载本地书签
async function loadBookmarks() {
    try {
        const tree = await chrome.bookmarks.getTree();
        allBookmarks = [];
        collectBookmarks(tree, allBookmarks);
        console.log(`已加载 ${allBookmarks.length} 个书签`);
    } catch (e) {
        console.error('加载书签失败:', e);
    }
}

function collectBookmarks(nodes, bookmarks) {
    for (const node of nodes) {
        if (node.children) {
            collectBookmarks(node.children, bookmarks);
        } else if (node.url && !isSeparatorBookmark(node.url)) {
            bookmarks.push(node);
        }
    }
}

// 加载搜索引擎
async function loadSearchEngines() {
    if (!navUrl) {
        // 默认搜索引擎
        searchEngines = [
            { name: 'google', label: 'Google', searchUrl: 'https://www.google.com/search?q={searchTerms}' },
            { name: 'baidu', label: '百度', searchUrl: 'https://www.baidu.com/s?wd={searchTerms}' },
            { name: 'bing', label: 'Bing', searchUrl: 'https://www.bing.com/search?q={searchTerms}' }
        ];
        selectedEngine = searchEngines[0];
        return;
    }
    
    try {
        const apiBase = navUrl.replace(/\/$/, '');
        const response = await fetch(`${apiBase}/api/search-engines`);
        if (response.ok) {
            searchEngines = await response.json();
            selectedEngine = searchEngines[0] || null;
        }
    } catch (e) {
        console.error('加载搜索引擎失败:', e);
        searchEngines = [
            { name: 'google', label: 'Google', searchUrl: 'https://www.google.com/search?q={searchTerms}' }
        ];
        selectedEngine = searchEngines[0];
    }
}

// 绑定事件
function bindEvents() {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('keydown', handleSearchKeydown);
    searchBtn.addEventListener('click', () => performWebSearch(searchInput.value));
    
    document.getElementById('openSettings')?.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
}

// 搜索输入处理
function handleSearchInput(e) {
    const query = e.target.value.trim();
    
    if (!query) {
        hideSearchResults();
        return;
    }
    
    const results = search(query);
    renderSearchResults(results, query);
}

// 键盘事件
function handleSearchKeydown(e) {
    if (e.key === 'Enter') {
        const query = e.target.value.trim();
        if (!query) return;
        
        const results = search(query);
        if (results.cards.length > 0 || results.bookmarks.length > 0) {
            // 有匹配结果，打开第一个
            const firstResult = results.cards[0] || results.bookmarks[0];
            window.open(firstResult.url, '_blank');
        } else {
            // 无匹配，执行网页搜索
            performWebSearch(query);
        }
    } else if (e.key === 'Escape') {
        hideSearchResults();
        e.target.value = '';
    }
}

// 统一搜索
function search(query) {
    const q = query.toLowerCase();
    
    // 搜索卡片
    const cards = allCards.filter(card => {
        const title = (card.title || '').toLowerCase();
        const url = (card.url || '').toLowerCase();
        const desc = (card.desc || '').toLowerCase();
        return title.includes(q) || url.includes(q) || desc.includes(q);
    }).slice(0, 5);
    
    // 搜索书签
    const bookmarks = allBookmarks.filter(b => {
        const title = (b.title || '').toLowerCase();
        const url = (b.url || '').toLowerCase();
        return title.includes(q) || url.includes(q);
    }).slice(0, 5);
    
    return { cards, bookmarks };
}

// 执行网页搜索
function performWebSearch(query) {
    if (!query || !selectedEngine) return;
    
    const searchUrl = selectedEngine.searchUrl.replace('{searchTerms}', encodeURIComponent(query));
    window.open(searchUrl, '_blank');
}

// 渲染搜索结果
function renderSearchResults(results, query) {
    const container = document.getElementById('searchResults');
    container.innerHTML = '';
    
    if (results.cards.length === 0 && results.bookmarks.length === 0) {
        container.innerHTML = `
            <div class="no-results">
                <p>未找到匹配结果</p>
                <p class="hint">按 Enter 使用 ${selectedEngine?.label || '搜索引擎'} 搜索 "${escapeHtml(query)}"</p>
            </div>
        `;
        container.style.display = 'block';
        return;
    }
    
    // 卡片结果
    if (results.cards.length > 0) {
        const cardGroup = document.createElement('div');
        cardGroup.className = 'result-group';
        cardGroup.innerHTML = '<h3>📑 卡片</h3>';
        const cardList = document.createElement('div');
        cardList.className = 'result-list';
        for (const card of results.cards) {
            cardList.appendChild(createResultItem(card, 'card'));
        }
        cardGroup.appendChild(cardList);
        container.appendChild(cardGroup);
    }
    
    // 书签结果
    if (results.bookmarks.length > 0) {
        const bookmarkGroup = document.createElement('div');
        bookmarkGroup.className = 'result-group';
        bookmarkGroup.innerHTML = '<h3>🔖 书签</h3>';
        const bookmarkList = document.createElement('div');
        bookmarkList.className = 'result-list';
        for (const bookmark of results.bookmarks) {
            bookmarkList.appendChild(createResultItem(bookmark, 'bookmark'));
        }
        bookmarkGroup.appendChild(bookmarkList);
        container.appendChild(bookmarkGroup);
    }
    
    container.style.display = 'block';
}

function createResultItem(item, type) {
    const a = document.createElement('a');
    a.href = item.url;
    a.target = '_blank';
    a.className = 'result-item';
    
    // 卡片优先使用 logo_url
    const faviconSrc = (type === 'card' && item.logo_url) ? item.logo_url : getFaviconUrl(item.url);
    
    a.innerHTML = `
        <img src="${faviconSrc}" class="result-favicon">
        <div class="result-info">
            <div class="result-title">${escapeHtml(item.title || '无标题')}</div>
            <div class="result-url">${getDomain(item.url)}</div>
        </div>
    `;
    
    // 绑定 favicon 错误处理
    const faviconImg = a.querySelector('.result-favicon');
    faviconImg.addEventListener('error', () => {
        handleFaviconError(faviconImg, item.url);
    });
    
    return a;
}

function hideSearchResults() {
    document.getElementById('searchResults').style.display = 'none';
}

// 渲染快捷访问
async function renderQuickAccess() {
    const container = document.getElementById('quickAccess');
    container.innerHTML = '';
    
    // 获取常用书签（基于访问历史）
    const frequentBookmarks = await getFrequentBookmarks();
    
    if (frequentBookmarks.length === 0 && allCards.length === 0) {
        container.innerHTML = '<p class="empty-hint">暂无快捷访问</p>';
        return;
    }
    
    // 显示常用书签
    if (frequentBookmarks.length > 0) {
        const section = document.createElement('div');
        section.className = 'quick-section';
        section.innerHTML = '<h3>⭐ 常用</h3>';
        const grid = document.createElement('div');
        grid.className = 'quick-grid';
        for (const b of frequentBookmarks.slice(0, 8)) {
            grid.appendChild(createQuickItem(b, 'bookmark'));
        }
        section.appendChild(grid);
        container.appendChild(section);
    }
    
    // 显示部分卡片
    if (allCards.length > 0) {
        const section = document.createElement('div');
        section.className = 'quick-section';
        section.innerHTML = '<h3>📑 导航卡片</h3>';
        const grid = document.createElement('div');
        grid.className = 'quick-grid';
        for (const card of allCards.slice(0, 12)) {
            grid.appendChild(createQuickItem(card, 'card'));
        }
        section.appendChild(grid);
        container.appendChild(section);
    }
}

function createQuickItem(item, type) {
    const a = document.createElement('a');
    a.href = item.url;
    a.target = '_blank';
    a.className = 'quick-item';
    
    // 卡片优先使用 logo_url
    const faviconSrc = (type === 'card' && item.logo_url) ? item.logo_url : getFaviconUrl(item.url);
    
    a.innerHTML = `
        <img src="${faviconSrc}" class="quick-favicon">
        <span class="quick-title">${escapeHtml(item.title || '无标题')}</span>
    `;
    
    // 绑定 favicon 错误处理
    const faviconImg = a.querySelector('.quick-favicon');
    faviconImg.addEventListener('error', () => {
        handleFaviconError(faviconImg, item.url);
    });
    
    return a;
}

// 获取常用书签
async function getFrequentBookmarks() {
    const withUsage = await Promise.all(allBookmarks.map(async (b) => {
        try {
            const visits = await chrome.history.getVisits({ url: b.url });
            return { bookmark: b, usage: visits.length };
        } catch {
            return { bookmark: b, usage: 0 };
        }
    }));
    
    return withUsage
        .filter(item => item.usage > 0)
        .sort((a, b) => b.usage - a.usage)
        .slice(0, 12)
        .map(item => item.bookmark);
}

// 工具函数
function getFaviconUrl(url) {
    try {
        const urlObj = new URL(url);
        return `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`;
    } catch {
        return 'icons/icon16.png';
    }
}

function handleFaviconError(img, url) {
    try {
        const domain = new URL(url).hostname;
        if (img.src.includes('/favicon.ico')) {
            img.src = `https://api.xinac.net/icon/?url=${domain}&sz=128`;
        } else if (img.src.includes('api.xinac.net')) {
            img.src = `https://icon.horse/icon/${domain}`;
        } else {
            img.src = 'icons/icon16.png';
        }
    } catch {
        img.src = 'icons/icon16.png';
    }
}

function getDomain(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
