// 全局变量
let allTabs = [];
let selectedTabs = new Set();
let navUrl = '';
let allBookmarks = [];
let selectedBookmarks = new Set();

// 加载当前设置
chrome.storage.sync.get(['navUrl'], function (result) {
    const urlElement = document.getElementById('currentUrl');
    const openNavBtn = document.getElementById('openNav');
    const addCurrentBtn = document.getElementById('addCurrentTab');
    const selectTabsBtn = document.getElementById('selectTabs');
    const importBookmarksBtn = document.getElementById('importBookmarks');

    if (result.navUrl) {
        navUrl = result.navUrl;
        urlElement.textContent = result.navUrl;
        urlElement.classList.remove('empty');
        openNavBtn.disabled = false;
        addCurrentBtn.disabled = false;
        selectTabsBtn.disabled = false;
        importBookmarksBtn.disabled = false;
    } else {
        urlElement.textContent = '未设置';
        urlElement.classList.add('empty');
        openNavBtn.disabled = true;
        addCurrentBtn.disabled = true;
        selectTabsBtn.disabled = true;
        importBookmarksBtn.disabled = true;
    }
});

// 打开设置页面
document.getElementById('openSettings').addEventListener('click', function () {
    chrome.runtime.openOptionsPage();
});

// 访问导航站
document.getElementById('openNav').addEventListener('click', function () {
    chrome.storage.sync.get(['navUrl'], function (result) {
        if (result.navUrl) {
            chrome.tabs.create({ url: result.navUrl });
        }
    });
});

// 添加当前标签页
document.getElementById('addCurrentTab').addEventListener('click', async function () {
    if (!navUrl) return;

    try {
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // 过滤特殊页面
        if (isSpecialPage(currentTab.url)) {
            alert('无法添加浏览器内部页面');
            return;
        }

        // 跳转到批量添加页面，自动填充当前URL
        const targetUrl = `${navUrl}?batchAdd=true&urls=${encodeURIComponent(currentTab.url)}`;
        chrome.tabs.create({ url: targetUrl });
        window.close();
    } catch (error) {
        console.error('获取当前标签页失败:', error);
        alert('获取当前标签页失败');
    }
});

// 选择标签页批量添加
document.getElementById('selectTabs').addEventListener('click', async function () {
    if (!navUrl) return;

    try {
        // 获取所有标签页
        allTabs = await chrome.tabs.query({ currentWindow: true });

        // 过滤特殊页面
        allTabs = allTabs.filter(tab => !isSpecialPage(tab.url));

        if (allTabs.length === 0) {
            alert('当前窗口没有可添加的标签页');
            return;
        }

        // 显示标签页选择界面
        showTabsSelector();
    } catch (error) {
        console.error('获取标签页列表失败:', error);
        alert('获取标签页列表失败');
    }
});

// 显示标签页选择界面
function showTabsSelector() {
    const selector = document.getElementById('tabsSelector');
    const tabsList = document.getElementById('tabsList');
    const tabsCount = document.getElementById('tabsCount');

    // 重置选择
    selectedTabs.clear();

    // 更新计数
    tabsCount.textContent = `${allTabs.length} 个`;

    // 生成标签页列表
    tabsList.innerHTML = '';

    chrome.tabs.query({ active: true, currentWindow: true }, function ([currentTab]) {
        allTabs.forEach((tab, index) => {
            const item = createTabItem(tab, index, tab.id === currentTab.id);
            tabsList.appendChild(item);
        });
    });

    // 显示选择器
    selector.classList.add('active');
    updateConfirmButton();
}

// 创建标签页列表项
function createTabItem(tab, index, isCurrent) {
    const item = document.createElement('div');
    item.className = 'tab-item' + (isCurrent ? ' current' : '');

    // 复选框
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'tab-checkbox';
    checkbox.dataset.index = index;
    checkbox.checked = false;

    // 图标
    const favicon = document.createElement('img');
    favicon.className = 'tab-favicon';
    favicon.src = tab.favIconUrl || 'icons/icon16.png';
    favicon.onerror = () => favicon.src = 'icons/icon16.png';

    // 信息容器
    const info = document.createElement('div');
    info.className = 'tab-info';

    // 标题
    const title = document.createElement('div');
    title.className = 'tab-title';
    title.textContent = tab.title || '无标题';

    // 当前标签标记
    if (isCurrent) {
        const badge = document.createElement('span');
        badge.className = 'tab-badge';
        badge.textContent = '当前';
        title.appendChild(badge);
    }

    // URL
    const url = document.createElement('div');
    url.className = 'tab-url';
    url.textContent = tab.url;

    info.appendChild(title);
    info.appendChild(url);

    item.appendChild(checkbox);
    item.appendChild(favicon);
    item.appendChild(info);

    // 点击整个项目切换选中状态
    item.addEventListener('click', function (e) {
        if (e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
        }
    });

    // 复选框变化
    checkbox.addEventListener('change', function (e) {
        e.stopPropagation();
        if (checkbox.checked) {
            selectedTabs.add(index);
        } else {
            selectedTabs.delete(index);
        }
        updateConfirmButton();
    });

    return item;
}

// 全选
document.getElementById('selectAll').addEventListener('click', function () {
    const checkboxes = document.querySelectorAll('.tab-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
        selectedTabs.add(parseInt(checkbox.dataset.index));
    });
    updateConfirmButton();
});

// 清除
document.getElementById('clearAll').addEventListener('click', function () {
    const checkboxes = document.querySelectorAll('.tab-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    selectedTabs.clear();
    updateConfirmButton();
});

// 取消选择
document.getElementById('cancelSelect').addEventListener('click', function () {
    document.getElementById('tabsSelector').classList.remove('active');
    selectedTabs.clear();
});

// 确认添加
document.getElementById('confirmAdd').addEventListener('click', function () {
    if (selectedTabs.size === 0 || !navUrl) return;

    // 获取选中的URLs
    const urls = Array.from(selectedTabs)
        .map(index => allTabs[index].url)
        .filter(url => url);

    if (urls.length === 0) {
        alert('没有有效的URL');
        return;
    }

    // 跳转到批量添加页面，自动填充选中的URLs
    const urlsParam = urls.join('\n');
    const targetUrl = `${navUrl}?batchAdd=true&urls=${encodeURIComponent(urlsParam)}`;
    chrome.tabs.create({ url: targetUrl });
    window.close();
});

// 更新确认按钮状态
function updateConfirmButton() {
    const confirmBtn = document.getElementById('confirmAdd');
    confirmBtn.textContent = `添加 (${selectedTabs.size})`;
    confirmBtn.disabled = selectedTabs.size === 0;
}

// 检查是否为特殊页面
function isSpecialPage(url) {
    if (!url) return true;
    const specialPrefixes = [
        'chrome://',
        'chrome-extension://',
        'edge://',
        'about:',
        'data:',
        'file://'
    ];
    return specialPrefixes.some(prefix => url.startsWith(prefix));
}

// ========== 书签导入功能 ==========

// 导入书签按钮
document.getElementById('importBookmarks').addEventListener('click', async function () {
    if (!navUrl) {
        alert('请先设置导航站地址');
        return;
    }

    // 检查浏览器是否支持 bookmarks API
    if (!chrome.bookmarks) {
        alert('当前浏览器不支持书签API，请使用Chrome、Edge或其他Chromium内核浏览器');
        return;
    }

    try {
        // 获取所有书签
        const bookmarkTree = await chrome.bookmarks.getTree();
        allBookmarks = flattenBookmarks(bookmarkTree);

        if (allBookmarks.length === 0) {
            alert('没有找到书签');
            return;
        }

        // 显示书签选择界面
        showBookmarkSelector();
    } catch (error) {
        console.error('获取书签失败:', error);
        alert('获取书签失败: ' + error.message);
    }
});

// 扁平化书签树
function flattenBookmarks(nodes, folder = '') {
    let bookmarks = [];
    
    for (const node of nodes) {
        if (node.children) {
            // 文件夹
            const folderPath = folder ? `${folder}/${node.title}` : node.title;
            bookmarks = bookmarks.concat(flattenBookmarks(node.children, folderPath));
        } else if (node.url && !isSpecialPage(node.url)) {
            // 书签
            bookmarks.push({
                id: node.id,
                title: node.title || '无标题',
                url: node.url,
                folder: folder || '根目录'
            });
        }
    }
    
    return bookmarks;
}

// 显示书签选择界面
function showBookmarkSelector() {
    const selector = document.getElementById('bookmarkSelector');
    const bookmarkList = document.getElementById('bookmarkList');
    const bookmarkCount = document.getElementById('bookmarkCount');

    // 重置选择
    selectedBookmarks.clear();

    // 更新计数
    bookmarkCount.textContent = `${allBookmarks.length} 个`;

    // 按文件夹分组
    const folderMap = new Map();
    allBookmarks.forEach((bookmark, index) => {
        if (!folderMap.has(bookmark.folder)) {
            folderMap.set(bookmark.folder, []);
        }
        folderMap.get(bookmark.folder).push({ ...bookmark, index });
    });

    // 生成书签列表
    bookmarkList.innerHTML = '';
    
    folderMap.forEach((bookmarks, folderName) => {
        const folderDiv = document.createElement('div');
        folderDiv.className = 'bookmark-folder';

        // 文件夹头部
        const folderHeader = document.createElement('div');
        folderHeader.className = 'folder-header';
        folderHeader.innerHTML = `📁 ${folderName} (${bookmarks.length})`;
        
        // 文件夹内容
        const folderItems = document.createElement('div');
        folderItems.className = 'folder-items';
        folderItems.style.display = 'none';

        folderHeader.addEventListener('click', () => {
            folderItems.style.display = folderItems.style.display === 'none' ? 'block' : 'none';
        });

        bookmarks.forEach(bookmark => {
            const item = document.createElement('div');
            item.className = 'bookmark-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.index = bookmark.index;

            const title = document.createElement('span');
            title.className = 'bookmark-title';
            title.textContent = bookmark.title;
            title.title = bookmark.url;

            item.appendChild(checkbox);
            item.appendChild(title);

            item.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            });

            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                if (checkbox.checked) {
                    selectedBookmarks.add(bookmark.index);
                } else {
                    selectedBookmarks.delete(bookmark.index);
                }
                updateBookmarkConfirmButton();
            });

            folderItems.appendChild(item);
        });

        folderDiv.appendChild(folderHeader);
        folderDiv.appendChild(folderItems);
        bookmarkList.appendChild(folderDiv);
    });

    // 显示选择器
    selector.classList.add('active');
    updateBookmarkConfirmButton();
}

// 全选书签
document.getElementById('selectAllBookmarks').addEventListener('click', function () {
    const checkboxes = document.querySelectorAll('#bookmarkList input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
        selectedBookmarks.add(parseInt(checkbox.dataset.index));
    });
    updateBookmarkConfirmButton();
});

// 清除书签选择
document.getElementById('clearAllBookmarks').addEventListener('click', function () {
    const checkboxes = document.querySelectorAll('#bookmarkList input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    selectedBookmarks.clear();
    updateBookmarkConfirmButton();
});

// 取消书签选择
document.getElementById('cancelBookmark').addEventListener('click', function () {
    document.getElementById('bookmarkSelector').classList.remove('active');
    selectedBookmarks.clear();
});

// 确认导入书签
document.getElementById('confirmBookmark').addEventListener('click', async function () {
    if (selectedBookmarks.size === 0 || !navUrl) return;

    try {
        // 获取选中的书签
        const bookmarksToImport = Array.from(selectedBookmarks).map(index => allBookmarks[index]);
        console.log('[扩展] 准备导入书签数量:', bookmarksToImport.length);

        // 创建新标签页
        const tab = await chrome.tabs.create({ url: `${navUrl}/bookmarks` });
        console.log('[扩展] 已创建标签页:', tab.id);
        
        // 等待页面加载完成后注入数据
        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === tab.id && info.status === 'complete') {
                console.log('[扩展] 页面加载完成，开始注入数据...');
                
                // 直接注入数据到sessionStorage
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    func: (data) => {
                        console.log('[注入脚本] 收到数据:', data.length, '个书签');
                        sessionStorage.setItem('pendingBookmarks', JSON.stringify(data));
                        console.log('[注入脚本] 已写入sessionStorage');
                        // 触发自定义事件通知页面
                        window.dispatchEvent(new CustomEvent('bookmarksReady'));
                        console.log('[注入脚本] 已触发bookmarksReady事件');
                    },
                    args: [bookmarksToImport]
                }).then(() => {
                    console.log('[扩展] 书签数据注入成功');
                }).catch((err) => {
                    console.error('[扩展] 注入失败:', err);
                    alert('注入失败: ' + err.message);
                });
                
                chrome.tabs.onUpdated.removeListener(listener);
            }
        });
        
        window.close();
    } catch (error) {
        console.error('[扩展] 准备导入失败:', error);
        alert('准备导入失败: ' + error.message);
    }
});

// 更新书签确认按钮状态
function updateBookmarkConfirmButton() {
    const confirmBtn = document.getElementById('confirmBookmark');
    confirmBtn.textContent = `导入 (${selectedBookmarks.size})`;
    confirmBtn.disabled = selectedBookmarks.size === 0;
}
