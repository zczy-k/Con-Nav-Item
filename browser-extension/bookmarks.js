// 书签管理器 - 重构版
let allBookmarks = [];
let bookmarkCount = 0;
let folderCount = 0;
let currentFolderId = null;
let selectedBookmarks = new Set();
let editingItem = null;
let draggedBookmark = null;
let bookmarkUsageCache = new Map(); // 使用频率缓存
let currentSortOrder = 'frequency'; // 当前排序方式
let autoSortInterval = null; // 自动排序定时器
let bookmarkTags = new Map(); // 书签标签映射 {bookmarkId: [tags]}
let allTags = new Set(); // 所有标签集合
let currentTagFilters = []; // 当前标签筛选（支持多标签）
let bookmarkNotes = new Map(); // 书签笔记映射 {bookmarkId: note}

// 分隔符书签URL（这些不是真实书签，不参与任何操作）
const SEPARATOR_URLS = [
    'https://separator.mayastudios.com/',
    'http://separator.mayastudios.com/'
];

// 检查是否为分隔符书签
function isSeparatorBookmark(url) {
    if (!url) return false;
    return SEPARATOR_URLS.some(sep => url.startsWith(sep));
}

// 初始化
document.addEventListener('DOMContentLoaded', init);

async function init() {
    await loadUsageData();
    await loadTags();
    await loadNotes();
    await loadBookmarks();
    bindEvents();
    loadAutoSortSetting();
    renderTagCloud();
    // 预加载导航页配置
    await initNavConfig();
    // 检查URL参数，处理从右键菜单传递的添加请求
    handleUrlParams();
}

// 处理URL参数（从右键菜单传递）
function handleUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const addToNav = urlParams.get('addToNav');
    const url = urlParams.get('url');
    const title = urlParams.get('title');
    
    if (addToNav === 'true' && url) {
        // 创建一个临时书签对象
        pendingNavBookmarks = [{
            id: 'temp_' + Date.now(),
            url: decodeURIComponent(url),
            title: title ? decodeURIComponent(title) : ''
        }];
        
        // 延迟显示弹窗，等待页面完全加载
        setTimeout(() => {
            showAddToNavModalDirect();
        }, 500);
        
        // 清除URL参数
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// 直接显示添加到导航页弹窗（不检查选中书签）
async function showAddToNavModalDirect() {
    if (pendingNavBookmarks.length === 0) {
        return;
    }
    
    // 加载配置
    if (!navConfigLoaded) {
        await initNavConfig();
    }
    
    // 设置服务器地址
    if (navServerUrl) {
        document.getElementById('navServerUrl').value = navServerUrl;
    }
    
    // 渲染待添加书签列表
    renderPendingNavBookmarks();
    
    // 显示弹窗
    document.getElementById('addToNavModal').classList.add('active');
    document.getElementById('navAddStatus').textContent = '';
    
    // 如果已有服务器地址，自动加载分类并恢复上次选择
    if (navServerUrl) {
        await loadNavMenus();
        // 恢复上次选择
        if (lastSelectedMenuId) {
            document.getElementById('navMenuSelect').value = lastSelectedMenuId;
            onMenuSelectChange();
            if (lastSelectedSubMenuId) {
                document.getElementById('navSubMenuSelect').value = lastSelectedSubMenuId;
            }
        }
    }
}

// 加载使用频率数据
async function loadUsageData() {
    try {
        const result = await chrome.storage.local.get(['bookmarkUsage']);
        if (result.bookmarkUsage) {
            bookmarkUsageCache = new Map(Object.entries(result.bookmarkUsage));
        }
    } catch (e) {
        console.error('加载使用数据失败:', e);
    }
}

// 保存使用频率数据
async function saveUsageData() {
    try {
        const obj = Object.fromEntries(bookmarkUsageCache);
        await chrome.storage.local.set({ bookmarkUsage: obj });
    } catch (e) {
        console.error('保存使用数据失败:', e);
    }
}

// ==================== 标签系统 ====================
// 加载标签数据
async function loadTags() {
    try {
        const result = await chrome.storage.local.get(['bookmarkTags']);
        if (result.bookmarkTags) {
            bookmarkTags = new Map(Object.entries(result.bookmarkTags));
            // 收集所有标签
            allTags.clear();
            for (const tags of bookmarkTags.values()) {
                tags.forEach(tag => allTags.add(tag));
            }
        }
    } catch (e) {
        console.error('加载标签失败:', e);
    }
}

// 保存标签数据
async function saveTags() {
    try {
        const obj = Object.fromEntries(bookmarkTags);
        await chrome.storage.local.set({ bookmarkTags: obj });
    } catch (e) {
        console.error('保存标签失败:', e);
    }
}

// 加载笔记数据
async function loadNotes() {
    try {
        const result = await chrome.storage.local.get(['bookmarkNotes']);
        if (result.bookmarkNotes) {
            bookmarkNotes = new Map(Object.entries(result.bookmarkNotes));
        }
    } catch (e) {
        console.error('加载笔记失败:', e);
    }
}

// 保存笔记数据
async function saveNotes() {
    try {
        const obj = Object.fromEntries(bookmarkNotes);
        await chrome.storage.local.set({ bookmarkNotes: obj });
    } catch (e) {
        console.error('保存笔记失败:', e);
    }
}

// 获取书签笔记
function getBookmarkNote(bookmarkId) {
    return bookmarkNotes.get(bookmarkId) || '';
}

// 设置书签笔记
async function setBookmarkNote(bookmarkId, note) {
    if (note && note.trim()) {
        bookmarkNotes.set(bookmarkId, note.trim());
    } else {
        bookmarkNotes.delete(bookmarkId);
    }
    await saveNotes();
}

// 为书签添加标签
async function addTagToBookmark(bookmarkId, tag) {
    tag = tag.trim();
    if (!tag) return;
    
    if (!bookmarkTags.has(bookmarkId)) {
        bookmarkTags.set(bookmarkId, []);
    }
    
    const tags = bookmarkTags.get(bookmarkId);
    if (!tags.includes(tag)) {
        tags.push(tag);
        allTags.add(tag);
        await saveTags();
        renderTagCloud();
    }
}

// 从书签移除标签
async function removeTagFromBookmark(bookmarkId, tag) {
    if (!bookmarkTags.has(bookmarkId)) return;
    
    const tags = bookmarkTags.get(bookmarkId);
    const index = tags.indexOf(tag);
    if (index > -1) {
        tags.splice(index, 1);
        await saveTags();
        
        // 检查是否还有其他书签使用这个标签
        let tagStillUsed = false;
        for (const t of bookmarkTags.values()) {
            if (t.includes(tag)) {
                tagStillUsed = true;
                break;
            }
        }
        if (!tagStillUsed) {
            allTags.delete(tag);
        }
        
        renderTagCloud();
    }
}

// 获取书签的标签
function getBookmarkTags(bookmarkId) {
    return bookmarkTags.get(bookmarkId) || [];
}

// 自动生成标签（基于URL和标题）
function autoGenerateTags(bookmark) {
    const tags = [];
    
    try {
        const url = new URL(bookmark.url);
        const domain = url.hostname.replace(/^www\./, '');
        
        // 常见网站分类
        const categoryMap = {
            'github.com': ['开发', '代码'],
            'stackoverflow.com': ['开发', '问答'],
            'youtube.com': ['视频', '娱乐'],
            'bilibili.com': ['视频', '娱乐'],
            'zhihu.com': ['问答', '社区'],
            'juejin.cn': ['开发', '技术'],
            'csdn.net': ['开发', '技术'],
            'baidu.com': ['搜索'],
            'google.com': ['搜索'],
            'taobao.com': ['购物'],
            'jd.com': ['购物'],
            'weibo.com': ['社交'],
            'twitter.com': ['社交'],
            'facebook.com': ['社交'],
            'linkedin.com': ['社交', '职场'],
            'medium.com': ['博客', '阅读'],
            'reddit.com': ['社区', '论坛'],
            'netflix.com': ['视频', '娱乐'],
            'amazon.com': ['购物'],
            'wikipedia.org': ['百科', '学习']
        };
        
        // 检查域名
        for (const [site, siteTags] of Object.entries(categoryMap)) {
            if (domain.includes(site)) {
                tags.push(...siteTags);
                break;
            }
        }
        
        // 根据标题关键词
        const title = (bookmark.title || '').toLowerCase();
        if (title.includes('doc') || title.includes('文档')) tags.push('文档');
        if (title.includes('api')) tags.push('API');
        if (title.includes('tutorial') || title.includes('教程')) tags.push('教程');
        if (title.includes('blog') || title.includes('博客')) tags.push('博客');
        if (title.includes('news') || title.includes('新闻')) tags.push('新闻');
        if (title.includes('tool') || title.includes('工具')) tags.push('工具');
        
    } catch (e) {}
    
    return [...new Set(tags)]; // 去重
}

// 批量自动标签
async function autoTagAllBookmarks() {
    const allBookmarksList = [];
    collectAllBookmarks(allBookmarks, allBookmarksList);
    
    let taggedCount = 0;
    
    for (const bookmark of allBookmarksList) {
        // 如果已有标签，跳过
        if (bookmarkTags.has(bookmark.id) && bookmarkTags.get(bookmark.id).length > 0) {
            continue;
        }
        
        const suggestedTags = autoGenerateTags(bookmark);
        if (suggestedTags.length > 0) {
            bookmarkTags.set(bookmark.id, suggestedTags);
            suggestedTags.forEach(tag => allTags.add(tag));
            taggedCount++;
        }
    }
    
    if (taggedCount > 0) {
        await saveTags();
        renderTagCloud();
        alert(`已为 ${taggedCount} 个书签自动添加标签`);
    } else {
        alert('所有书签都已有标签');
    }
}

// 显示笔记编辑器
function showNoteEditor(bookmark) {
    const currentNote = getBookmarkNote(bookmark.id);
    
    const newNote = prompt(
        `为 "${bookmark.title}" 添加笔记\n\n` +
        `当前笔记: ${currentNote || '无'}\n\n` +
        `输入笔记内容:`,
        currentNote
    );
    
    if (newNote === null) return; // 取消
    
    setBookmarkNote(bookmark.id, newNote);
    renderBookmarkList();
}

// 显示标签编辑器
function showTagEditor(bookmark) {
    const currentTags = getBookmarkTags(bookmark.id);
    const suggestedTags = autoGenerateTags(bookmark);
    
    const tagInput = prompt(
        `为 "${bookmark.title}" 添加标签\n\n` +
        `当前标签: ${currentTags.length > 0 ? currentTags.join(', ') : '无'}\n` +
        `建议标签: ${suggestedTags.length > 0 ? suggestedTags.join(', ') : '无'}\n\n` +
        `输入标签（多个标签用逗号分隔）:`,
        currentTags.join(', ')
    );
    
    if (tagInput === null) return; // 取消
    
    // 解析输入的标签
    const newTags = tagInput.split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);
    
    // 更新标签
    bookmarkTags.set(bookmark.id, newTags);
    
    // 更新全局标签集合
    allTags.clear();
    for (const tags of bookmarkTags.values()) {
        tags.forEach(tag => allTags.add(tag));
    }
    
    saveTags();
    renderTagCloud();
    renderBookmarkList();
}

// 渲染标签云
function renderTagCloud() {
    const container = document.getElementById('tagCloud');
    const content = document.getElementById('tagCloudContent');
    
    if (!container || !content) return;
    
    if (allTags.size === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    content.innerHTML = '';
    
    // 统计每个标签的使用次数
    const tagCounts = {};
    for (const tags of bookmarkTags.values()) {
        for (const tag of tags) {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
    }
    
    // 按使用次数排序
    const sortedTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1]);
    
    const maxCount = sortedTags.length > 0 ? sortedTags[0][1] : 1;
    
    for (const [tag, count] of sortedTags) {
        const tagEl = document.createElement('span');
        
        // 根据使用频率计算大小
        const ratio = count / maxCount;
        const fontSize = 12 + ratio * 6; // 12px - 18px
        
        const isActive = currentTagFilters.includes(tag);
        
        tagEl.style.cssText = `
            display: inline-block;
            padding: 4px 10px;
            background: ${isActive ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#f0f0f0'};
            color: ${isActive ? 'white' : '#333'};
            border-radius: 16px;
            font-size: ${fontSize}px;
            cursor: pointer;
            transition: all 0.2s;
        `;
        tagEl.textContent = `${tag} (${count})${isActive ? ' ✓' : ''}`;
        tagEl.title = isActive ? `点击取消筛选 "${tag}"` : `点击筛选 "${tag}" 标签的书签`;
        
        tagEl.addEventListener('click', () => {
            const index = currentTagFilters.indexOf(tag);
            if (index > -1) {
                currentTagFilters.splice(index, 1);
            } else {
                currentTagFilters.push(tag);
            }
            renderTagCloud();
            renderBookmarkList();
        });
        
        tagEl.addEventListener('mouseenter', () => {
            if (!isActive) {
                tagEl.style.background = '#e0e0e0';
                tagEl.style.transform = 'translateY(-2px)';
            }
        });
        
        tagEl.addEventListener('mouseleave', () => {
            if (!isActive) {
                tagEl.style.background = '#f0f0f0';
                tagEl.style.transform = 'translateY(0)';
            }
        });
        
        content.appendChild(tagEl);
    }
    
    // 如果有选中的标签，显示清除按钮
    if (currentTagFilters.length > 0) {
        const clearBtn = document.createElement('span');
        clearBtn.style.cssText = `
            display: inline-block;
            padding: 4px 10px;
            background: #ff4d4f;
            color: white;
            border-radius: 16px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
            margin-left: 8px;
        `;
        clearBtn.textContent = `清除全部 (${currentTagFilters.length})`;
        clearBtn.title = '清除所有标签筛选';
        clearBtn.addEventListener('click', () => {
            currentTagFilters = [];
            renderTagCloud();
            renderBookmarkList();
        });
        clearBtn.addEventListener('mouseenter', () => {
            clearBtn.style.background = '#ff7875';
        });
        clearBtn.addEventListener('mouseleave', () => {
            clearBtn.style.background = '#ff4d4f';
        });
        content.appendChild(clearBtn);
    }
}

// 获取书签使用频率
async function getBookmarkUsage(url) {
    if (bookmarkUsageCache.has(url)) {
        return bookmarkUsageCache.get(url);
    }
    
    try {
        const visits = await chrome.history.getVisits({ url });
        const count = visits.length;
        bookmarkUsageCache.set(url, count);
        return count;
    } catch {
        return 0;
    }
}

// 加载书签
async function loadBookmarks() {
    try {
        const tree = await chrome.bookmarks.getTree();
        allBookmarks = tree;
        countItems(tree);
        renderFolderTree();
        renderBookmarkList();
        updateStats();
    } catch (error) {
        console.error('加载书签失败:', error);
    }
}

// 统计
function countItems(nodes) {
    bookmarkCount = 0;
    folderCount = 0;
    countRecursive(nodes);
}

function countRecursive(nodes) {
    for (const node of nodes) {
        if (node.children) {
            folderCount++;
            countRecursive(node.children);
        } else if (node.url && !isSeparatorBookmark(node.url)) {
            bookmarkCount++;
        }
    }
}

function updateStats() {
    document.getElementById('totalBookmarks').textContent = `书签: ${bookmarkCount}`;
    document.getElementById('totalFolders').textContent = `文件夹: ${folderCount}`;
}


// 真实特殊文件夹名称（在书签栏中创建）
const FAVORITES_FOLDER_NAME = '⭐ 常用';
const RECENT_FOLDER_NAME = '🕐 最近使用';
const UNUSED_FOLDER_NAME = '📦 长期未使用';

// 特殊文件夹名称列表（用于判断是否为快捷方式文件夹）
const SHORTCUT_FOLDER_NAMES = [FAVORITES_FOLDER_NAME, RECENT_FOLDER_NAME];

// ==================== 文件夹树渲染 ====================
function renderFolderTree() {
    const container = document.getElementById('folderTree');
    container.innerHTML = '';
    
    // 添加"全部书签"项
    const allItem = createFolderItem({ id: null, title: '📚 全部书签' }, 0, true);
    container.appendChild(allItem);
    
    // 分隔线
    const divider = document.createElement('div');
    divider.style.cssText = 'height: 1px; background: #e0e0e0; margin: 8px 12px;';
    container.appendChild(divider);
    
    // 渲染真实文件夹树
    if (allBookmarks[0] && allBookmarks[0].children) {
        renderFolderTreeRecursive(allBookmarks[0].children, container, 0);
    }
}

function renderFolderTreeRecursive(nodes, container, level) {
    for (const node of nodes) {
        if (node.children) {
            const item = createFolderItem(node, level);
            container.appendChild(item);
            renderFolderTreeRecursive(node.children, container, level + 1);
        }
    }
}

function createFolderItem(folder, level, isAll = false) {
    const div = document.createElement('div');
    div.className = `folder-item${level > 0 ? ` folder-indent-${Math.min(level, 3)}` : ''}`;
    div.dataset.folderId = folder.id || '';
    
    if ((isAll && currentFolderId === null) || folder.id === currentFolderId) {
        div.classList.add('active');
    }
    
    const bookmarkCount = isAll ? countAllBookmarks() : countFolderBookmarks(folder);
    
    // 文件夹可拖动（除了"全部书签"）
    if (!isAll && folder.id) {
        div.draggable = true;
    }
    
    div.innerHTML = `
        <span class="folder-icon">${isAll ? '📚' : '📁'}</span>
        <span class="folder-name">${escapeHtml(folder.title || '未命名')}</span>
        <span class="folder-count">${bookmarkCount}</span>
        ${!isAll && folder.id ? '<span class="folder-actions" style="display: none; margin-left: auto; gap: 4px;"><button class="btn-icon" title="编辑">✏️</button><button class="btn-icon" title="删除">🗑️</button></span>' : ''}
    `;
    
    // 点击选择文件夹
    div.addEventListener('click', (e) => {
        // 如果点击的是按钮，不触发选择
        if (e.target.closest('.folder-actions')) return;
        
        document.querySelectorAll('.folder-item').forEach(el => el.classList.remove('active'));
        div.classList.add('active');
        currentFolderId = folder.id || null;
        document.getElementById('currentFolderName').textContent = folder.title || '全部书签';
        selectedBookmarks.clear();
        updateSelectionUI();
        renderBookmarkList();
    });
    
    // 悬停显示操作按钮
    if (!isAll && folder.id) {
        div.addEventListener('mouseenter', () => {
            const actions = div.querySelector('.folder-actions');
            if (actions) actions.style.display = 'flex';
        });
        
        div.addEventListener('mouseleave', () => {
            const actions = div.querySelector('.folder-actions');
            if (actions) actions.style.display = 'none';
        });
        
        // 编辑按钮
        const editBtn = div.querySelector('.folder-actions button:first-child');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                editFolder(folder.id);
            });
        }
        
        // 删除按钮
        const deleteBtn = div.querySelector('.folder-actions button:last-child');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteFolder(folder.id);
            });
        }
    }
    
    // 文件夹右键菜单
    if (!isAll && folder.id) {
        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            rightClickedFolderId = folder.id;
            showFolderContextMenu(e.clientX, e.clientY, folder);
        });
    }
    
    // 文件夹拖拽
    if (!isAll && folder.id) {
        div.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            draggedBookmark = { id: folder.id, isFolder: true };
            div.classList.add('dragging');
            // 设置拖拽数据，确保拖拽有效
            e.dataTransfer.setData('text/plain', folder.id);
            e.dataTransfer.effectAllowed = 'move';
        });
        
        div.addEventListener('dragend', () => {
            div.classList.remove('dragging');
            // 延迟清除，确保 drop 事件先处理
            setTimeout(() => {
                draggedBookmark = null;
            }, 100);
        });
    }
    
    // 拖拽放置（只有有效的文件夹才能接收拖放）
    if (!isAll && folder.id) {
        div.addEventListener('dragover', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // 没有拖拽对象
            if (!draggedBookmark) return;
            
            // 不能拖到自己身上
            if (draggedBookmark.id === folder.id) {
                div.classList.add('drag-invalid');
                return;
            }
            
            // 如果是文件夹，检查是否试图拖到子文件夹
            if (draggedBookmark.isFolder) {
                const isDesc = await isDescendant(folder.id, draggedBookmark.id);
                if (isDesc) {
                    div.classList.add('drag-invalid');
                    return;
                }
            }
            
            div.classList.add('drag-over');
        });
        
        div.addEventListener('dragleave', () => {
            div.classList.remove('drag-over');
            div.classList.remove('drag-invalid');
        });
        
        div.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            div.classList.remove('drag-over');
            div.classList.remove('drag-invalid');
            
            if (!draggedBookmark || !folder.id) {
                draggedBookmark = null;
                return;
            }
            
            try {
                const sourceId = draggedBookmark.id;
                
                if (!sourceId) {
                    alert('❌ 无效的拖拽对象');
                    draggedBookmark = null;
                    return;
                }
                
                if (draggedBookmark.isFolder) {
                    // 检查是否试图移动到自己
                    if (sourceId === folder.id) {
                        alert('❌ 不能将文件夹移动到自己');
                        draggedBookmark = null;
                        return;
                    }
                    
                    // 检查目标是否是源文件夹的子文件夹
                    if (await isDescendant(folder.id, sourceId)) {
                        alert('❌ 不能将文件夹移动到它的子文件夹中');
                        draggedBookmark = null;
                        return;
                    }
                }
                
                // 移动书签或文件夹
                await chrome.bookmarks.move(sourceId, { parentId: folder.id });
                await loadBookmarks();
            } catch (error) {
                let errorMsg = error.message || '未知错误';
                if (errorMsg.includes("Can't move")) {
                    errorMsg = '不能将文件夹移动到自己或其子文件夹中';
                }
                alert('移动失败: ' + errorMsg);
            }
            
            draggedBookmark = null;
            document.getElementById('dragHint').classList.remove('active');
        });
    }
    
    return div;
}

function countAllBookmarks() {
    let count = 0;
    function countRecursive(nodes) {
        for (const node of nodes) {
            if (node.children) countRecursive(node.children);
            else if (node.url) count++;
        }
    }
    countRecursive(allBookmarks);
    return count;
}

function countFolderBookmarks(folder) {
    if (!folder.children) return 0;
    return folder.children.filter(c => c.url && !isSeparatorBookmark(c.url)).length;
}


// ==================== 书签列表渲染 ====================
async function renderBookmarkList() {
    const container = document.getElementById('bookmarkList');
    container.innerHTML = '<div class="loading">加载中...</div>';
    
    let bookmarks = getBookmarksForCurrentFolder();
    
    // 标签筛选（支持多标签：书签需包含所有选中的标签）
    if (currentTagFilters.length > 0) {
        bookmarks = bookmarks.filter(b => {
            const tags = getBookmarkTags(b.id);
            return currentTagFilters.every(filter => tags.includes(filter));
        });
        const tagNames = currentTagFilters.join(' + ');
        document.getElementById('currentFolderName').textContent = `🏷️ ${tagNames} (${bookmarks.length})`;
    }
    
    if (bookmarks.length > 0) {
        bookmarks = await sortBookmarks(bookmarks, currentSortOrder);
    }
    
    if (bookmarks.length === 0) {
        const msg = currentTagFilters.length > 0 
            ? `没有同时包含 "${currentTagFilters.join('" 和 "')}" 标签的书签` 
            : '暂无书签';
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📭</div><p>${msg}</p></div>`;
        return;
    }
    
    container.innerHTML = '';
    for (const bookmark of bookmarks) {
        const item = createBookmarkItem(bookmark);
        container.appendChild(item);
    }
}

// 排序书签
async function sortBookmarks(bookmarks, order) {
    if (order === 'frequency') {
        // 获取所有书签的使用频率
        const usagePromises = bookmarks.map(async (b) => {
            const usage = await getBookmarkUsage(b.url);
            return { bookmark: b, usage };
        });
        const withUsage = await Promise.all(usagePromises);
        withUsage.sort((a, b) => b.usage - a.usage);
        return withUsage.map(item => item.bookmark);
    } else if (order === 'name') {
        return [...bookmarks].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (order === 'date') {
        return [...bookmarks].sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
    }
    return bookmarks;
}

function getBookmarksForCurrentFolder() {
    const bookmarks = [];
    
    if (currentFolderId === null) {
        // 全部书签
        collectAllBookmarks(allBookmarks, bookmarks);
    } else {
        // 特定文件夹
        const folder = findFolderById(allBookmarks, currentFolderId);
        if (folder && folder.children) {
            for (const child of folder.children) {
                if (child.url && !isSeparatorBookmark(child.url)) {
                    bookmarks.push(child);
                }
            }
        }
    }
    
    return bookmarks;
}

function collectAllBookmarks(nodes, bookmarks) {
    for (const node of nodes) {
        if (node.children) {
            collectAllBookmarks(node.children, bookmarks);
        } else if (node.url && !isSeparatorBookmark(node.url)) {
            bookmarks.push(node);
        }
    }
}

function findFolderById(nodes, id) {
    for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
            const found = findFolderById(node.children, id);
            if (found) return found;
        }
    }
    return null;
}

function createBookmarkItem(bookmark) {
    const div = document.createElement('div');
    div.className = 'bookmark-item';
    div.dataset.id = bookmark.id;
    div.draggable = true;
    
    if (selectedBookmarks.has(bookmark.id)) {
        div.classList.add('selected');
    }
    
    const favicon = getFaviconUrl(bookmark.url);
    const tags = getBookmarkTags(bookmark.id);
    const note = getBookmarkNote(bookmark.id);
    const tagsHtml = tags.length > 0 
        ? `<div class="bookmark-tags">${tags.map(t => `<span class="bookmark-tag">${escapeHtml(t)}</span>`).join('')}</div>` 
        : '';
    const noteHtml = note 
        ? `<div class="bookmark-note">📝 ${escapeHtml(note.substring(0, 50))}${note.length > 50 ? '...' : ''}</div>` 
        : '';
    
    div.innerHTML = `
        <input type="checkbox" class="bookmark-checkbox" ${selectedBookmarks.has(bookmark.id) ? 'checked' : ''}>
        <img class="bookmark-favicon" src="${favicon}">
        <div class="bookmark-info">
            <div class="bookmark-title"><a href="${escapeHtml(bookmark.url)}" target="_blank">${escapeHtml(bookmark.title || '无标题')}</a></div>
            <div class="bookmark-url">${escapeHtml(bookmark.url)}</div>
            ${tagsHtml}
            ${noteHtml}
        </div>
        <div class="bookmark-actions">
            <button class="btn btn-small btn-secondary btn-note" title="添加笔记">📝</button>
            <button class="btn btn-small btn-secondary btn-tag" title="添加标签">🏷️</button>
            <button class="btn btn-small btn-secondary btn-edit" title="编辑">✏️</button>
            <button class="btn btn-small btn-danger btn-delete" title="删除">🗑️</button>
        </div>
    `;
    
    // 复选框
    const checkbox = div.querySelector('.bookmark-checkbox');
    checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        if (checkbox.checked) {
            selectedBookmarks.add(bookmark.id);
            div.classList.add('selected');
        } else {
            selectedBookmarks.delete(bookmark.id);
            div.classList.remove('selected');
        }
        updateSelectionUI();
    });
    
    // 笔记按钮
    div.querySelector('.btn-note').addEventListener('click', (e) => {
        e.stopPropagation();
        showNoteEditor(bookmark);
    });
    
    // 标签按钮
    div.querySelector('.btn-tag').addEventListener('click', (e) => {
        e.stopPropagation();
        showTagEditor(bookmark);
    });
    
    // 编辑按钮
    div.querySelector('.btn-edit').addEventListener('click', (e) => {
        e.stopPropagation();
        editBookmark(bookmark.id);
    });
    
    // 删除按钮
    div.querySelector('.btn-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteBookmark(bookmark.id);
    });
    
    // favicon 错误处理（多CDN降级）
    const faviconImg = div.querySelector('.bookmark-favicon');
    let faviconRetryCount = 0;
    const faviconCDNs = [
        (url) => {
            const domain = new URL(url).hostname;
            return `https://api.xinac.net/icon/?url=${domain}&sz=128`;
        },
        (url) => {
            const domain = new URL(url).hostname;
            return `https://icon.horse/icon/${domain}`;
        },
        (url) => `chrome://favicon/size/16@1x/${url}`,
        () => 'icons/icon16.png'
    ];
    
    faviconImg.addEventListener('error', function() {
        faviconRetryCount++;
        if (faviconRetryCount < faviconCDNs.length) {
            try {
                this.src = faviconCDNs[faviconRetryCount](bookmark.url);
            } catch {
                this.src = 'icons/icon16.png';
            }
        } else {
            this.src = 'icons/icon16.png';
        }
    });
    
    // 拖拽
    div.addEventListener('dragstart', (e) => {
        draggedBookmark = { id: bookmark.id, isFolder: false, bookmark: bookmark };
        div.classList.add('dragging');
        document.getElementById('dragHint').classList.add('active');
        e.dataTransfer.setData('text/plain', bookmark.id);
        e.dataTransfer.effectAllowed = 'move';
    });
    
    div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
        document.getElementById('dragHint').classList.remove('active');
        document.querySelectorAll('.folder-item').forEach(el => {
            el.classList.remove('drag-over');
            el.classList.remove('drag-invalid');
        });
        // 延迟清除，确保 drop 事件先处理
        setTimeout(() => {
            draggedBookmark = null;
        }, 100);
    });
    
    return div;
}

function updateSelectionUI() {
    const deleteBtn = document.getElementById('btnDeleteSelected');
    const moveBtn = document.getElementById('btnBatchMove');
    const renameBtn = document.getElementById('btnBatchRename');
    const addToNavBtn = document.getElementById('btnAddToNav');
    const quickAddBtn = document.getElementById('btnQuickAddToNav');
    const selectAllCheckbox = document.getElementById('selectAllBookmarks');
    const bookmarks = getBookmarksForCurrentFolder();
    
    if (selectedBookmarks.size > 0) {
        deleteBtn.style.display = 'block';
        moveBtn.style.display = 'block';
        renameBtn.style.display = 'block';
        addToNavBtn.style.display = 'block';
        quickAddBtn.style.display = 'block';
        deleteBtn.textContent = `删除 (${selectedBookmarks.size})`;
        addToNavBtn.textContent = `🚀 选择分类 (${selectedBookmarks.size})`;
        quickAddBtn.textContent = `⚡ 快速添加 (${selectedBookmarks.size})`;
    } else {
        deleteBtn.style.display = 'none';
        moveBtn.style.display = 'none';
        renameBtn.style.display = 'none';
        addToNavBtn.style.display = 'none';
        quickAddBtn.style.display = 'none';
    }
    
    selectAllCheckbox.checked = bookmarks.length > 0 && selectedBookmarks.size === bookmarks.length;
}


// ==================== 事件绑定 ====================
function bindEvents() {
    // 搜索
    document.getElementById('searchInput').addEventListener('input', debounce(handleSearch, 300));
    
    // 新建文件夹
    document.getElementById('btnNewFolder').addEventListener('click', showNewFolderDialog);
    document.getElementById('btnAddFolder').addEventListener('click', showNewFolderDialog);
    
    // 添加书签
    document.getElementById('btnAddBookmark').addEventListener('click', () => {
        if (currentFolderId) {
            addBookmarkToFolder(currentFolderId);
        } else {
            addBookmarkToFolder('1'); // 默认添加到书签栏
        }
    });
    
    // 全选
    document.getElementById('selectAllBookmarks').addEventListener('change', (e) => {
        const bookmarks = getBookmarksForCurrentFolder();
        if (e.target.checked) {
            bookmarks.forEach(b => selectedBookmarks.add(b.id));
        } else {
            selectedBookmarks.clear();
        }
        renderBookmarkList();
        updateSelectionUI();
    });
    
    // 删除选中
    document.getElementById('btnDeleteSelected').addEventListener('click', deleteSelectedBookmarks);
    
    // 查找重复
    document.getElementById('btnFindDuplicates').addEventListener('click', findDuplicates);
    
    // 检测无效链接
    document.getElementById('btnCheckLinks').addEventListener('click', showCheckOptions);
    document.getElementById('btnStartCheck').addEventListener('click', startCheckWithOptions);
    document.getElementById('btnCancelOptions').addEventListener('click', hideCheckOptions);
    
    // 使用分析
    document.getElementById('btnAnalyzeUsage').addEventListener('click', analyzeUsage);
    
    // 检测长期未使用
    document.getElementById('btnFindUnused').addEventListener('click', findUnusedBookmarks);
    
    // 统计面板
    document.getElementById('btnStatistics').addEventListener('click', showStatisticsPanel);
    
    // 时间线筛选
    document.getElementById('timelineFilter').addEventListener('change', handleTimelineFilter);
    
    // 自动标签
    document.getElementById('btnAutoTag').addEventListener('click', autoTagAllBookmarks);
    
    // 快捷键帮助
    document.getElementById('btnShowShortcuts').addEventListener('click', showShortcutsHelp);
    
    // 导航页设置
    document.getElementById('btnNavSettings').addEventListener('click', showNavSettingsModal);
    document.getElementById('navSettingsClose').addEventListener('click', closeNavSettingsModal);
    document.getElementById('btnCancelNavSettings').addEventListener('click', closeNavSettingsModal);
    document.getElementById('btnSaveNavSettings').addEventListener('click', saveNavSettings);
    document.getElementById('btnTestConnection').addEventListener('click', testNavConnection);
    document.getElementById('defaultMenuSelect').addEventListener('change', onDefaultMenuChange);
    document.getElementById('btnNewMenuFromSettings').addEventListener('click', () => showNewMenuModalFromSettings('menu'));
    document.getElementById('btnNewSubMenuFromSettings').addEventListener('click', () => showNewMenuModalFromSettings('submenu'));
    document.getElementById('btnDeleteMenuFromSettings').addEventListener('click', deleteMenuFromSettings);
    document.getElementById('btnDeleteSubMenuFromSettings').addEventListener('click', deleteSubMenuFromSettings);
    
    // 文件夹右键菜单
    document.getElementById('ctxFolderToNav').addEventListener('click', () => { hideFolderContextMenu(); showImportFolderModal(); });
    document.getElementById('ctxFolderEdit').addEventListener('click', () => { hideFolderContextMenu(); editFolder(rightClickedFolderId); });
    document.getElementById('ctxFolderDelete').addEventListener('click', () => { hideFolderContextMenu(); deleteFolder(rightClickedFolderId); });
    
    // 导入文件夹弹窗
    document.getElementById('importFolderClose').addEventListener('click', closeImportFolderModal);
    document.getElementById('btnCancelImportFolder').addEventListener('click', closeImportFolderModal);
    document.getElementById('btnConfirmImportFolder').addEventListener('click', confirmImportFolder);
    document.getElementById('importFolderType').addEventListener('change', onImportTypeChange);
    
    // 合并文件夹
    document.getElementById('btnMergeFolders').addEventListener('click', showMergeFoldersModal);
    
    // 空文件夹检测
    document.getElementById('btnFindEmptyFolders').addEventListener('click', findEmptyFolders);
    
    // 清除标签筛选
    document.getElementById('btnClearTagFilter').addEventListener('click', () => {
        currentTagFilters = [];
        renderTagCloud();
        renderBookmarkList();
    });
    
    // 编辑弹窗
    document.getElementById('modalClose').addEventListener('click', closeEditModal);
    document.getElementById('btnCancelEdit').addEventListener('click', closeEditModal);
    document.getElementById('btnSaveEdit').addEventListener('click', saveEdit);
    
    // 结果弹窗
    document.getElementById('resultClose').addEventListener('click', closeResultModal);
    document.getElementById('btnCloseResult').addEventListener('click', closeResultModal);
    document.getElementById('resultSelectAll').addEventListener('change', toggleResultSelectAll);
    document.getElementById('btnDeleteSelectedResults').addEventListener('click', deleteSelectedResults);
    
    // 排序选择
    document.getElementById('sortOrder').addEventListener('change', (e) => {
        currentSortOrder = e.target.value;
        renderBookmarkList();
    });
    
    // 自动排序开关
    document.getElementById('autoSortEnabled').addEventListener('change', (e) => {
        toggleAutoSort(e.target.checked);
    });
    
    // 批量移动
    document.getElementById('btnBatchMove').addEventListener('click', showBatchMoveModal);
    document.getElementById('batchMoveClose').addEventListener('click', closeBatchMoveModal);
    document.getElementById('btnCancelBatchMove').addEventListener('click', closeBatchMoveModal);
    document.getElementById('btnConfirmBatchMove').addEventListener('click', confirmBatchMove);
    
    // 批量重命名
    document.getElementById('btnBatchRename').addEventListener('click', showBatchRenameModal);
    document.getElementById('batchRenameClose').addEventListener('click', closeBatchRenameModal);
    document.getElementById('btnCancelBatchRename').addEventListener('click', closeBatchRenameModal);
    document.getElementById('btnConfirmBatchRename').addEventListener('click', confirmBatchRename);
    document.getElementById('renameRule').addEventListener('change', updateRenameUI);
    
    // 添加到导航页
    document.getElementById('btnQuickAddToNav').addEventListener('click', quickAddToNav);
    document.getElementById('btnAddToNav').addEventListener('click', showAddToNavModal);
    document.getElementById('addToNavClose').addEventListener('click', closeAddToNavModal);
    document.getElementById('btnCancelAddToNav').addEventListener('click', closeAddToNavModal);
    document.getElementById('btnLoadMenus').addEventListener('click', loadNavMenus);
    document.getElementById('btnConfirmAddToNav').addEventListener('click', confirmAddToNav);
    document.getElementById('navMenuSelect').addEventListener('change', onMenuSelectChange);
    document.getElementById('btnAddMenu').addEventListener('click', () => showNewMenuModal('menu'));
    document.getElementById('btnAddSubMenu').addEventListener('click', () => showNewMenuModal('submenu'));
    document.getElementById('newMenuClose').addEventListener('click', closeNewMenuModal);
    document.getElementById('btnCancelNewMenu').addEventListener('click', closeNewMenuModal);
    document.getElementById('btnConfirmNewMenu').addEventListener('click', confirmNewMenu);
    
    // 右键菜单
    bindContextMenu();
    
    // 点击其他地方关闭右键菜单
    document.addEventListener('click', hideContextMenu);
    document.addEventListener('contextmenu', (e) => {
        // 如果不是在书签列表区域右键，则关闭菜单
        if (!e.target.closest('.bookmark-list')) {
            hideContextMenu();
        }
    });
    
    // 键盘快捷键
    bindKeyboardShortcuts();
}

// ==================== 键盘快捷键 ====================
function showShortcutsHelp() {
    const resultList = document.getElementById('resultList');
    document.getElementById('resultTitle').textContent = '⌨️ 键盘快捷键';
    
    resultList.innerHTML = `
        <div style="padding: 8px;">
            <div style="display: grid; grid-template-columns: 120px 1fr; gap: 12px; font-size: 14px;">
                <div style="font-weight: 600; color: #667eea;">Ctrl + K</div>
                <div>聚焦搜索框</div>
                
                <div style="font-weight: 600; color: #667eea;">Ctrl + A</div>
                <div>全选当前文件夹的书签</div>
                
                <div style="font-weight: 600; color: #667eea;">Delete</div>
                <div>删除选中的书签</div>
                
                <div style="font-weight: 600; color: #667eea;">Escape</div>
                <div>取消选择 / 关闭弹窗 / 清除筛选</div>
                
                <div style="font-weight: 600; color: #667eea;">F</div>
                <div>查找重复书签</div>
                
                <div style="font-weight: 600; color: #667eea;">N</div>
                <div>新建文件夹</div>
                
                <div style="font-weight: 600; color: #667eea;">R</div>
                <div>刷新书签列表</div>
            </div>
            
            <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e0e0e0;">
                <div style="font-weight: 600; margin-bottom: 12px; color: #333;">🖱️ 鼠标操作</div>
                <div style="display: grid; grid-template-columns: 120px 1fr; gap: 12px; font-size: 14px;">
                    <div style="font-weight: 600; color: #10b981;">右键点击</div>
                    <div>显示批量操作菜单</div>
                    
                    <div style="font-weight: 600; color: #10b981;">拖拽书签</div>
                    <div>移动到其他文件夹</div>
                    
                    <div style="font-weight: 600; color: #10b981;">拖拽文件夹</div>
                    <div>移动到其他文件夹内</div>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('resultModal').classList.add('active');
    hideResultFooterActions();
}

function bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // 如果在输入框中，不处理快捷键
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
            // 但 Escape 键仍然处理
            if (e.key === 'Escape') {
                e.target.blur();
            }
            return;
        }
        
        // Ctrl/Cmd + K: 聚焦搜索框
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('searchInput').focus();
            return;
        }
        
        // Ctrl/Cmd + A: 全选
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            e.preventDefault();
            const bookmarks = getBookmarksForCurrentFolder();
            bookmarks.forEach(b => selectedBookmarks.add(b.id));
            renderBookmarkList();
            updateSelectionUI();
            return;
        }
        
        // Delete: 删除选中
        if (e.key === 'Delete' && selectedBookmarks.size > 0) {
            e.preventDefault();
            deleteSelectedBookmarks();
            return;
        }
        
        // Escape: 取消选择 / 关闭弹窗
        if (e.key === 'Escape') {
            // 关闭弹窗
            if (document.getElementById('editModal').classList.contains('active')) {
                closeEditModal();
                return;
            }
            if (document.getElementById('resultModal').classList.contains('active')) {
                closeResultModal();
                return;
            }
            if (document.getElementById('batchMoveModal').classList.contains('active')) {
                closeBatchMoveModal();
                return;
            }
            if (document.getElementById('batchRenameModal').classList.contains('active')) {
                closeBatchRenameModal();
                return;
            }
            
            // 清除选择
            if (selectedBookmarks.size > 0) {
                selectedBookmarks.clear();
                renderBookmarkList();
                updateSelectionUI();
                return;
            }
            
            // 清除标签筛选
            if (currentTagFilters.length > 0) {
                currentTagFilters = [];
                renderTagCloud();
                renderBookmarkList();
                return;
            }
        }
        
        // F: 查找重复
        if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            findDuplicates();
            return;
        }
        
        // N: 新建文件夹
        if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            showNewFolderDialog();
            return;
        }
        
        // R: 刷新
        if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            loadBookmarks();
            return;
        }
    });
}

function debounce(fn, delay) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ==================== 右键菜单 ====================
function bindContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    const bookmarkList = document.getElementById('bookmarkList');
    
    // 书签列表右键事件
    bookmarkList.addEventListener('contextmenu', (e) => {
        // 检查是否点击在书签项上
        const bookmarkItem = e.target.closest('.bookmark-item');
        if (!bookmarkItem) return;
        
        e.preventDefault();
        
        const bookmarkId = bookmarkItem.dataset.id;
        
        // 如果右键的书签未被选中，则只选中这一个
        if (!selectedBookmarks.has(bookmarkId)) {
            selectedBookmarks.clear();
            selectedBookmarks.add(bookmarkId);
            renderBookmarkList();
            updateSelectionUI();
        }
        
        // 只有选中了书签才显示菜单
        if (selectedBookmarks.size > 0) {
            showContextMenu(e.clientX, e.clientY);
        }
    });
    
    // 右键菜单项点击事件
    document.getElementById('ctxBatchMove').addEventListener('click', (e) => {
        e.stopPropagation();
        hideContextMenu();
        showBatchMoveModal();
    });
    
    document.getElementById('ctxBatchRename').addEventListener('click', (e) => {
        e.stopPropagation();
        hideContextMenu();
        showBatchRenameModal();
    });
    
    document.getElementById('ctxBatchDelete').addEventListener('click', (e) => {
        e.stopPropagation();
        hideContextMenu();
        deleteSelectedBookmarks();
    });
}

function showContextMenu(x, y) {
    const contextMenu = document.getElementById('contextMenu');
    const count = selectedBookmarks.size;
    
    // 更新菜单文本显示选中数量
    document.querySelector('#ctxBatchMove span:last-child').textContent = `批量移动 (${count})`;
    document.querySelector('#ctxBatchRename span:last-child').textContent = `批量重命名 (${count})`;
    document.querySelector('#ctxBatchDelete span:last-child').textContent = `批量删除 (${count})`;
    
    // 显示菜单
    contextMenu.classList.add('active');
    
    // 调整位置，确保不超出屏幕
    const menuWidth = 200;
    const menuHeight = 200;
    
    let left = x;
    let top = y;
    
    if (x + menuWidth > window.innerWidth) {
        left = x - menuWidth;
    }
    
    if (y + menuHeight > window.innerHeight) {
        top = y - menuHeight;
    }
    
    contextMenu.style.left = left + 'px';
    contextMenu.style.top = top + 'px';
}

function hideContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.classList.remove('active');
}

// ==================== 智能搜索 ====================
// 拼音映射表（简化版）
const pinyinMap = {
    'a': '啊阿呵吖',
    'b': '不吧把被比别并',
    'c': '才从此次',
    'd': '的大到都对',
    'e': '额而儿',
    'f': '发放分',
    'g': '个给过',
    'h': '和好还会后',
    'j': '就见将',
    'k': '可看',
    'l': '了来里',
    'm': '们没么',
    'n': '你那能',
    'p': '品牌',
    'q': '去前其',
    'r': '人如',
    's': '是说所',
    't': '他她它太',
    'w': '我为文',
    'x': '下想新',
    'y': '一有要用',
    'z': '在这中'
};

// 生成拼音首字母
function getPinyinInitials(text) {
    if (!text) return '';
    let result = '';
    for (let char of text) {
        let found = false;
        for (let [initial, chars] of Object.entries(pinyinMap)) {
            if (chars.includes(char)) {
                result += initial;
                found = true;
                break;
            }
        }
        if (!found) {
            // 如果不是中文，保留原字符
            result += char.toLowerCase();
        }
    }
    return result;
}

// 模糊匹配评分
function fuzzyMatch(text, query) {
    if (!text || !query) return 0;
    
    text = text.toLowerCase();
    query = query.toLowerCase();
    
    // 完全匹配
    if (text === query) return 100;
    
    // 包含匹配
    if (text.includes(query)) return 80;
    
    // 拼音首字母匹配
    const pinyin = getPinyinInitials(text);
    if (pinyin.includes(query)) return 60;
    
    // 模糊匹配（计算相似度）
    let score = 0;
    let queryIndex = 0;
    
    for (let i = 0; i < text.length && queryIndex < query.length; i++) {
        if (text[i] === query[queryIndex]) {
            score += 10;
            queryIndex++;
        }
    }
    
    // 如果所有查询字符都找到了
    if (queryIndex === query.length) {
        return score;
    }
    
    return 0;
}

function handleSearch(e) {
    const query = e.target.value.trim();
    const container = document.getElementById('bookmarkList');
    
    if (!query) {
        renderBookmarkList();
        return;
    }
    
    const allBookmarksList = [];
    collectAllBookmarks(allBookmarks, allBookmarksList);
    
    // 智能搜索：标题、URL、拼音
    const results = allBookmarksList.map(b => {
        const titleScore = fuzzyMatch(b.title || '', query);
        const urlScore = fuzzyMatch(b.url || '', query) * 0.5; // URL权重降低
        const totalScore = Math.max(titleScore, urlScore);
        
        return { bookmark: b, score: totalScore };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.bookmark);
    
    container.innerHTML = '';
    
    if (results.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><p>未找到匹配的书签</p><p style="font-size: 12px; color: #999; margin-top: 8px;">支持拼音首字母搜索，如"百度"可搜"bd"</p></div>';
        return;
    }
    
    document.getElementById('currentFolderName').textContent = `搜索结果 (${results.length})`;
    
    for (const bookmark of results) {
        const item = createBookmarkItem(bookmark);
        container.appendChild(item);
    }
}


// ==================== 编辑功能 ====================
async function editBookmark(id) {
    try {
        const [bookmark] = await chrome.bookmarks.get(id);
        editingItem = { type: 'bookmark', id, data: bookmark };
        
        document.getElementById('modalTitle').textContent = '编辑书签';
        document.getElementById('editName').value = bookmark.title || '';
        document.getElementById('editUrl').value = bookmark.url || '';
        document.getElementById('urlGroup').style.display = 'block';
        document.getElementById('editModal').classList.add('active');
    } catch (error) {
        alert('获取书签信息失败');
    }
}

async function editFolder(id) {
    try {
        const [folder] = await chrome.bookmarks.get(id);
        editingItem = { type: 'folder', id, data: folder };
        
        document.getElementById('modalTitle').textContent = '编辑文件夹';
        document.getElementById('editName').value = folder.title || '';
        document.getElementById('urlGroup').style.display = 'none';
        document.getElementById('editModal').classList.add('active');
    } catch (error) {
        alert('获取文件夹信息失败');
    }
}

function showNewFolderDialog() {
    editingItem = { type: 'newFolder', id: null };
    document.getElementById('modalTitle').textContent = '新建文件夹';
    document.getElementById('editName').value = '';
    document.getElementById('urlGroup').style.display = 'none';
    document.getElementById('editModal').classList.add('active');
}

function addBookmarkToFolder(folderId) {
    editingItem = { type: 'newBookmark', parentId: folderId };
    document.getElementById('modalTitle').textContent = '添加书签';
    document.getElementById('editName').value = '';
    document.getElementById('editUrl').value = '';
    document.getElementById('urlGroup').style.display = 'block';
    document.getElementById('editModal').classList.add('active');
}

async function saveEdit() {
    const name = document.getElementById('editName').value.trim();
    const url = document.getElementById('editUrl').value.trim();
    
    if (!name) {
        alert('请输入名称');
        return;
    }
    
    try {
        if (editingItem.type === 'bookmark') {
            if (!url) { alert('请输入网址'); return; }
            await chrome.bookmarks.update(editingItem.id, { title: name, url });
        } else if (editingItem.type === 'folder') {
            await chrome.bookmarks.update(editingItem.id, { title: name });
        } else if (editingItem.type === 'newFolder') {
            const parentId = currentFolderId || '1';
            await chrome.bookmarks.create({ parentId, title: name });
        } else if (editingItem.type === 'newBookmark') {
            if (!url) { alert('请输入网址'); return; }
            await chrome.bookmarks.create({ parentId: editingItem.parentId, title: name, url });
        }
        
        closeEditModal();
        await loadBookmarks();
    } catch (error) {
        alert('保存失败: ' + error.message);
    }
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
    editingItem = null;
}

// ==================== 删除功能 ====================
async function deleteBookmark(id) {
    if (!confirm('确定要删除这个书签吗？')) return;
    
    try {
        await chrome.bookmarks.remove(id);
        selectedBookmarks.delete(id);
        await loadBookmarks();
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

async function deleteSelectedBookmarks() {
    if (selectedBookmarks.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedBookmarks.size} 个书签吗？`)) return;
    
    try {
        for (const id of selectedBookmarks) {
            await chrome.bookmarks.remove(id);
        }
        selectedBookmarks.clear();
        await loadBookmarks();
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

async function deleteFolder(id) {
    if (!confirm('确定要删除这个文件夹及其所有内容吗？')) return;
    
    try {
        await chrome.bookmarks.removeTree(id);
        if (currentFolderId === id) currentFolderId = null;
        await loadBookmarks();
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}


// ==================== 查找重复 ====================
async function findDuplicates() {
    const urlMap = new Map();
    const allBookmarksList = [];
    collectAllBookmarks(allBookmarks, allBookmarksList);
    
    // 为每个书签添加路径信息和是否为快捷方式
    for (const bookmark of allBookmarksList) {
        const normalizedUrl = normalizeUrl(bookmark.url);
        const path = await getBookmarkPath(bookmark.id);
        const isShortcut = isInShortcutFolder(bookmark);
        
        if (!urlMap.has(normalizedUrl)) {
            urlMap.set(normalizedUrl, []);
        }
        urlMap.get(normalizedUrl).push({ ...bookmark, path, isShortcut });
    }
    
    const duplicates = [];
    for (const [url, bookmarks] of urlMap) {
        if (bookmarks.length > 1) {
            duplicates.push({ url, bookmarks });
        }
    }
    
    showDuplicatesResult(duplicates);
}

// 获取书签的完整路径
async function getBookmarkPath(bookmarkId) {
    const path = [];
    let currentId = bookmarkId;
    
    try {
        while (currentId && currentId !== '0') {
            const [node] = await chrome.bookmarks.get(currentId);
            if (!node) break;
            if (node.title && !node.url) {
                path.unshift(node.title);
            }
            currentId = node.parentId;
        }
    } catch (e) {}
    
    return path.join(' / ') || '根目录';
}

function normalizeUrl(url) {
    try {
        const urlObj = new URL(url);
        let normalized = urlObj.hostname.replace(/^www\./, '') + urlObj.pathname.replace(/\/$/, '') + urlObj.search;
        return normalized.toLowerCase();
    } catch {
        return url.toLowerCase();
    }
}

function showDuplicatesResult(duplicates) {
    const resultList = document.getElementById('resultList');
    document.getElementById('resultTitle').textContent = '重复书签';
    
    if (duplicates.length === 0) {
        resultList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p>没有发现重复的书签</p></div>';
        hideResultFooterActions();
    } else {
        // 统计
        let totalDuplicates = 0;
        let shortcutCount = 0;
        duplicates.forEach(g => {
            g.bookmarks.forEach(b => {
                totalDuplicates++;
                if (b.isShortcut) shortcutCount++;
            });
        });
        
        let html = `
            <div style="margin-bottom: 16px;">
                <div style="color: #666; margin-bottom: 8px;">发现 ${duplicates.length} 组重复书签，共 ${totalDuplicates} 个</div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="btn btn-small btn-secondary" id="btnSmartSelect">🎯 智能选择重复项</button>
                    <span style="font-size: 12px; color: #999; line-height: 28px;">（保留每组第一个，选中其余重复项）</span>
                </div>
            </div>
        `;
        
        for (const group of duplicates) {
            html += `<div style="margin-bottom: 16px; padding: 12px; background: #f9f9f9; border-radius: 8px;">`;
            html += `<div style="font-size: 12px; color: #999; margin-bottom: 8px; word-break: break-all;">${escapeHtml(group.url)}</div>`;
            
            let isFirst = true;
            for (const bookmark of group.bookmarks) {
                const statusClass = bookmark.isShortcut ? 'status-ok' : 'status-duplicate';
                const statusText = bookmark.isShortcut ? '快捷方式' : '重复';
                const disabled = bookmark.isShortcut ? 'disabled' : '';
                const firstBadge = isFirst && !bookmark.isShortcut ? '<span style="background:#d1fae5;color:#059669;padding:2px 6px;border-radius:4px;font-size:11px;margin-left:8px;">保留</span>' : '';
                
                html += `
                    <div class="result-item" data-bookmark-id="${bookmark.id}" data-is-shortcut="${bookmark.isShortcut}" data-is-first="${isFirst && !bookmark.isShortcut}">
                        <input type="checkbox" class="result-checkbox" ${disabled} ${bookmark.isShortcut ? 'style="opacity:0.3"' : ''}>
                        <div class="result-info">
                            <div class="result-title">${escapeHtml(bookmark.title)}${firstBadge}</div>
                            <div class="result-url">📁 ${escapeHtml(bookmark.path)}</div>
                        </div>
                        <span class="result-status ${statusClass}">${statusText}</span>
                    </div>
                `;
                
                if (!bookmark.isShortcut) isFirst = false;
            }
            html += '</div>';
        }
        
        resultList.innerHTML = html;
        showResultFooterActions();
        bindResultCheckboxes();
        
        // 绑定智能选择按钮
        document.getElementById('btnSmartSelect').addEventListener('click', smartSelectDuplicates);
    }
    
    document.getElementById('resultModal').classList.add('active');
}

// 智能选择重复项（保留每组第一个非快捷方式书签，选中其余）
function smartSelectDuplicates() {
    const items = document.querySelectorAll('.result-item');
    
    items.forEach(item => {
        const checkbox = item.querySelector('.result-checkbox');
        const isShortcut = item.dataset.isShortcut === 'true';
        const isFirst = item.dataset.isFirst === 'true';
        
        if (!isShortcut && !isFirst && !checkbox.disabled) {
            checkbox.checked = true;
        } else {
            checkbox.checked = false;
        }
    });
    
    updateResultSelection();
}


// ==================== 链接检测 ====================
let checkingLinks = false;
let cancelCheck = false;
const urlCheckCache = new Map();
const hostLastTime = {};
const HOST_SPACING_MS = 200;

let checkOptions = {
    ignorePrivateIp: true,
    scanFolderId: null
};

function showCheckOptions() {
    if (checkingLinks) {
        cancelCheck = true;
        return;
    }
    
    const select = document.getElementById('scanFolderId');
    select.innerHTML = '<option value="">全部书签</option>';
    populateFolderSelect(allBookmarks, select, 0);
    document.getElementById('checkOptions').style.display = 'block';
}

function populateFolderSelect(nodes, select, level) {
    for (const node of nodes) {
        if (node.children) {
            const indent = '　'.repeat(level);
            const option = document.createElement('option');
            option.value = node.id;
            option.textContent = indent + '📁 ' + (node.title || '未命名');
            select.appendChild(option);
            populateFolderSelect(node.children, select, level + 1);
        }
    }
}

function hideCheckOptions() {
    document.getElementById('checkOptions').style.display = 'none';
}

async function startCheckWithOptions() {
    checkOptions.ignorePrivateIp = document.getElementById('ignorePrivateIp').checked;
    checkOptions.scanFolderId = document.getElementById('scanFolderId').value || null;
    hideCheckOptions();
    await checkInvalidLinks();
}

function isPrivateIp(url) {
    try {
        const hostname = new URL(url).hostname;
        if (hostname === 'localhost' || hostname === '::1' || hostname === '[::1]') return true;
        if (hostname.startsWith('127.') || hostname.startsWith('10.') || hostname.startsWith('192.168.')) return true;
        const match = hostname.match(/^172\.(\d+)\./);
        if (match) {
            const second = parseInt(match[1], 10);
            if (second >= 16 && second <= 31) return true;
        }
        return false;
    } catch {
        return false;
    }
}

async function checkInvalidLinks(forceRefresh = false) {
    if (checkingLinks) {
        cancelCheck = true;
        return;
    }
    
    // 检查是否有缓存的结果（非强制刷新时）
    if (!forceRefresh) {
        const cached = await loadInvalidLinksCache();
        if (cached && cached.length > 0) {
            const cacheAge = Math.floor((Date.now() - cachedInvalidLinksTime) / 60000);
            const useCache = confirm(`发现 ${cacheAge} 分钟前的检测结果（${cached.length} 个无效链接）\n\n点击"确定"查看缓存结果\n点击"取消"重新检测`);
            if (useCache) {
                document.getElementById('resultTitle').textContent = '检测无效链接';
                document.getElementById('resultModal').classList.add('active');
                showInvalidLinksResult(cached);
                return;
            }
        }
    }
    
    const bookmarks = [];
    if (checkOptions.scanFolderId) {
        const folder = findFolderById(allBookmarks, checkOptions.scanFolderId);
        if (folder) collectAllBookmarks([folder], bookmarks);
    } else {
        collectAllBookmarks(allBookmarks, bookmarks);
    }
    
    const filteredBookmarks = checkOptions.ignorePrivateIp 
        ? bookmarks.filter(b => !isPrivateIp(b.url))
        : bookmarks;
    
    if (filteredBookmarks.length === 0) {
        alert('没有书签可检测');
        return;
    }
    
    checkingLinks = true;
    cancelCheck = false;
    urlCheckCache.clear();
    
    const resultList = document.getElementById('resultList');
    const btn = document.getElementById('btnCheckLinks');
    btn.textContent = '⏹️ 停止检测';
    
    const skippedCount = bookmarks.length - filteredBookmarks.length;
    const skippedMsg = skippedCount > 0 ? `（已跳过 ${skippedCount} 个内网地址）` : '';
    
    document.getElementById('resultTitle').textContent = '检测无效链接';
    resultList.innerHTML = `<div class="loading">正在检测 ${filteredBookmarks.length} 个书签...${skippedMsg}</div>`;
    document.getElementById('resultModal').classList.add('active');
    hideResultFooterActions();
    
    const invalidLinks = [];
    const batchSize = 10;
    let checked = 0;
    
    for (let i = 0; i < filteredBookmarks.length && !cancelCheck; i += batchSize) {
        const batch = filteredBookmarks.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(async (bookmark) => {
            const result = await checkLinkWithDns(bookmark);
            return { bookmark, ...result };
        }));
        
        for (const result of results) {
            if (!result.valid) {
                invalidLinks.push(result);
            }
        }
        
        checked = Math.min(i + batchSize, filteredBookmarks.length);
        const percent = Math.round((checked / filteredBookmarks.length) * 100);
        resultList.innerHTML = `
            <div class="loading">
                <div>正在检测... ${checked}/${filteredBookmarks.length} (${percent}%)</div>
                <div style="margin-top: 8px; background: #e0e0e0; border-radius: 4px; height: 8px; overflow: hidden;">
                    <div style="width: ${percent}%; height: 100%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); transition: width 0.3s;"></div>
                </div>
                <div style="margin-top: 8px; font-size: 12px; color: #999;">已发现 ${invalidLinks.length} 个可能无效的链接</div>
            </div>
        `;
    }
    
    checkingLinks = false;
    btn.textContent = '🔗 检测无效链接';
    
    showInvalidLinksResult(invalidLinks);
}


// HTTP 检测
async function throttleHost(url) {
    try {
        const hostname = new URL(url).hostname;
        const lastTime = hostLastTime[hostname] || 0;
        const elapsed = Date.now() - lastTime;
        if (elapsed < HOST_SPACING_MS) {
            await new Promise(resolve => setTimeout(resolve, HOST_SPACING_MS - elapsed));
        }
        hostLastTime[hostname] = Date.now();
    } catch (e) {}
}

async function checkLinkWithDns(bookmark) {
    const url = bookmark.url;
    if (urlCheckCache.has(url)) return urlCheckCache.get(url);
    
    await throttleHost(url);
    const httpResult = await checkLinkHttp(url);
    
    if (!httpResult.valid) {
        const dnsResult = await checkDns(url);
        const result = { valid: false, error: httpResult.error, dnsStatus: dnsResult.status, dnsMessage: dnsResult.message };
        urlCheckCache.set(url, result);
        return result;
    }
    
    const result = { valid: true, dnsStatus: 'skip' };
    urlCheckCache.set(url, result);
    return result;
}

async function checkLinkHttp(url, timeoutMs = 8000) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const response = await fetch(url, { method: 'HEAD', mode: 'cors', redirect: 'follow', credentials: 'omit', cache: 'no-store', signal: controller.signal });
        clearTimeout(timer);
        if (response.ok || response.status === 401 || response.status === 403) return { valid: true, status: response.status };
        if (response.status >= 400) return { valid: false, error: `HTTP ${response.status}` };
        return { valid: true, status: response.status };
    } catch (error) {
        if (error.name === 'AbortError') return { valid: false, error: '超时' };
        try {
            const controller2 = new AbortController();
            const timer2 = setTimeout(() => controller2.abort(), 5000);
            const response2 = await fetch(url, { method: 'GET', mode: 'cors', redirect: 'follow', credentials: 'omit', cache: 'no-store', signal: controller2.signal });
            clearTimeout(timer2);
            if (response2.ok || response2.status === 401 || response2.status === 403) return { valid: true, status: response2.status };
            return { valid: false, error: `HTTP ${response2.status}` };
        } catch (error2) {
            try {
                const controller3 = new AbortController();
                const timer3 = setTimeout(() => controller3.abort(), 3000);
                await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: controller3.signal });
                clearTimeout(timer3);
                return { valid: true, status: 'no-cors' };
            } catch (error3) {
                if (error3.name === 'AbortError') return { valid: false, error: '超时' };
                return { valid: false, error: '无法访问' };
            }
        }
    }
}

async function checkDns(url) {
    try {
        const hostname = new URL(url).hostname;
        const lang = navigator.language || 'en';
        const isZhCN = lang.startsWith('zh');
        
        const dohProviders = isZhCN ? [
            { name: 'alidns', url: `https://dns.alidns.com/resolve?name=${hostname}&type=A` },
            { name: 'cloudflare', url: `https://cloudflare-dns.com/dns-query?name=${hostname}&type=A` },
            { name: 'google', url: `https://dns.google/resolve?name=${hostname}&type=A` }
        ] : [
            { name: 'google', url: `https://dns.google/resolve?name=${hostname}&type=A` },
            { name: 'cloudflare', url: `https://cloudflare-dns.com/dns-query?name=${hostname}&type=A` },
            { name: 'alidns', url: `https://dns.alidns.com/resolve?name=${hostname}&type=A` }
        ];
        
        for (const provider of dohProviders) {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 3000);
                const response = await fetch(provider.url, { method: 'GET', headers: { 'Accept': 'application/dns-json' }, signal: controller.signal });
                clearTimeout(timer);
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
                        return { status: 'ok', message: `DNS 解析成功 (${provider.name})`, provider: provider.name };
                    } else if (data.Status === 3) {
                        return { status: 'nxdomain', message: `域名不存在 (${provider.name})`, provider: provider.name };
                    } else {
                        return { status: 'error', message: `DNS 错误 ${data.Status} (${provider.name})`, provider: provider.name };
                    }
                }
            } catch (e) { continue; }
        }
        return { status: 'failed', message: '所有 DNS 查询失败' };
    } catch (e) {
        return { status: 'error', message: 'DNS 检测异常' };
    }
}


// 缓存无效链接检测结果
let cachedInvalidLinks = null;
let cachedInvalidLinksTime = 0;
const CACHE_EXPIRE_MS = 30 * 60 * 1000; // 30分钟过期

// 保存检测结果到本地存储
async function saveInvalidLinksCache(invalidLinks) {
    try {
        cachedInvalidLinks = invalidLinks;
        cachedInvalidLinksTime = Date.now();
        await chrome.storage.local.set({
            invalidLinksCache: invalidLinks.map(item => ({
                bookmarkId: item.bookmark.id,
                bookmarkTitle: item.bookmark.title,
                bookmarkUrl: item.bookmark.url,
                error: item.error,
                dnsStatus: item.dnsStatus,
                dnsMessage: item.dnsMessage
            })),
            invalidLinksCacheTime: cachedInvalidLinksTime
        });
    } catch (e) {
        console.error('保存检测结果缓存失败:', e);
    }
}

// 从本地存储加载检测结果
async function loadInvalidLinksCache() {
    try {
        const result = await chrome.storage.local.get(['invalidLinksCache', 'invalidLinksCacheTime']);
        if (result.invalidLinksCache && result.invalidLinksCacheTime) {
            const age = Date.now() - result.invalidLinksCacheTime;
            if (age < CACHE_EXPIRE_MS) {
                cachedInvalidLinksTime = result.invalidLinksCacheTime;
                // 重建完整的数据结构
                cachedInvalidLinks = result.invalidLinksCache.map(item => ({
                    bookmark: { id: item.bookmarkId, title: item.bookmarkTitle, url: item.bookmarkUrl },
                    error: item.error,
                    dnsStatus: item.dnsStatus,
                    dnsMessage: item.dnsMessage
                }));
                return cachedInvalidLinks;
            }
        }
    } catch (e) {
        console.error('加载检测结果缓存失败:', e);
    }
    return null;
}

// 清除检测结果缓存
async function clearInvalidLinksCache() {
    cachedInvalidLinks = null;
    cachedInvalidLinksTime = 0;
    await chrome.storage.local.remove(['invalidLinksCache', 'invalidLinksCacheTime']);
}

// 当前筛选状态
let currentInvalidFilter = 'all';

function showInvalidLinksResult(invalidLinks, filter = 'all') {
    const resultList = document.getElementById('resultList');
    currentInvalidFilter = filter;
    
    // 保存到缓存
    if (invalidLinks && invalidLinks.length > 0) {
        saveInvalidLinksCache(invalidLinks);
    }
    
    if (!invalidLinks || invalidLinks.length === 0) {
        resultList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p>所有链接都有效</p></div>';
        hideResultFooterActions();
        return;
    }
    
    // 分类统计
    const dnsNxdomainItems = invalidLinks.filter(item => item.dnsStatus === 'nxdomain');
    const dnsOkItems = invalidLinks.filter(item => item.dnsStatus === 'ok');
    const timeoutItems = invalidLinks.filter(item => item.error === '超时');
    const dnsFailedItems = invalidLinks.filter(item => item.dnsStatus === 'failed' || item.dnsStatus === 'error');
    
    // 根据筛选条件过滤显示的项目
    let filteredItems = invalidLinks;
    let filterTitle = '全部问题链接';
    if (filter === 'nxdomain') {
        filteredItems = dnsNxdomainItems;
        filterTitle = '域名不存在（可安全删除）';
    } else if (filter === 'dns_ok') {
        filteredItems = dnsOkItems;
        filterTitle = 'DNS正常但HTTP失败（建议手动确认）';
    } else if (filter === 'timeout') {
        filteredItems = timeoutItems;
        filterTitle = '连接超时（可能是网络问题）';
    } else if (filter === 'dns_failed') {
        filteredItems = dnsFailedItems;
        filterTitle = 'DNS检测失败';
    }
    
    // 缓存时间提示
    const cacheAge = cachedInvalidLinksTime ? Math.floor((Date.now() - cachedInvalidLinksTime) / 60000) : 0;
    const cacheHint = cachedInvalidLinksTime ? `（${cacheAge}分钟前的结果）` : '';
    
    let html = `
        <div style="margin-bottom: 16px;">
            <!-- 统计卡片 -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; margin-bottom: 16px;">
                <div class="filter-card" data-filter="all" style="cursor: pointer; padding: 12px; border-radius: 8px; text-align: center; transition: all 0.2s; ${filter === 'all' ? 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);' : 'background: #f3f4f6; color: #374151;'}">
                    <div style="font-size: 24px; font-weight: bold;">${invalidLinks.length}</div>
                    <div style="font-size: 11px; opacity: 0.9;">全部</div>
                </div>
                <div class="filter-card" data-filter="nxdomain" style="cursor: pointer; padding: 12px; border-radius: 8px; text-align: center; transition: all 0.2s; ${filter === 'nxdomain' ? 'background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);' : 'background: #fee2e2; color: #dc2626;'}">
                    <div style="font-size: 24px; font-weight: bold;">${dnsNxdomainItems.length}</div>
                    <div style="font-size: 11px; opacity: 0.9;">🔴 域名不存在</div>
                </div>
                <div class="filter-card" data-filter="dns_ok" style="cursor: pointer; padding: 12px; border-radius: 8px; text-align: center; transition: all 0.2s; ${filter === 'dns_ok' ? 'background: linear-gradient(135deg, #d97706 0%, #b45309 100%); color: white; box-shadow: 0 4px 12px rgba(217, 119, 6, 0.4);' : 'background: #fef3c7; color: #d97706;'}">
                    <div style="font-size: 24px; font-weight: bold;">${dnsOkItems.length}</div>
                    <div style="font-size: 11px; opacity: 0.9;">🟡 HTTP失败</div>
                </div>
                <div class="filter-card" data-filter="timeout" style="cursor: pointer; padding: 12px; border-radius: 8px; text-align: center; transition: all 0.2s; ${filter === 'timeout' ? 'background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); color: white; box-shadow: 0 4px 12px rgba(107, 114, 128, 0.4);' : 'background: #f3f4f6; color: #6b7280;'}">
                    <div style="font-size: 24px; font-weight: bold;">${timeoutItems.length}</div>
                    <div style="font-size: 11px; opacity: 0.9;">⏱️ 超时</div>
                </div>
                ${dnsFailedItems.length > 0 ? `
                <div class="filter-card" data-filter="dns_failed" style="cursor: pointer; padding: 12px; border-radius: 8px; text-align: center; transition: all 0.2s; ${filter === 'dns_failed' ? 'background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); color: white;' : 'background: #e5e7eb; color: #6b7280;'}">
                    <div style="font-size: 24px; font-weight: bold;">${dnsFailedItems.length}</div>
                    <div style="font-size: 11px; opacity: 0.9;">⚪ DNS失败</div>
                </div>
                ` : ''}
            </div>
            
            <!-- 当前筛选标题和操作 -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding: 10px 12px; background: #f9fafb; border-radius: 8px;">
                <div>
                    <span style="font-weight: 600; color: #374151;">${filterTitle}</span>
                    <span style="font-size: 12px; color: #9ca3af; margin-left: 8px;">${filteredItems.length} 项 ${cacheHint}</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-small btn-secondary" id="btnSelectAllCurrent" title="全选当前列表">
                        ☑️ 全选
                    </button>
                    <button class="btn btn-small btn-secondary" id="btnRecheckSelected" title="重新检测选中的链接" style="display: none;">
                        🔍 检测选中
                    </button>
                    <button class="btn btn-small btn-secondary" id="btnRefreshCheck" title="重新检测全部">
                        🔄 重新检测
                    </button>
                </div>
            </div>
            
            <!-- 提示信息 -->
            ${filter === 'all' ? `
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 12px; padding: 8px 12px; background: #fffbeb; border-radius: 6px; border-left: 3px solid #f59e0b;">
                💡 点击上方分类卡片筛选查看，🔴域名不存在 的链接可安全删除
            </div>
            ` : ''}
        </div>
        
        <!-- 列表项 -->
        <div id="invalidLinksList">
    `;
    
    if (filteredItems.length === 0) {
        html += `<div style="text-align: center; padding: 40px; color: #9ca3af;">此分类下没有链接</div>`;
    } else {
        for (const item of filteredItems) {
            const statusColor = item.dnsStatus === 'nxdomain' ? '#dc2626' : 
                               item.dnsStatus === 'ok' ? '#d97706' : '#6b7280';
            const statusBg = item.dnsStatus === 'nxdomain' ? '#fef2f2' : 
                            item.dnsStatus === 'ok' ? '#fffbeb' : '#f9fafb';
            html += `
                <div class="result-item" data-bookmark-id="${item.bookmark.id}" data-bookmark-url="${escapeHtml(item.bookmark.url)}" data-dns-status="${item.dnsStatus || ''}" style="border-left: 3px solid ${statusColor}; background: ${statusBg}; margin-bottom: 8px; border-radius: 8px;">
                    <input type="checkbox" class="result-checkbox" style="width: 18px; height: 18px;">
                    <div class="result-info" style="flex: 1; min-width: 0; cursor: pointer;" title="点击打开链接">
                        <div class="result-title bookmark-link" data-url="${escapeHtml(item.bookmark.url)}" style="font-weight: 500; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer;">${escapeHtml(item.bookmark.title)}</div>
                        <div class="result-url bookmark-link" data-url="${escapeHtml(item.bookmark.url)}" style="font-size: 12px; color: #6366f1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; text-decoration: underline;">${escapeHtml(item.bookmark.url)}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 12px; padding: 4px 8px; border-radius: 4px; background: ${statusColor}20; color: ${statusColor}; font-weight: 500;">${item.error || '无效'}</span>
                        <button class="btn-icon btn-open-link" data-url="${escapeHtml(item.bookmark.url)}" title="在新标签页打开" style="padding: 4px 8px; background: none; border: none; cursor: pointer; color: #6366f1; font-size: 14px;">🔗</button>
                        <button class="btn-icon btn-delete-single" data-id="${item.bookmark.id}" title="删除此书签" style="padding: 4px 8px; background: none; border: none; cursor: pointer; color: #dc2626; font-size: 14px;">🗑️</button>
                    </div>
                </div>
            `;
        }
    }
    
    html += '</div>';
    
    resultList.innerHTML = html;
    showResultFooterActions();
    bindResultCheckboxes();
    bindInvalidLinksActions(invalidLinks, filter);
}

// 绑定无效链接操作按钮
function bindInvalidLinksActions(invalidLinks, currentFilter) {
    // 绑定分类卡片点击事件
    document.querySelectorAll('.filter-card').forEach(card => {
        card.addEventListener('click', () => {
            const filter = card.dataset.filter;
            if (filter) {
                window.filterInvalidLinks(filter);
            }
        });
    });
    
    // 全选当前列表
    const btnSelectAllCurrent = document.getElementById('btnSelectAllCurrent');
    if (btnSelectAllCurrent) {
        btnSelectAllCurrent.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('.result-item .result-checkbox');
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            checkboxes.forEach(cb => {
                cb.checked = !allChecked;
            });
            updateResultSelection();
            // 更新按钮文字
            btnSelectAllCurrent.textContent = allChecked ? '☑️ 全选' : '☐ 取消全选';
        });
    }
    
    // 重新检测全部
    const btnRefreshCheck = document.getElementById('btnRefreshCheck');
    if (btnRefreshCheck) {
        btnRefreshCheck.addEventListener('click', async () => {
            await clearInvalidLinksCache();
            document.getElementById('resultModal').classList.remove('active');
            showCheckOptions();
        });
    }
    
    // 重新检测选中的链接
    const btnRecheckSelected = document.getElementById('btnRecheckSelected');
    if (btnRecheckSelected) {
        btnRecheckSelected.addEventListener('click', async () => {
            const selectedItems = document.querySelectorAll('.result-item .result-checkbox:checked');
            if (selectedItems.length === 0) {
                alert('请先选择要重新检测的链接');
                return;
            }
            
            // 收集选中的书签URL和ID
            const selectedBookmarks = [];
            selectedItems.forEach(checkbox => {
                const item = checkbox.closest('.result-item');
                const bookmarkId = item.dataset.bookmarkId;
                const url = item.dataset.bookmarkUrl;
                if (bookmarkId && url) {
                    selectedBookmarks.push({ id: bookmarkId, url, element: item });
                }
            });
            
            if (selectedBookmarks.length === 0) return;
            
            // 显示检测进度
            btnRecheckSelected.disabled = true;
            const total = selectedBookmarks.length;
            let validCount = 0;
            let checkedCount = 0;
            
            try {
                // 重新检测选中的链接（带进度回调）
                const recheckResults = await recheckSelectedLinks(selectedBookmarks, (progress) => {
                    // 更新按钮进度文字
                    btnRecheckSelected.textContent = `🔄 ${progress.current}/${progress.total}`;
                    
                    // 找到对应的列表项
                    const item = document.querySelector(`.result-item[data-bookmark-id="${progress.bookmarkId}"]`);
                    if (!item) return;
                    
                    if (progress.status === 'checking') {
                        // 正在检测，添加检测中状态
                        item.style.opacity = '0.7';
                        const statusSpan = item.querySelector('span[style*="border-radius: 4px"]');
                        if (statusSpan) {
                            statusSpan.textContent = '检测中...';
                            statusSpan.style.background = '#dbeafe';
                            statusSpan.style.color = '#3b82f6';
                        }
                    } else if (progress.status === 'done' && progress.result) {
                        checkedCount++;
                        const result = progress.result;
                        
                        if (result.isValid) {
                            // 链接有效，添加成功动画并移除
                            validCount++;
                            item.style.transition = 'all 0.3s ease';
                            item.style.background = '#d1fae5';
                            item.style.borderLeftColor = '#10b981';
                            
                            const statusSpan = item.querySelector('span[style*="border-radius: 4px"]');
                            if (statusSpan) {
                                statusSpan.textContent = '✓ 有效';
                                statusSpan.style.background = '#d1fae5';
                                statusSpan.style.color = '#059669';
                            }
                            
                            // 从缓存中移除
                            if (cachedInvalidLinks) {
                                const index = cachedInvalidLinks.findIndex(link => link.bookmark.id === result.bookmarkId);
                                if (index !== -1) {
                                    cachedInvalidLinks.splice(index, 1);
                                }
                            }
                            
                            // 延迟后移除DOM元素
                            setTimeout(() => {
                                item.style.opacity = '0';
                                item.style.transform = 'translateX(20px)';
                                setTimeout(() => {
                                    item.remove();
                                    // 更新统计
                                    updateInvalidLinksStats();
                                }, 300);
                            }, 500);
                        } else {
                            // 链接仍然无效，更新状态
                            item.style.opacity = '1';
                            
                            const statusColor = result.dnsStatus === 'nxdomain' ? '#dc2626' : 
                                               result.dnsStatus === 'ok' ? '#d97706' : '#6b7280';
                            const statusBg = result.dnsStatus === 'nxdomain' ? '#fef2f2' : 
                                            result.dnsStatus === 'ok' ? '#fffbeb' : '#f9fafb';
                            
                            item.style.background = statusBg;
                            item.style.borderLeftColor = statusColor;
                            
                            const statusSpan = item.querySelector('span[style*="border-radius: 4px"]');
                            if (statusSpan) {
                                statusSpan.textContent = result.error || '无效';
                                statusSpan.style.background = `${statusColor}20`;
                                statusSpan.style.color = statusColor;
                            }
                            
                            // 更新缓存中的错误信息
                            if (cachedInvalidLinks) {
                                const index = cachedInvalidLinks.findIndex(link => link.bookmark.id === result.bookmarkId);
                                if (index !== -1) {
                                    cachedInvalidLinks[index].error = result.error;
                                    cachedInvalidLinks[index].dnsStatus = result.dnsStatus;
                                }
                            }
                        }
                    }
                });
                
                // 保存缓存
                if (cachedInvalidLinks) {
                    saveInvalidLinksCache(cachedInvalidLinks);
                }
                
                // 显示完成提示
                if (validCount > 0) {
                    showToast(`检测完成！${validCount} 个链接现在有效`);
                } else {
                    showToast(`检测完成，${checkedCount} 个链接仍然无效`);
                }
                
                // 更新统计卡片
                setTimeout(() => {
                    updateInvalidLinksStats();
                }, 800);
                
            } catch (error) {
                alert('检测失败: ' + error.message);
            } finally {
                btnRecheckSelected.disabled = false;
                btnRecheckSelected.textContent = '🔍 检测选中';
            }
        });
    }
    
    // 链接点击打开
    document.querySelectorAll('.bookmark-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.stopPropagation();
            const url = link.dataset.url;
            if (url) {
                chrome.tabs.create({ url, active: false });
            }
        });
    });
    
    // 打开链接按钮
    document.querySelectorAll('.btn-open-link').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const url = btn.dataset.url;
            if (url) {
                chrome.tabs.create({ url, active: true });
            }
        });
    });
    
    // 单个删除按钮
    document.querySelectorAll('.btn-delete-single').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const bookmarkId = btn.dataset.id;
            const item = btn.closest('.result-item');
            const title = item.querySelector('.result-title')?.textContent || '此书签';
            
            if (!confirm(`确定要删除"${title}"吗？`)) return;
            
            try {
                // 添加删除动画
                item.style.transition = 'all 0.3s ease';
                item.style.opacity = '0';
                item.style.transform = 'translateX(20px)';
                
                await chrome.bookmarks.remove(bookmarkId);
                
                // 从缓存中移除
                if (cachedInvalidLinks) {
                    cachedInvalidLinks = cachedInvalidLinks.filter(link => link.bookmark.id !== bookmarkId);
                    saveInvalidLinksCache(cachedInvalidLinks);
                }
                
                // 延迟后移除DOM元素并更新统计
                setTimeout(() => {
                    item.remove();
                    // 更新统计数字
                    updateInvalidLinksStats();
                    // 刷新书签列表
                    loadBookmarks();
                }, 300);
                
            } catch (error) {
                item.style.opacity = '1';
                item.style.transform = 'translateX(0)';
                alert('删除失败: ' + error.message);
            }
        });
    });
}

// 更新无效链接统计数字
function updateInvalidLinksStats() {
    if (!cachedInvalidLinks) return;
    
    const invalidLinks = cachedInvalidLinks;
    const dnsNxdomainItems = invalidLinks.filter(item => item.dnsStatus === 'nxdomain');
    const dnsOkItems = invalidLinks.filter(item => item.dnsStatus === 'ok');
    const timeoutItems = invalidLinks.filter(item => item.error === '超时');
    const dnsFailedItems = invalidLinks.filter(item => item.dnsStatus === 'failed' || item.dnsStatus === 'error');
    
    // 如果所有链接都已删除
    if (invalidLinks.length === 0) {
        const resultList = document.getElementById('resultList');
        resultList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p>所有问题链接已清理完毕！</p></div>';
        hideResultFooterActions();
        return;
    }
    
    // 重新渲染整个界面以更新统计
    showInvalidLinksResult(invalidLinks, currentInvalidFilter);
}

// 筛选无效链接（全局函数供onclick调用）
window.filterInvalidLinks = function(filter) {
    if (cachedInvalidLinks) {
        showInvalidLinksResult(cachedInvalidLinks, filter);
    }
};

// 重新检测选中的链接（带进度回调）
async function recheckSelectedLinks(selectedBookmarks, onProgress) {
    const results = [];
    const total = selectedBookmarks.length;
    
    for (let i = 0; i < selectedBookmarks.length; i++) {
        const bookmark = selectedBookmarks[i];
        
        // 报告进度
        if (onProgress) {
            onProgress({
                current: i + 1,
                total,
                url: bookmark.url,
                bookmarkId: bookmark.id,
                status: 'checking'
            });
        }
        
        try {
            // 清除该URL的缓存
            urlCheckCache.delete(bookmark.url);
            
            // 重新检测
            const checkResult = await checkLinkWithDns({ url: bookmark.url });
            
            const result = {
                bookmarkId: bookmark.id,
                url: bookmark.url,
                isValid: checkResult.valid,
                error: checkResult.error,
                dnsStatus: checkResult.dnsStatus
            };
            
            results.push(result);
            
            // 报告单个结果
            if (onProgress) {
                onProgress({
                    current: i + 1,
                    total,
                    url: bookmark.url,
                    bookmarkId: bookmark.id,
                    status: 'done',
                    result
                });
            }
        } catch (error) {
            const result = {
                bookmarkId: bookmark.id,
                url: bookmark.url,
                isValid: false,
                error: error.message,
                dnsStatus: 'error'
            };
            
            results.push(result);
            
            if (onProgress) {
                onProgress({
                    current: i + 1,
                    total,
                    url: bookmark.url,
                    bookmarkId: bookmark.id,
                    status: 'done',
                    result
                });
            }
        }
    }
    
    return results;
}

function getDnsStatusBadge(status, message) {
    if (!status || status === 'skip') return '';
    const badges = {
        'ok': '🟢 DNS 解析成功（可能是网络问题或防火墙拦截）',
        'nxdomain': '🔴 域名不存在（网站已关闭）',
        'error': '⚠️ DNS 查询错误',
        'failed': '⚠️ DNS 查询失败'
    };
    return badges[status] || message || '';
}

// ==================== 使用分析 ====================
async function analyzeUsage() {
    const bookmarks = [];
    collectAllBookmarks(allBookmarks, bookmarks);
    
    if (bookmarks.length === 0) {
        alert('没有书签可分析');
        return;
    }
    
    const resultList = document.getElementById('resultList');
    document.getElementById('resultTitle').textContent = '书签使用分析';
    resultList.innerHTML = '<div class="loading">正在分析书签使用情况...</div>';
    document.getElementById('resultModal').classList.add('active');
    hideResultFooterActions();
    
    const usageData = await Promise.all(bookmarks.map(async (bookmark) => {
        try {
            const visits = await chrome.history.getVisits({ url: bookmark.url });
            const lastVisit = visits.length > 0 ? Math.max(...visits.map(v => v.visitTime)) : 0;
            const daysSinceVisit = lastVisit ? Math.floor((Date.now() - lastVisit) / (1000 * 60 * 60 * 24)) : -1;
            return { bookmark, visitCount: visits.length, lastVisit, daysSinceVisit };
        } catch {
            return { bookmark, visitCount: 0, lastVisit: 0, daysSinceVisit: -1 };
        }
    }));
    
    showUsageAnalysis(usageData);
}

function showUsageAnalysis(usageData) {
    const resultList = document.getElementById('resultList');
    const byFrequency = [...usageData].sort((a, b) => b.visitCount - a.visitCount);
    const byDustLevel = [...usageData].sort((a, b) => {
        if (a.daysSinceVisit === -1 && b.daysSinceVisit === -1) return 0;
        if (a.daysSinceVisit === -1) return -1;
        if (b.daysSinceVisit === -1) return 1;
        return b.daysSinceVisit - a.daysSinceVisit;
    });
    
    const neverVisited = usageData.filter(d => d.daysSinceVisit === -1).length;
    const dusty90 = usageData.filter(d => d.daysSinceVisit > 90).length;
    const totalVisits = usageData.reduce((sum, d) => sum + d.visitCount, 0);
    
    let html = `
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;">
            <div style="background: #f0f7ff; padding: 12px; border-radius: 8px; text-align: center;">
                <div style="font-size: 24px; font-weight: bold; color: #3b82f6;">${usageData.length}</div>
                <div style="font-size: 12px; color: #666;">总书签数</div>
            </div>
            <div style="background: #fef3c7; padding: 12px; border-radius: 8px; text-align: center;">
                <div style="font-size: 24px; font-weight: bold; color: #d97706;">${neverVisited}</div>
                <div style="font-size: 12px; color: #666;">从未访问</div>
            </div>
            <div style="background: #fee2e2; padding: 12px; border-radius: 8px; text-align: center;">
                <div style="font-size: 24px; font-weight: bold; color: #dc2626;">${dusty90}</div>
                <div style="font-size: 12px; color: #666;">超90天未访问</div>
            </div>
            <div style="background: #d1fae5; padding: 12px; border-radius: 8px; text-align: center;">
                <div style="font-size: 24px; font-weight: bold; color: #059669;">${totalVisits}</div>
                <div style="font-size: 12px; color: #666;">总访问次数</div>
            </div>
        </div>
        <div style="display: flex; gap: 12px; margin-bottom: 12px;">
            <button class="btn btn-secondary tab-btn active" data-tab="dusty">🕸️ 吃灰书签</button>
            <button class="btn btn-secondary tab-btn" data-tab="frequent">🔥 常用书签</button>
            <button class="btn btn-secondary tab-btn" data-tab="rare">❄️ 少用书签</button>
        </div>
        <div id="usageTabContent"></div>
    `;
    
    resultList.innerHTML = html;
    
    const tabBtns = resultList.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderUsageTab(btn.dataset.tab, byFrequency, byDustLevel);
        });
    });
    
    renderUsageTab('dusty', byFrequency, byDustLevel);
}


function renderUsageTab(tab, byFrequency, byDustLevel) {
    const container = document.getElementById('usageTabContent');
    let items = [];
    let emptyMsg = '';
    
    if (tab === 'dusty') {
        items = byDustLevel.filter(d => d.daysSinceVisit === -1 || d.daysSinceVisit > 30).slice(0, 50);
        emptyMsg = '没有吃灰的书签，都在用！';
    } else if (tab === 'frequent') {
        items = byFrequency.filter(d => d.visitCount > 0).slice(0, 50);
        emptyMsg = '没有访问记录';
    } else if (tab === 'rare') {
        items = byFrequency.filter(d => d.visitCount > 0 && d.visitCount <= 5).slice(0, 50);
        emptyMsg = '没有少用的书签';
    }
    
    if (items.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📭</div><p>${emptyMsg}</p></div>`;
        hideResultFooterActions();
        return;
    }
    
    let html = '';
    for (const item of items) {
        const dustLabel = getDustLabel(item.daysSinceVisit);
        const visitLabel = item.visitCount > 0 ? `${item.visitCount} 次访问` : '从未访问';
        
        html += `
            <div class="result-item" data-bookmark-id="${item.bookmark.id}">
                <input type="checkbox" class="result-checkbox">
                <div class="result-info">
                    <div class="result-title">${escapeHtml(item.bookmark.title)}</div>
                    <div class="result-url">${escapeHtml(item.bookmark.url)}</div>
                </div>
                <span class="result-status" style="background: ${dustLabel.bg}; color: ${dustLabel.color};">${dustLabel.text}</span>
                <span style="font-size: 12px; color: #666; min-width: 70px;">${visitLabel}</span>
            </div>
        `;
    }
    
    container.innerHTML = html;
    showResultFooterActions();
    bindResultCheckboxes();
}

function getDustLabel(days) {
    if (days === -1) return { text: '从未访问', bg: '#fef3c7', color: '#d97706' };
    if (days > 365) return { text: `${Math.floor(days / 365)}年+`, bg: '#fee2e2', color: '#dc2626' };
    if (days > 90) return { text: `${days}天`, bg: '#fee2e2', color: '#dc2626' };
    if (days > 30) return { text: `${days}天`, bg: '#fef3c7', color: '#d97706' };
    if (days > 7) return { text: `${days}天`, bg: '#e0f2fe', color: '#0284c7' };
    return { text: `${days}天`, bg: '#d1fae5', color: '#059669' };
}

// ==================== 结果弹窗批量操作 ====================
function showResultFooterActions() {
    document.getElementById('resultSelectAll').parentElement.style.display = 'flex';
    document.getElementById('resultSelectAll').checked = false;
    document.getElementById('resultSelectedCount').textContent = '';
    document.getElementById('btnDeleteSelectedResults').style.display = 'none';
}

function hideResultFooterActions() {
    document.getElementById('resultSelectAll').parentElement.style.display = 'none';
    document.getElementById('btnDeleteSelectedResults').style.display = 'none';
    document.getElementById('resultSelectedCount').textContent = '';
}

function bindResultCheckboxes() {
    const checkboxes = document.querySelectorAll('.result-checkbox');
    checkboxes.forEach(cb => {
        cb.addEventListener('change', updateResultSelection);
    });
}

function updateResultSelection() {
    const checkboxes = document.querySelectorAll('.result-checkbox');
    const checked = document.querySelectorAll('.result-checkbox:checked');
    const selectAll = document.getElementById('resultSelectAll');
    const countSpan = document.getElementById('resultSelectedCount');
    const deleteBtn = document.getElementById('btnDeleteSelectedResults');
    const recheckBtn = document.getElementById('btnRecheckSelected');
    
    selectAll.checked = checkboxes.length > 0 && checked.length === checkboxes.length;
    
    if (checked.length > 0) {
        countSpan.textContent = `已选 ${checked.length} 项`;
        deleteBtn.style.display = 'block';
        deleteBtn.textContent = `删除选中 (${checked.length})`;
        // 显示重新检测选中按钮
        if (recheckBtn) {
            recheckBtn.style.display = 'inline-block';
        }
    } else {
        countSpan.textContent = '';
        deleteBtn.style.display = 'none';
        // 隐藏重新检测选中按钮
        if (recheckBtn) {
            recheckBtn.style.display = 'none';
        }
    }
}

function toggleResultSelectAll(e) {
    const checkboxes = document.querySelectorAll('.result-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
    });
    updateResultSelection();
}

async function deleteSelectedResults() {
    const checked = document.querySelectorAll('.result-checkbox:checked');
    if (checked.length === 0) return;
    
    if (!confirm(`确定要删除选中的 ${checked.length} 个书签吗？`)) return;
    
    const ids = [];
    checked.forEach(cb => {
        const item = cb.closest('.result-item');
        if (item && item.dataset.bookmarkId) {
            ids.push(item.dataset.bookmarkId);
        }
    });
    
    try {
        // 批量删除
        for (const id of ids) {
            await chrome.bookmarks.remove(id);
        }
        
        // 从无效链接缓存中移除已删除的项
        if (cachedInvalidLinks) {
            cachedInvalidLinks = cachedInvalidLinks.filter(link => !ids.includes(link.bookmark.id));
            saveInvalidLinksCache(cachedInvalidLinks);
        }
        
        // 添加删除动画
        checked.forEach(cb => {
            const item = cb.closest('.result-item');
            if (item) {
                item.style.transition = 'all 0.3s ease';
                item.style.opacity = '0';
                item.style.transform = 'translateX(20px)';
            }
        });
        
        // 延迟后更新UI
        setTimeout(async () => {
            // 移除DOM元素
            checked.forEach(cb => {
                const item = cb.closest('.result-item');
                if (item) item.remove();
            });
            
            // 刷新书签列表
            await loadBookmarks();
            
            // 更新统计数字（如果是无效链接检测结果）
            if (cachedInvalidLinks !== null) {
                updateInvalidLinksStats();
            } else {
                updateResultSelection();
            }
        }, 300);
        
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

function closeResultModal() {
    document.getElementById('resultModal').classList.remove('active');
}

// ==================== 时间线筛选 ====================
function handleTimelineFilter(e) {
    const filter = e.target.value;
    
    if (!filter) {
        renderBookmarkList();
        return;
    }
    
    const now = Date.now();
    let startTime = 0;
    let label = '';
    
    switch (filter) {
        case 'today':
            startTime = new Date().setHours(0, 0, 0, 0);
            label = '今天添加';
            break;
        case 'week':
            startTime = now - 7 * 24 * 60 * 60 * 1000;
            label = '本周添加';
            break;
        case 'month':
            startTime = now - 30 * 24 * 60 * 60 * 1000;
            label = '本月添加';
            break;
        case 'year':
            startTime = now - 365 * 24 * 60 * 60 * 1000;
            label = '今年添加';
            break;
    }
    
    const allBookmarksList = [];
    collectAllBookmarks(allBookmarks, allBookmarksList);
    
    const results = allBookmarksList.filter(b => {
        return b.dateAdded && b.dateAdded >= startTime;
    }).sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
    
    const container = document.getElementById('bookmarkList');
    container.innerHTML = '';
    
    if (results.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📅</div><p>${label}没有新增书签</p></div>`;
        return;
    }
    
    document.getElementById('currentFolderName').textContent = `${label} (${results.length})`;
    
    for (const bookmark of results) {
        const item = createBookmarkItem(bookmark);
        container.appendChild(item);
    }
}

// ==================== 统计面板 ====================
async function showStatisticsPanel() {
    const allBookmarksList = [];
    collectAllBookmarks(allBookmarks, allBookmarksList);
    
    if (allBookmarksList.length === 0) {
        alert('没有书签数据');
        return;
    }
    
    const resultList = document.getElementById('resultList');
    document.getElementById('resultTitle').textContent = '📈 书签统计面板';
    resultList.innerHTML = '<div class="loading">正在分析数据...</div>';
    document.getElementById('resultModal').classList.add('active');
    hideResultFooterActions();
    
    // 统计数据
    const stats = await calculateStatistics(allBookmarksList);
    
    showStatisticsResult(stats);
}

async function calculateStatistics(bookmarks) {
    const now = Date.now();
    const today = new Date().setHours(0, 0, 0, 0);
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
    
    // 基础统计
    const total = bookmarks.length;
    const addedToday = bookmarks.filter(b => b.dateAdded >= today).length;
    const addedThisWeek = bookmarks.filter(b => b.dateAdded >= weekAgo).length;
    const addedThisMonth = bookmarks.filter(b => b.dateAdded >= monthAgo).length;
    
    // 域名统计
    const domainCount = {};
    bookmarks.forEach(b => {
        try {
            const domain = new URL(b.url).hostname.replace(/^www\./, '');
            domainCount[domain] = (domainCount[domain] || 0) + 1;
        } catch {}
    });
    
    const topDomains = Object.entries(domainCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    // 访问统计
    let totalVisits = 0;
    let visitedCount = 0;
    
    for (const bookmark of bookmarks.slice(0, 100)) { // 限制数量避免太慢
        const usage = await getBookmarkUsage(bookmark.url);
        totalVisits += usage;
        if (usage > 0) visitedCount++;
    }
    
    return {
        total,
        addedToday,
        addedThisWeek,
        addedThisMonth,
        topDomains,
        totalVisits,
        visitedCount,
        folderCount
    };
}

function showStatisticsResult(stats) {
    const resultList = document.getElementById('resultList');
    
    const visitRate = stats.total > 0 ? Math.round((stats.visitedCount / Math.min(stats.total, 100)) * 100) : 0;
    
    let html = `
        <div style="margin-bottom: 20px;">
            <h3 style="font-size: 16px; margin-bottom: 16px; color: #333;">📊 总体概况</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 16px; border-radius: 12px; color: white; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold;">${stats.total}</div>
                    <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">总书签数</div>
                </div>
                <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 16px; border-radius: 12px; color: white; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold;">${stats.folderCount}</div>
                    <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">文件夹数</div>
                </div>
                <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); padding: 16px; border-radius: 12px; color: white; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold;">${stats.totalVisits}</div>
                    <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">总访问次数</div>
                </div>
                <div style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); padding: 16px; border-radius: 12px; color: white; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold;">${visitRate}%</div>
                    <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">使用率</div>
                </div>
            </div>
        </div>
        
        <div style="margin-bottom: 20px;">
            <h3 style="font-size: 16px; margin-bottom: 16px; color: #333;">📅 新增趋势</h3>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
                <div style="background: #f0f7ff; padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 24px; font-weight: bold; color: #3b82f6;">${stats.addedToday}</div>
                    <div style="font-size: 12px; color: #666; margin-top: 4px;">今天新增</div>
                </div>
                <div style="background: #f0fdf4; padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 24px; font-weight: bold; color: #10b981;">${stats.addedThisWeek}</div>
                    <div style="font-size: 12px; color: #666; margin-top: 4px;">本周新增</div>
                </div>
                <div style="background: #fef3c7; padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 24px; font-weight: bold; color: #f59e0b;">${stats.addedThisMonth}</div>
                    <div style="font-size: 12px; color: #666; margin-top: 4px;">本月新增</div>
                </div>
            </div>
        </div>
        
        <div>
            <h3 style="font-size: 16px; margin-bottom: 16px; color: #333;">🌐 热门网站 TOP 10</h3>
            <div style="background: #f9fafb; padding: 12px; border-radius: 8px;">
    `;
    
    if (stats.topDomains.length === 0) {
        html += '<p style="text-align: center; color: #999; padding: 20px;">暂无数据</p>';
    } else {
        const maxCount = stats.topDomains[0][1];
        stats.topDomains.forEach(([domain, count], index) => {
            const percentage = (count / maxCount) * 100;
            html += `
                <div style="margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="font-size: 13px; color: #333;">${index + 1}. ${escapeHtml(domain)}</span>
                        <span style="font-size: 12px; color: #666; font-weight: bold;">${count} 个</span>
                    </div>
                    <div style="background: #e0e0e0; height: 6px; border-radius: 3px; overflow: hidden;">
                        <div style="width: ${percentage}%; height: 100%; background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); transition: width 0.3s;"></div>
                    </div>
                </div>
            `;
        });
    }
    
    html += `
            </div>
        </div>
    `;
    
    resultList.innerHTML = html;
}

// ==================== 工具函数 ====================
function getFaviconUrl(url) {
    try {
        const urlObj = new URL(url);
        // 直接从网站获取 favicon（最快最可靠）
        return `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`;
    } catch {
        return 'icons/icon16.png';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


// ==================== 批量移动 ====================
function showBatchMoveModal() {
    if (selectedBookmarks.size === 0) {
        alert('请先选择要移动的书签');
        return;
    }
    
    const select = document.getElementById('batchMoveTarget');
    select.innerHTML = '';
    populateFolderSelectForMove(allBookmarks, select, 0);
    
    document.getElementById('batchMoveCount').textContent = `将移动 ${selectedBookmarks.size} 个书签`;
    document.getElementById('batchMoveModal').classList.add('active');
}

function populateFolderSelectForMove(nodes, select, level) {
    for (const node of nodes) {
        if (node.children) {
            const indent = '　'.repeat(level);
            const option = document.createElement('option');
            option.value = node.id;
            option.textContent = indent + '📁 ' + (node.title || '未命名');
            select.appendChild(option);
            populateFolderSelectForMove(node.children, select, level + 1);
        }
    }
}

function closeBatchMoveModal() {
    document.getElementById('batchMoveModal').classList.remove('active');
}

async function confirmBatchMove() {
    const targetId = document.getElementById('batchMoveTarget').value;
    if (!targetId) {
        alert('请选择目标文件夹');
        return;
    }
    
    try {
        for (const id of selectedBookmarks) {
            await chrome.bookmarks.move(id, { parentId: targetId });
        }
        
        closeBatchMoveModal();
        selectedBookmarks.clear();
        await loadBookmarks();
        alert(`成功移动 ${selectedBookmarks.size} 个书签`);
    } catch (error) {
        alert('移动失败: ' + error.message);
    }
}

// ==================== 批量重命名 ====================
function showBatchRenameModal() {
    if (selectedBookmarks.size === 0) {
        alert('请先选择要重命名的书签');
        return;
    }
    
    document.getElementById('renameRule').value = 'prefix';
    document.getElementById('renameInput1').value = '';
    document.getElementById('renameInput2').value = '';
    updateRenameUI();
    
    document.getElementById('batchRenameCount').textContent = `将重命名 ${selectedBookmarks.size} 个书签`;
    document.getElementById('batchRenameModal').classList.add('active');
}

function updateRenameUI() {
    const rule = document.getElementById('renameRule').value;
    const label1 = document.getElementById('renameInput1Label');
    const group2 = document.getElementById('renameInput2Group');
    
    switch (rule) {
        case 'prefix':
            label1.textContent = '前缀内容';
            group2.style.display = 'none';
            break;
        case 'suffix':
            label1.textContent = '后缀内容';
            group2.style.display = 'none';
            break;
        case 'replace':
            label1.textContent = '查找内容';
            group2.style.display = 'block';
            break;
        case 'remove':
            label1.textContent = '要移除的文字';
            group2.style.display = 'none';
            break;
    }
}

function closeBatchRenameModal() {
    document.getElementById('batchRenameModal').classList.remove('active');
}

async function confirmBatchRename() {
    const rule = document.getElementById('renameRule').value;
    const input1 = document.getElementById('renameInput1').value;
    const input2 = document.getElementById('renameInput2').value;
    
    if (!input1) {
        alert('请输入内容');
        return;
    }
    
    try {
        let count = 0;
        for (const id of selectedBookmarks) {
            const [bookmark] = await chrome.bookmarks.get(id);
            if (!bookmark || !bookmark.title) continue;
            
            let newTitle = bookmark.title;
            
            switch (rule) {
                case 'prefix':
                    newTitle = input1 + bookmark.title;
                    break;
                case 'suffix':
                    newTitle = bookmark.title + input1;
                    break;
                case 'replace':
                    newTitle = bookmark.title.split(input1).join(input2);
                    break;
                case 'remove':
                    newTitle = bookmark.title.split(input1).join('');
                    break;
            }
            
            if (newTitle !== bookmark.title) {
                await chrome.bookmarks.update(id, { title: newTitle });
                count++;
            }
        }
        
        closeBatchRenameModal();
        selectedBookmarks.clear();
        await loadBookmarks();
        alert(`成功重命名 ${count} 个书签`);
    } catch (error) {
        alert('重命名失败: ' + error.message);
    }
}


// ==================== 文件夹合并 ====================
async function showMergeFoldersModal() {
    // 收集所有文件夹
    const folders = [];
    collectAllFolders(allBookmarks, folders);
    
    // 过滤掉根节点
    const validFolders = folders.filter(f => f.id && f.id !== '0' && f.title);
    
    if (validFolders.length < 2) {
        alert('至少需要2个文件夹才能进行合并');
        return;
    }
    
    const resultList = document.getElementById('resultList');
    document.getElementById('resultTitle').textContent = '📂 合并文件夹';
    
    // 构建HTML
    const htmlParts = [];
    
    htmlParts.push('<div style="margin-bottom:16px;"><p style="color:#666;margin-bottom:12px;">选择要合并的文件夹，所有选中文件夹的内容将合并到目标文件夹中。</p></div>');
    
    htmlParts.push('<div class="form-group"><label style="font-weight:600;margin-bottom:8px;display:block;">目标文件夹（保留）</label>');
    htmlParts.push('<select id="mergeTargetFolder" style="width:100%;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;">');
    htmlParts.push('<option value="">-- 选择目标文件夹 --</option>');
    
    for (const folder of validFolders) {
        const path = await getBookmarkPath(folder.id);
        htmlParts.push('<option value="' + folder.id + '">📁 ' + escapeHtml(folder.title) + ' (' + escapeHtml(path) + ')</option>');
    }
    
    htmlParts.push('</select></div>');
    
    htmlParts.push('<div class="form-group" style="margin-top:16px;"><label style="font-weight:600;margin-bottom:8px;display:block;">选择要合并的文件夹（将被清空或删除）</label>');
    htmlParts.push('<div id="mergeFolderList" style="max-height:300px;overflow-y:auto;border:1px solid #e0e0e0;border-radius:8px;padding:8px;">');
    
    for (const folder of validFolders) {
        const childCount = folder.children ? folder.children.length : 0;
        htmlParts.push('<div class="merge-folder-item" data-folder-id="' + folder.id + '" style="display:flex;align-items:center;padding:10px 12px;border-radius:6px;margin-bottom:4px;cursor:pointer;background:#f9fafb;border:1px solid transparent;">');
        htmlParts.push('<input type="checkbox" class="merge-folder-checkbox" value="' + folder.id + '" style="width:18px;height:18px;margin-right:12px;cursor:pointer;flex-shrink:0;">');
        htmlParts.push('<span style="flex:1;font-size:14px;">📁 ' + escapeHtml(folder.title) + '</span>');
        htmlParts.push('<span style="font-size:12px;color:#999;margin-left:8px;white-space:nowrap;">' + childCount + ' 项</span>');
        htmlParts.push('</div>');
    }
    
    htmlParts.push('</div></div>');
    
    htmlParts.push('<div style="margin-top:16px;display:flex;gap:12px;align-items:center;">');
    htmlParts.push('<button class="btn btn-primary" id="btnConfirmMerge">确认合并</button>');
    htmlParts.push('<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">');
    htmlParts.push('<input type="checkbox" id="deleteAfterMerge" checked>');
    htmlParts.push('<span>合并后删除源文件夹</span>');
    htmlParts.push('</label></div>');
    
    resultList.innerHTML = htmlParts.join('');
    document.getElementById('resultModal').classList.add('active');
    hideResultFooterActions();
    
    // 绑定事件
    document.getElementById('btnConfirmMerge').addEventListener('click', confirmMergeFolders);
    
    // 点击行选中复选框
    document.querySelectorAll('.merge-folder-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') {
                const checkbox = item.querySelector('.merge-folder-checkbox');
                checkbox.checked = !checkbox.checked;
                updateMergeItemStyle(item, checkbox.checked);
            }
        });
        
        const checkbox = item.querySelector('.merge-folder-checkbox');
        checkbox.addEventListener('change', () => {
            updateMergeItemStyle(item, checkbox.checked);
        });
    });
    
    // 目标文件夹改变时，禁用对应的复选框
    document.getElementById('mergeTargetFolder').addEventListener('change', (e) => {
        const targetId = e.target.value;
        document.querySelectorAll('.merge-folder-checkbox').forEach(cb => {
            const item = cb.closest('.merge-folder-item');
            cb.disabled = cb.value === targetId;
            if (cb.value === targetId) {
                cb.checked = false;
                item.style.opacity = '0.5';
            } else {
                item.style.opacity = '1';
            }
            updateMergeItemStyle(item, cb.checked);
        });
    });
}

function updateMergeItemStyle(item, checked) {
    if (checked) {
        item.style.background = '#eff6ff';
        item.style.borderColor = '#3b82f6';
    } else {
        item.style.background = '#f9fafb';
        item.style.borderColor = 'transparent';
    }
}

async function confirmMergeFolders() {
    const targetId = document.getElementById('mergeTargetFolder').value;
    const deleteAfter = document.getElementById('deleteAfterMerge').checked;
    
    if (!targetId) {
        alert('请选择目标文件夹');
        return;
    }
    
    const selectedFolders = [];
    document.querySelectorAll('.merge-folder-checkbox:checked').forEach(cb => {
        if (cb.value !== targetId) {
            selectedFolders.push(cb.value);
        }
    });
    
    if (selectedFolders.length === 0) {
        alert('请选择要合并的源文件夹');
        return;
    }
    
    if (!confirm(`确定要将 ${selectedFolders.length} 个文件夹的内容合并到目标文件夹吗？${deleteAfter ? '\n\n合并后源文件夹将被删除！' : ''}`)) {
        return;
    }
    
    try {
        let movedCount = 0;
        
        for (const folderId of selectedFolders) {
            // 获取文件夹内容
            const children = await chrome.bookmarks.getChildren(folderId);
            
            // 移动所有子项到目标文件夹
            for (const child of children) {
                await chrome.bookmarks.move(child.id, { parentId: targetId });
                movedCount++;
            }
            
            // 删除空文件夹
            if (deleteAfter) {
                await chrome.bookmarks.remove(folderId);
            }
        }
        
        closeResultModal();
        await loadBookmarks();
        
        const deleteMsg = deleteAfter ? `，已删除 ${selectedFolders.length} 个源文件夹` : '';
        alert(`合并完成！共移动 ${movedCount} 个项目${deleteMsg}`);
        
    } catch (error) {
        alert('合并失败: ' + error.message);
    }
}


// ==================== 空文件夹检测 ====================
async function findEmptyFolders() {
    const resultList = document.getElementById('resultList');
    document.getElementById('resultTitle').textContent = '📭 空文件夹检测';
    resultList.innerHTML = '<div class="loading">正在检测空文件夹...</div>';
    document.getElementById('resultModal').classList.add('active');
    hideResultFooterActions();
    
    // 收集所有文件夹
    const allFolders = [];
    collectAllFolders(allBookmarks, allFolders);
    
    // 检测空文件夹（没有任何子项的文件夹）
    const emptyFolders = [];
    
    for (const folder of allFolders) {
        // 跳过根节点
        if (!folder.id || folder.id === '0') continue;
        
        try {
            const children = await chrome.bookmarks.getChildren(folder.id);
            if (children.length === 0) {
                const path = await getBookmarkPath(folder.id);
                emptyFolders.push({
                    folder: folder,
                    path: path
                });
            }
        } catch (e) {
            // 文件夹可能已被删除，跳过
        }
    }
    
    showEmptyFoldersResult(emptyFolders);
}

function showEmptyFoldersResult(emptyFolders) {
    const resultList = document.getElementById('resultList');
    
    if (emptyFolders.length === 0) {
        resultList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">✅</div>
                <p>没有发现空文件夹</p>
            </div>
        `;
        hideResultFooterActions();
        return;
    }
    
    let html = `
        <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div>
                    <span style="font-size: 16px; font-weight: 600; color: #374151;">发现 ${emptyFolders.length} 个空文件夹</span>
                    <p style="font-size: 12px; color: #9ca3af; margin-top: 4px;">这些文件夹中没有任何书签或子文件夹</p>
                </div>
                <button class="btn btn-danger btn-small" id="btnDeleteAllEmpty">
                    🗑️ 删除全部 (${emptyFolders.length})
                </button>
            </div>
        </div>
    `;
    
    for (const item of emptyFolders) {
        html += `
            <div class="result-item" data-folder-id="${item.folder.id}" style="border-left: 3px solid #9ca3af; background: #f9fafb; margin-bottom: 8px; border-radius: 8px;">
                <input type="checkbox" class="result-checkbox" style="width: 18px; height: 18px;">
                <div class="result-info" style="flex: 1; min-width: 0;">
                    <div class="result-title" style="font-weight: 500; color: #374151;">
                        📁 ${escapeHtml(item.folder.title || '未命名')}
                    </div>
                    <div class="result-url" style="font-size: 12px; color: #9ca3af;">
                        📍 ${escapeHtml(item.path)}
                    </div>
                </div>
                <button class="btn-icon btn-delete-empty" data-id="${item.folder.id}" title="删除此文件夹" style="padding: 4px 8px; background: none; border: none; cursor: pointer; color: #dc2626; font-size: 14px;">
                    🗑️
                </button>
            </div>
        `;
    }
    
    resultList.innerHTML = html;
    showResultFooterActions();
    bindResultCheckboxes();
    bindEmptyFolderActions(emptyFolders);
}

function bindEmptyFolderActions(emptyFolders) {
    // 删除全部按钮
    const btnDeleteAll = document.getElementById('btnDeleteAllEmpty');
    if (btnDeleteAll) {
        btnDeleteAll.onclick = async () => {
            if (!confirm(`确定要删除全部 ${emptyFolders.length} 个空文件夹吗？`)) return;
            
            btnDeleteAll.disabled = true;
            btnDeleteAll.textContent = '删除中...';
            
            let deletedCount = 0;
            for (const item of emptyFolders) {
                try {
                    await chrome.bookmarks.remove(item.folder.id);
                    deletedCount++;
                } catch (e) {
                    // 可能已被删除，跳过
                }
            }
            
            await loadBookmarks();
            closeResultModal();
            alert(`已删除 ${deletedCount} 个空文件夹`);
        };
    }
    
    // 单个删除按钮
    document.querySelectorAll('.btn-delete-empty').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const folderId = btn.dataset.id;
            const item = btn.closest('.result-item');
            const title = item.querySelector('.result-title')?.textContent?.trim() || '此文件夹';
            
            if (!confirm(`确定要删除"${title}"吗？`)) return;
            
            try {
                // 添加删除动画
                item.style.transition = 'all 0.3s ease';
                item.style.opacity = '0';
                item.style.transform = 'translateX(20px)';
                
                await chrome.bookmarks.remove(folderId);
                
                // 从列表中移除
                emptyFolders = emptyFolders.filter(f => f.folder.id !== folderId);
                
                setTimeout(() => {
                    item.remove();
                    
                    // 更新统计
                    const remaining = document.querySelectorAll('.result-item').length;
                    if (remaining === 0) {
                        showEmptyFoldersResult([]);
                    } else {
                        // 更新删除全部按钮
                        const btnDeleteAll = document.getElementById('btnDeleteAllEmpty');
                        if (btnDeleteAll) {
                            btnDeleteAll.textContent = `🗑️ 删除全部 (${remaining})`;
                        }
                    }
                    
                    loadBookmarks();
                }, 300);
                
            } catch (error) {
                item.style.opacity = '1';
                item.style.transform = 'translateX(0)';
                alert('删除失败: ' + error.message);
            }
        };
    });
}

// ==================== 自动排序书签栏 ====================
function loadAutoSortSetting() {
    chrome.storage.local.get(['autoSortEnabled'], (result) => {
        const enabled = result.autoSortEnabled || false;
        document.getElementById('autoSortEnabled').checked = enabled;
        if (enabled) {
            startAutoSort();
        }
    });
}

function toggleAutoSort(enabled) {
    chrome.storage.local.set({ autoSortEnabled: enabled });
    
    if (enabled) {
        startAutoSort();
        // 立即执行一次
        autoSortBookmarkBar();
    } else {
        stopAutoSort();
    }
}

function startAutoSort() {
    if (autoSortInterval) return;
    
    // 每15分钟执行一次
    autoSortInterval = setInterval(autoSortBookmarkBar, 15 * 60 * 1000);
}

function stopAutoSort() {
    if (autoSortInterval) {
        clearInterval(autoSortInterval);
        autoSortInterval = null;
    }
}

// 长期未使用阈值（365天）
const UNUSED_DAYS_THRESHOLD = 365;

async function autoSortBookmarkBar() {
    try {
        // 1. 对书签栏根目录排序
        await sortFolderByUsage('1');
        
        // 2. 对所有子文件夹排序
        await sortAllFolders();
        
        // 3. 同步常用和最近使用文件夹
        await syncFavoritesFolder();
        await syncRecentFolder();
        
        // 保存使用数据
        await saveUsageData();
        
        // 刷新书签数据
        const tree = await chrome.bookmarks.getTree();
        allBookmarks = tree;
    } catch (error) {
        console.error('自动排序失败:', error);
    }
}

// 对指定文件夹内的书签按使用频率排序
async function sortFolderByUsage(folderId) {
    try {
        const children = await chrome.bookmarks.getChildren(folderId);
        const bookmarks = children.filter(c => c.url && !isSeparatorBookmark(c.url));
        
        if (bookmarks.length < 2) return;
        
        // 获取使用频率
        const withUsage = await Promise.all(bookmarks.map(async (b) => {
            const usage = await getBookmarkUsage(b.url);
            return { bookmark: b, usage, originalIndex: b.index };
        }));
        
        // 按使用频率排序
        withUsage.sort((a, b) => b.usage - a.usage);
        
        // 计算需要移动的书签
        const moves = [];
        for (let i = 0; i < withUsage.length; i++) {
            const item = withUsage[i];
            if (item.originalIndex !== i && item.usage > 0) {
                moves.push({ id: item.bookmark.id, targetIndex: i });
            }
        }
        
        if (moves.length === 0) return;
        
        // 执行移动
        moves.sort((a, b) => b.targetIndex - a.targetIndex);
        for (const move of moves) {
            try {
                await chrome.bookmarks.move(move.id, { parentId: folderId, index: move.targetIndex });
            } catch (e) {}
        }
    } catch (e) {
        console.error(`排序文件夹 ${folderId} 失败:`, e);
    }
}

// 对所有文件夹排序
async function sortAllFolders() {
    const folders = [];
    collectAllFolders(allBookmarks, folders);
    
    for (const folder of folders) {
        if (folder.id && folder.id !== '0') {
            await sortFolderByUsage(folder.id);
        }
    }
}

function collectAllFolders(nodes, folders) {
    for (const node of nodes) {
        if (node.children) {
            folders.push(node);
            collectAllFolders(node.children, folders);
        }
    }
}

// ==================== 检测长期未使用书签 ====================
async function findUnusedBookmarks() {
    const allBookmarksList = [];
    collectAllBookmarks(allBookmarks, allBookmarksList);
    
    if (allBookmarksList.length === 0) {
        alert('没有书签可检测');
        return;
    }
    
    const resultList = document.getElementById('resultList');
    document.getElementById('resultTitle').textContent = '长期未使用书签';
    resultList.innerHTML = '<div class="loading">正在检测长期未使用的书签...</div>';
    document.getElementById('resultModal').classList.add('active');
    hideResultFooterActions();
    
    const oneYearAgo = Date.now() - UNUSED_DAYS_THRESHOLD * 24 * 60 * 60 * 1000;
    const unusedBookmarks = [];
    
    // 检查每个书签的最后访问时间
    for (const bookmark of allBookmarksList) {
        // 跳过已经在"长期未使用"文件夹中的书签
        if (await isInUnusedFolder(bookmark.id)) continue;
        // 跳过快捷方式文件夹中的书签
        if (isInShortcutFolder(bookmark)) continue;
        
        try {
            const visits = await chrome.history.getVisits({ url: bookmark.url });
            const lastVisit = visits.length > 0 ? Math.max(...visits.map(v => v.visitTime)) : 0;
            const daysSinceVisit = lastVisit ? Math.floor((Date.now() - lastVisit) / (1000 * 60 * 60 * 24)) : -1;
            
            // 从未访问过，或者最后访问时间超过一年
            if (lastVisit === 0 || lastVisit < oneYearAgo) {
                const path = await getBookmarkPath(bookmark.id);
                unusedBookmarks.push({ bookmark, lastVisit, daysSinceVisit, path });
            }
        } catch {
            const path = await getBookmarkPath(bookmark.id);
            unusedBookmarks.push({ bookmark, lastVisit: 0, daysSinceVisit: -1, path });
        }
    }
    
    showUnusedBookmarksResult(unusedBookmarks);
}

function showUnusedBookmarksResult(unusedBookmarks) {
    const resultList = document.getElementById('resultList');
    
    if (unusedBookmarks.length === 0) {
        resultList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p>没有发现长期未使用的书签</p></div>';
        hideResultFooterActions();
        return;
    }
    
    // 按未使用时间排序（从未访问的排在前面）
    unusedBookmarks.sort((a, b) => {
        if (a.daysSinceVisit === -1 && b.daysSinceVisit === -1) return 0;
        if (a.daysSinceVisit === -1) return -1;
        if (b.daysSinceVisit === -1) return 1;
        return b.daysSinceVisit - a.daysSinceVisit;
    });
    
    const neverVisited = unusedBookmarks.filter(d => d.daysSinceVisit === -1).length;
    const overYear = unusedBookmarks.filter(d => d.daysSinceVisit >= 365).length;
    
    let html = `
        <div style="margin-bottom: 16px;">
            <div style="color: #666; margin-bottom: 8px;">发现 ${unusedBookmarks.length} 个长期未使用的书签（超过${UNUSED_DAYS_THRESHOLD}天未访问）</div>
            <div style="display: flex; gap: 8px; font-size: 12px; flex-wrap: wrap; margin-bottom: 12px;">
                ${neverVisited > 0 ? `<span style="background: #fef3c7; color: #d97706; padding: 4px 8px; border-radius: 4px;">从未访问: ${neverVisited}</span>` : ''}
                ${overYear > 0 ? `<span style="background: #fee2e2; color: #dc2626; padding: 4px 8px; border-radius: 4px;">超过1年: ${overYear}</span>` : ''}
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
                <button class="btn btn-small btn-primary" id="btnMoveSelectedUnused">📦 移动选中到"长期未使用"文件夹</button>
                <span style="font-size: 12px; color: #999;">选择要整理的书签，点击移动</span>
            </div>
        </div>
    `;
    
    for (const item of unusedBookmarks) {
        const dustLabel = getDustLabel(item.daysSinceVisit);
        
        html += `
            <div class="result-item" data-bookmark-id="${item.bookmark.id}">
                <input type="checkbox" class="result-checkbox">
                <div class="result-info">
                    <div class="result-title">${escapeHtml(item.bookmark.title)}</div>
                    <div class="result-url">${escapeHtml(item.bookmark.url)}</div>
                    <div style="font-size: 11px; color: #999; margin-top: 2px;">📁 ${escapeHtml(item.path)}</div>
                </div>
                <span class="result-status" style="background: ${dustLabel.bg}; color: ${dustLabel.color};">${dustLabel.text}</span>
            </div>
        `;
    }
    
    resultList.innerHTML = html;
    showResultFooterActions();
    bindResultCheckboxes();
    
    // 绑定移动按钮
    document.getElementById('btnMoveSelectedUnused').addEventListener('click', moveSelectedUnusedBookmarks);
}

async function moveSelectedUnusedBookmarks() {
    const checked = document.querySelectorAll('.result-checkbox:checked');
    if (checked.length === 0) {
        alert('请先选择要移动的书签');
        return;
    }
    
    if (!confirm(`确定要将选中的 ${checked.length} 个书签移动到"长期未使用"文件夹吗？`)) return;
    
    // 获取或创建"长期未使用"文件夹
    const unusedFolder = await findOrCreateUnusedFolder();
    if (!unusedFolder) {
        alert('创建文件夹失败');
        return;
    }
    
    const ids = [];
    checked.forEach(cb => {
        const item = cb.closest('.result-item');
        if (item && item.dataset.bookmarkId) {
            ids.push(item.dataset.bookmarkId);
        }
    });
    
    try {
        let movedCount = 0;
        for (const id of ids) {
            try {
                await chrome.bookmarks.move(id, { parentId: unusedFolder.id });
                movedCount++;
            } catch (e) {
                console.error('移动书签失败:', e);
            }
        }
        
        // 移除已移动的项
        checked.forEach(cb => {
            const item = cb.closest('.result-item');
            if (item) {
                item.style.transition = 'opacity 0.3s';
                item.style.opacity = '0';
                setTimeout(() => item.remove(), 300);
            }
        });
        
        await loadBookmarks();
        updateResultSelection();
        
        alert(`成功移动 ${movedCount} 个书签到"📦 长期未使用"文件夹`);
    } catch (error) {
        alert('移动失败: ' + error.message);
    }
}

// 检查书签是否已在"长期未使用"文件夹中
async function isInUnusedFolder(bookmarkId) {
    try {
        const [bookmark] = await chrome.bookmarks.get(bookmarkId);
        if (!bookmark) return false;
        
        // 向上查找父文件夹
        let parentId = bookmark.parentId;
        while (parentId && parentId !== '0') {
            const [parent] = await chrome.bookmarks.get(parentId);
            if (!parent) break;
            if (parent.title === UNUSED_FOLDER_NAME) return true;
            parentId = parent.parentId;
        }
        
        return false;
    } catch {
        return false;
    }
}

// 查找或创建"长期未使用"文件夹
async function findOrCreateUnusedFolder() {
    try {
        // 在"其他书签"中查找 (id = '2')
        const children = await chrome.bookmarks.getChildren('2');
        let folder = children.find(c => c.title === UNUSED_FOLDER_NAME && !c.url);
        
        if (!folder) {
            folder = await chrome.bookmarks.create({
                parentId: '2',
                title: UNUSED_FOLDER_NAME
            });
        }
        
        return folder;
    } catch (e) {
        console.error('创建长期未使用文件夹失败:', e);
        return null;
    }
}


// ==================== 同步常用文件夹 ====================
async function syncFavoritesFolder() {
    try {
        // 获取或创建常用文件夹
        const folder = await findOrCreateSpecialFolder(FAVORITES_FOLDER_NAME, '1', 0);
        if (!folder) return;
        
        // 获取所有书签的使用频率
        const allBookmarksList = [];
        collectAllBookmarks(allBookmarks, allBookmarksList);
        
        // 排除特殊文件夹中的书签
        const normalBookmarks = allBookmarksList.filter(b => !isInShortcutFolder(b));
        
        const withUsage = await Promise.all(normalBookmarks.map(async (b) => {
            const usage = await getBookmarkUsage(b.url);
            return { bookmark: b, usage };
        }));
        
        // 筛选高频书签（访问次数 >= 10）
        const frequentBookmarks = withUsage
            .filter(item => item.usage >= 10)
            .sort((a, b) => b.usage - a.usage)
            .slice(0, 20)
            .map(item => item.bookmark);
        
        // 获取当前文件夹中的书签URL
        const currentChildren = await chrome.bookmarks.getChildren(folder.id);
        const currentUrls = new Set(currentChildren.filter(c => c.url).map(c => c.url));
        const targetUrls = new Set(frequentBookmarks.map(b => b.url));
        
        // 删除不再高频的书签
        for (const child of currentChildren) {
            if (child.url && !targetUrls.has(child.url)) {
                try { await chrome.bookmarks.remove(child.id); } catch (e) {}
            }
        }
        
        // 添加新的高频书签
        for (const bookmark of frequentBookmarks) {
            if (!currentUrls.has(bookmark.url)) {
                try {
                    await chrome.bookmarks.create({
                        parentId: folder.id,
                        title: bookmark.title,
                        url: bookmark.url
                    });
                } catch (e) {}
            }
        }
        
    } catch (e) {
        console.error('同步常用文件夹失败:', e);
    }
}

// ==================== 同步最近使用文件夹 ====================
async function syncRecentFolder() {
    try {
        // 获取或创建最近使用文件夹
        const folder = await findOrCreateSpecialFolder(RECENT_FOLDER_NAME, '1', 1);
        if (!folder) return;
        
        // 获取所有书签
        const allBookmarksList = [];
        collectAllBookmarks(allBookmarks, allBookmarksList);
        
        // 排除特殊文件夹中的书签
        const normalBookmarks = allBookmarksList.filter(b => !isInShortcutFolder(b));
        
        // 获取最近访问的书签
        const withLastVisit = await Promise.all(normalBookmarks.map(async (b) => {
            try {
                const visits = await chrome.history.getVisits({ url: b.url });
                const lastVisit = visits.length > 0 ? Math.max(...visits.map(v => v.visitTime)) : 0;
                return { bookmark: b, lastVisit };
            } catch {
                return { bookmark: b, lastVisit: 0 };
            }
        }));
        
        // 筛选7天内访问过的书签
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const recentBookmarks = withLastVisit
            .filter(item => item.lastVisit > sevenDaysAgo)
            .sort((a, b) => b.lastVisit - a.lastVisit)
            .slice(0, 15)
            .map(item => item.bookmark);
        
        // 获取当前文件夹中的书签URL
        const currentChildren = await chrome.bookmarks.getChildren(folder.id);
        const currentUrls = new Set(currentChildren.filter(c => c.url).map(c => c.url));
        const targetUrls = new Set(recentBookmarks.map(b => b.url));
        
        // 删除不再是最近使用的书签
        for (const child of currentChildren) {
            if (child.url && !targetUrls.has(child.url)) {
                try { await chrome.bookmarks.remove(child.id); } catch (e) {}
            }
        }
        
        // 添加新的最近使用书签
        for (const bookmark of recentBookmarks) {
            if (!currentUrls.has(bookmark.url)) {
                try {
                    await chrome.bookmarks.create({
                        parentId: folder.id,
                        title: bookmark.title,
                        url: bookmark.url
                    });
                } catch (e) {}
            }
        }
        
    } catch (e) {
        console.error('同步最近使用文件夹失败:', e);
    }
}

// 查找或创建特殊文件夹
async function findOrCreateSpecialFolder(name, parentId, index) {
    try {
        const children = await chrome.bookmarks.getChildren(parentId);
        let folder = children.find(c => c.title === name && !c.url);
        
        if (!folder) {
            folder = await chrome.bookmarks.create({
                parentId: parentId,
                title: name,
                index: index
            });
        }
        
        return folder;
    } catch (e) {
        console.error(`创建${name}文件夹失败:`, e);
        return null;
    }
}

// 检查书签是否在快捷方式文件夹中
function isInShortcutFolder(bookmark) {
    // 通过 parentId 向上查找
    return isInShortcutFolderById(bookmark.parentId);
}

function isInShortcutFolderById(folderId) {
    if (!folderId || folderId === '0') return false;
    
    // 在 allBookmarks 中查找这个文件夹
    const folder = findFolderById(allBookmarks, folderId);
    if (!folder) return false;
    
    // 检查文件夹名称
    if (SHORTCUT_FOLDER_NAMES.includes(folder.title)) return true;
    
    // 递归检查父文件夹
    return isInShortcutFolderById(folder.parentId);
}

// 检查 targetId 是否是 ancestorId 的子孙节点
async function isDescendant(targetId, ancestorId) {
    if (!targetId || !ancestorId) return false;
    
    try {
        let currentId = targetId;
        
        // 向上遍历父节点
        while (currentId && currentId !== '0') {
            const [node] = await chrome.bookmarks.get(currentId);
            if (!node) break;
            
            // 如果找到了祖先节点，说明是子孙关系
            if (node.parentId === ancestorId) {
                return true;
            }
            
            currentId = node.parentId;
        }
        
        return false;
    } catch (e) {
        return false;
    }
}

// ==================== 添加到导航页功能 ====================
let navMenus = [];
let navServerUrl = '';
let pendingNavBookmarks = [];
let newMenuType = 'menu'; // 'menu' 或 'submenu'
let lastSelectedMenuId = ''; // 记住上次选择的菜单
let lastSelectedSubMenuId = ''; // 记住上次选择的子菜单
let navConfigLoaded = false; // 是否已加载配置

// 初始化导航页配置（在页面加载时调用）
async function initNavConfig() {
    try {
        const result = await chrome.storage.sync.get(['navUrl', 'lastMenuId', 'lastSubMenuId']);
        if (result.navUrl) {
            navServerUrl = result.navUrl;
        }
        if (result.lastMenuId) {
            lastSelectedMenuId = result.lastMenuId;
        }
        if (result.lastSubMenuId) {
            lastSelectedSubMenuId = result.lastSubMenuId;
        }
        navConfigLoaded = true;
    } catch (e) {
        console.error('加载导航配置失败:', e);
    }
}

// 快速添加到导航页（使用上次的分类，无需弹窗）
async function quickAddToNav() {
    if (selectedBookmarks.size === 0) {
        alert('请先选择要添加的书签');
        return;
    }
    
    // 检查是否有保存的配置
    if (!navServerUrl || !lastSelectedMenuId) {
        // 没有配置，显示完整弹窗
        showAddToNavModal();
        return;
    }
    
    // 获取选中的书签
    const bookmarksToAdd = getSelectedBookmarksData();
    if (bookmarksToAdd.length === 0) {
        alert('没有有效的书签可添加');
        return;
    }
    
    // 获取认证token
    const token = await getNavAuthToken();
    if (!token) return;
    
    // 直接添加
    try {
        // 获取服务器上已有的标签
        let existingTags = [];
        try {
            const tagsResponse = await fetch(`${navServerUrl}/api/tags`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (tagsResponse.ok) {
                existingTags = await tagsResponse.json();
            }
        } catch (e) {}
        
        // 构建卡片数据（包含自动生成的标签和描述）
        const cards = await Promise.all(bookmarksToAdd.map(async bookmark => {
            let domain = '';
            try {
                domain = new URL(bookmark.url).hostname.replace(/^www\./, '');
            } catch (e) {}
            
            const title = truncateText(bookmark.title || domain || '无标题', 20);
            const description = generateDescription(bookmark.title, domain);
            const tagNames = generateTagNames(bookmark.url, bookmark.title);
            const tagIds = await getOrCreateTagIds(tagNames, existingTags, token);
            
            return {
                title,
                url: bookmark.url,
                logo: getNavFaviconUrl(bookmark.url),
                description,
                tagIds
            };
        }));
        
        const response = await fetch(`${navServerUrl}/api/batch/add`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                menu_id: parseInt(lastSelectedMenuId),
                sub_menu_id: lastSelectedSubMenuId ? parseInt(lastSelectedSubMenuId) : null,
                cards
            })
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                await chrome.storage.local.remove(['navAuthToken']);
            }
            throw new Error('添加失败');
        }
        
        const result = await response.json();
        let msg = `✅ 已添加 ${result.added} 个书签`;
        if (result.skipped > 0) msg += `，跳过 ${result.skipped} 个重复`;
        
        showToast(msg);
        selectedBookmarks.clear();
        updateSelectionUI();
        renderBookmarkList();
    } catch (error) {
        console.error('快速添加失败:', error);
        // 失败时显示完整弹窗
        showAddToNavModal();
    }
}

// 获取选中书签的数据
function getSelectedBookmarksData() {
    const allBookmarksList = [];
    collectAllBookmarks(allBookmarks, allBookmarksList);
    
    const result = [];
    for (const id of selectedBookmarks) {
        const bookmark = allBookmarksList.find(b => b.id === id);
        if (bookmark && bookmark.url) {
            result.push(bookmark);
        }
    }
    return result;
}

// 获取导航页用的favicon URL
function getNavFaviconUrl(url) {
    try {
        const urlObj = new URL(url);
        return `https://api.xinac.net/icon/?url=${urlObj.origin}&sz=128`;
    } catch (e) {
        return '';
    }
}

// 显示Toast提示
function showToast(message, duration = 3000) {
    let toast = document.getElementById('navToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'navToast';
        toast.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: #333; color: white; padding: 12px 24px; border-radius: 8px;
            font-size: 14px; z-index: 10000; opacity: 0; transition: opacity 0.3s;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

// 显示添加到导航页弹窗
async function showAddToNavModal() {
    if (selectedBookmarks.size === 0) {
        alert('请先选择要添加的书签');
        return;
    }
    
    // 获取选中的书签详情
    pendingNavBookmarks = getSelectedBookmarksData();
    
    if (pendingNavBookmarks.length === 0) {
        alert('没有有效的书签可添加');
        return;
    }
    
    // 加载配置
    if (!navConfigLoaded) {
        await initNavConfig();
    }
    
    // 设置服务器地址
    if (navServerUrl) {
        document.getElementById('navServerUrl').value = navServerUrl;
    }
    
    // 渲染待添加书签列表
    renderPendingNavBookmarks();
    
    // 显示弹窗
    document.getElementById('addToNavModal').classList.add('active');
    document.getElementById('navAddStatus').textContent = '';
    
    // 如果已有服务器地址，自动加载分类并恢复上次选择
    if (navServerUrl) {
        await loadNavMenus();
        // 恢复上次选择
        if (lastSelectedMenuId) {
            document.getElementById('navMenuSelect').value = lastSelectedMenuId;
            onMenuSelectChange();
            if (lastSelectedSubMenuId) {
                document.getElementById('navSubMenuSelect').value = lastSelectedSubMenuId;
            }
        }
    }
}

// 渲染待添加的书签列表
function renderPendingNavBookmarks() {
    const container = document.getElementById('navBookmarkList');
    document.getElementById('navBookmarkCount').textContent = pendingNavBookmarks.length;
    
    if (pendingNavBookmarks.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">没有待添加的书签</div>';
        return;
    }
    
    container.innerHTML = pendingNavBookmarks.map((bookmark, index) => `
        <div style="display: flex; align-items: center; gap: 8px; padding: 8px; border-bottom: 1px solid #f0f0f0;">
            <img class="pending-favicon" data-url="${escapeHtml(bookmark.url)}" src="${getFaviconUrl(bookmark.url)}" style="width: 16px; height: 16px;">
            <div style="flex: 1; min-width: 0;">
                <div style="font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(bookmark.title || '无标题')}</div>
                <div style="font-size: 11px; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(bookmark.url)}</div>
            </div>
            <button class="btn btn-small btn-secondary btn-remove-pending" data-index="${index}" title="移除">✕</button>
        </div>
    `).join('');
    
    // 绑定favicon错误处理
    container.querySelectorAll('.pending-favicon').forEach(img => {
        img.addEventListener('error', () => {
            img.src = 'icons/icon16.png';
        });
    });
    
    // 绑定移除按钮事件
    container.querySelectorAll('.btn-remove-pending').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index, 10);
            removePendingNavBookmark(index);
        });
    });
}

// 移除待添加的书签
function removePendingNavBookmark(index) {
    pendingNavBookmarks.splice(index, 1);
    renderPendingNavBookmarks();
}

// 关闭添加到导航页弹窗
function closeAddToNavModal() {
    document.getElementById('addToNavModal').classList.remove('active');
    pendingNavBookmarks = [];
}

// 加载导航页分类
async function loadNavMenus() {
    const serverUrl = document.getElementById('navServerUrl').value.trim();
    if (!serverUrl) {
        alert('请输入导航站地址');
        return;
    }
    
    navServerUrl = serverUrl.replace(/\/$/, ''); // 移除末尾斜杠
    
    // 保存服务器地址
    try {
        await chrome.storage.sync.set({ navUrl: navServerUrl });
    } catch (e) {}
    
    document.getElementById('navAddStatus').textContent = '正在加载分类...';
    
    try {
        const response = await fetch(`${navServerUrl}/api/menus`);
        if (!response.ok) throw new Error('请求失败');
        
        navMenus = await response.json();
        
        // 填充菜单下拉框
        const menuSelect = document.getElementById('navMenuSelect');
        menuSelect.innerHTML = '<option value="">-- 请选择分类 --</option>';
        
        navMenus.forEach(menu => {
            const option = document.createElement('option');
            option.value = menu.id;
            option.textContent = menu.name;
            menuSelect.appendChild(option);
        });
        
        // 清空子菜单
        document.getElementById('navSubMenuSelect').innerHTML = '<option value="">-- 不使用子分类 --</option>';
        
        document.getElementById('navAddStatus').textContent = `已加载 ${navMenus.length} 个分类`;
    } catch (error) {
        console.error('加载分类失败:', error);
        document.getElementById('navAddStatus').textContent = '加载分类失败，请检查服务器地址';
        alert('加载分类失败: ' + error.message);
    }
}

// 菜单选择变化时加载子菜单
function onMenuSelectChange() {
    const menuId = document.getElementById('navMenuSelect').value;
    const subMenuSelect = document.getElementById('navSubMenuSelect');
    
    subMenuSelect.innerHTML = '<option value="">-- 不使用子分类 --</option>';
    
    if (!menuId) return;
    
    const menu = navMenus.find(m => m.id == menuId);
    if (menu && menu.subMenus && menu.subMenus.length > 0) {
        menu.subMenus.forEach(sub => {
            const option = document.createElement('option');
            option.value = sub.id;
            option.textContent = sub.name;
            subMenuSelect.appendChild(option);
        });
    }
}

// 显示新建分类弹窗
function showNewMenuModal(type) {
    // 确保服务器地址已设置
    const serverUrl = document.getElementById('navServerUrl').value.trim();
    if (!serverUrl) {
        alert('请先输入导航站地址并加载分类');
        return;
    }
    navServerUrl = serverUrl.replace(/\/$/, '');
    
    newMenuType = type;
    
    if (type === 'menu') {
        document.getElementById('newMenuTitle').textContent = '新建分类';
    } else {
        const menuId = document.getElementById('navMenuSelect').value;
        if (!menuId) {
            alert('请先选择一个主分类');
            return;
        }
        document.getElementById('newMenuTitle').textContent = '新建子分类';
    }
    
    document.getElementById('newMenuName').value = '';
    document.getElementById('newMenuModal').classList.add('active');
}

// 关闭新建分类弹窗
function closeNewMenuModal() {
    document.getElementById('newMenuModal').classList.remove('active');
}

// 确认新建分类
async function confirmNewMenu() {
    const name = document.getElementById('newMenuName').value.trim();
    if (!name) {
        alert('请输入分类名称');
        return;
    }
    
    if (!navServerUrl) {
        alert('请先设置导航站地址');
        return;
    }
    
    const menuId = document.getElementById('navMenuSelect').value;
    
    if (newMenuType === 'submenu' && !menuId) {
        alert('请先选择一个主分类');
        return;
    }
    
    // 立即关闭弹窗
    closeNewMenuModal();
    document.getElementById('navAddStatus').textContent = '正在创建分类...';
    
    try {
        let apiUrl, body;
        if (newMenuType === 'menu') {
            apiUrl = `${navServerUrl}/api/menus`;
            body = { name, order: navMenus.length };
        } else {
            const menu = navMenus.find(m => String(m.id) === String(menuId));
            apiUrl = `${navServerUrl}/api/menus/${menuId}/submenus`;
            body = { name, order: menu?.subMenus?.length || 0 };
        }
        
        // 使用带自动重试的认证请求
        const response = await fetchWithAuth(apiUrl, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `创建失败 (${response.status})`);
        }
        
        const result = await response.json();
        
        // 更新UI
        if (newMenuType === 'menu') {
            const option = document.createElement('option');
            option.value = result.id;
            option.textContent = name;
            document.getElementById('navMenuSelect').appendChild(option);
            document.getElementById('navMenuSelect').value = result.id;
            navMenus.push({ id: result.id, name: name, subMenus: [] });
            onMenuSelectChange();
        } else {
            const option = document.createElement('option');
            option.value = result.id;
            option.textContent = name;
            document.getElementById('navSubMenuSelect').appendChild(option);
            document.getElementById('navSubMenuSelect').value = result.id;
            // 更新本地缓存
            const menu = navMenus.find(m => String(m.id) === String(menuId));
            if (menu) {
                if (!menu.subMenus) menu.subMenus = [];
                menu.subMenus.push({ id: result.id, name: name });
            }
        }
        
        document.getElementById('navAddStatus').textContent = '分类创建成功';
        
        // 后台刷新右键菜单（不阻塞）
        chrome.runtime.sendMessage({ action: 'refreshMenus' }).catch(() => {});
        
    } catch (error) {
        console.error('创建分类失败:', error);
        document.getElementById('navAddStatus').textContent = '创建失败: ' + error.message;
    }
}

// 获取认证token
async function getNavAuthToken(forceNew = false) {
    // 确保服务器地址已设置
    if (!navServerUrl) {
        const serverUrl = document.getElementById('navServerUrl')?.value?.trim();
        if (!serverUrl) {
            alert('请先输入导航站地址');
            return null;
        }
        navServerUrl = serverUrl.replace(/\/$/, '');
    }
    
    // 如果不是强制获取新token，尝试从存储中获取
    if (!forceNew) {
        try {
            const result = await chrome.storage.local.get(['navAuthToken']);
            if (result.navAuthToken) {
                // 验证token是否有效（简单检查格式）
                const token = result.navAuthToken;
                if (token && token.split('.').length === 3) {
                    // 检查token是否过期（JWT格式）
                    try {
                        const payload = JSON.parse(atob(token.split('.')[1]));
                        if (payload.exp && payload.exp * 1000 > Date.now()) {
                            return token;
                        }
                        // token已过期，清除并重新获取
                        console.log('Token已过期，需要重新登录');
                        await chrome.storage.local.remove(['navAuthToken']);
                    } catch (e) {
                        // 解析失败，token可能无效
                        console.log('Token解析失败，需要重新登录');
                        await chrome.storage.local.remove(['navAuthToken']);
                    }
                }
            }
        } catch (e) {
            console.error('获取存储的token失败:', e);
        }
    } else {
        // 强制获取新token，先清除旧的
        await chrome.storage.local.remove(['navAuthToken']);
    }
    
    // 没有有效token，提示用户输入密码
    const password = prompt('请输入导航站管理密码：');
    if (!password) return null;
    
    try {
        // 使用verify-password接口，只需要密码
        const response = await fetch(`${navServerUrl}/api/verify-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        
        if (!response.ok) {
            let errorMsg = '密码验证失败';
            try {
                const error = await response.json();
                errorMsg = error.error || errorMsg;
            } catch (e) {
                errorMsg = `HTTP ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorMsg);
        }
        
        const data = await response.json();
        const token = data.token;
        
        if (!token) {
            throw new Error('服务器未返回token');
        }
        
        // 保存token
        await chrome.storage.local.set({ navAuthToken: token });
        
        return token;
    } catch (error) {
        console.error('登录失败:', error);
        alert('登录失败: ' + error.message);
        return null;
    }
}

// 带自动重试的认证API请求
async function fetchWithAuth(url, options = {}, retried = false) {
    const token = await getNavAuthToken();
    if (!token) {
        throw new Error('未获取到认证token');
    }
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(options.headers || {})
    };
    
    const response = await fetch(url, { ...options, headers });
    
    // 如果认证失败且还没重试过，清除token并重试一次
    if (response.status === 401 && !retried) {
        await chrome.storage.local.remove(['navAuthToken']);
        return fetchWithAuth(url, options, true);
    }
    
    return response;
}

// 确认添加到导航页
async function confirmAddToNav() {
    const menuId = document.getElementById('navMenuSelect').value;
    const subMenuId = document.getElementById('navSubMenuSelect').value;
    
    if (!menuId) {
        alert('请选择一个分类');
        return;
    }
    
    if (pendingNavBookmarks.length === 0) {
        alert('没有待添加的书签');
        return;
    }
    
    if (!navServerUrl) {
        alert('请先设置导航站地址');
        return;
    }
    
    // 获取认证token
    const token = await getNavAuthToken();
    if (!token) {
        return;
    }
    
    document.getElementById('navAddStatus').textContent = '正在准备书签信息...';
    document.getElementById('btnConfirmAddToNav').disabled = true;
    
    try {
        // 获取服务器上已有的标签
        let existingTags = [];
        try {
            const tagsResponse = await fetch(`${navServerUrl}/api/tags`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (tagsResponse.ok) {
                existingTags = await tagsResponse.json();
            }
        } catch (e) {
            console.log('获取标签失败，将不使用标签:', e);
        }
        
        // 构建卡片数据（包含自动生成的标签和描述）
        const cards = await Promise.all(pendingNavBookmarks.map(async bookmark => {
            let logo = '';
            let domain = '';
            try {
                const urlObj = new URL(bookmark.url);
                logo = `https://api.xinac.net/icon/?url=${urlObj.origin}&sz=128`;
                domain = urlObj.hostname.replace(/^www\./, '');
            } catch (e) {}
            
            // 自动生成标题（限制20字符）
            let title = (bookmark.title || domain || '无标题').trim();
            title = truncateText(title, 20);
            
            // 自动生成描述（基于标题和域名，限制100字符）
            const description = generateDescription(bookmark.title, domain);
            
            // 自动生成标签名称（限制8字符）
            const tagNames = generateTagNames(bookmark.url, bookmark.title);
            
            // 查找或创建标签，获取tagIds
            const tagIds = await getOrCreateTagIds(tagNames, existingTags, token);
            
            return {
                title,
                url: bookmark.url,
                logo,
                description,
                tagIds
            };
        }));
        
        document.getElementById('navAddStatus').textContent = '正在添加到导航页...';
        
        // 批量添加卡片
        const addResponse = await fetch(`${navServerUrl}/api/batch/add`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                menu_id: parseInt(menuId),
                sub_menu_id: subMenuId ? parseInt(subMenuId) : null,
                cards
            })
        });
        
        if (!addResponse.ok) {
            const error = await addResponse.json();
            // 如果是认证失败，清除token
            if (addResponse.status === 401) {
                await chrome.storage.local.remove(['navAuthToken']);
            }
            throw new Error(error.error || '添加失败');
        }
        
        const addResult = await addResponse.json();
        
        let message = `成功添加 ${addResult.added} 个书签到导航页`;
        if (addResult.skipped > 0) {
            message += `，跳过 ${addResult.skipped} 个重复项`;
        }
        
        // 保存用户选择，下次快速添加时使用
        lastSelectedMenuId = menuId;
        lastSelectedSubMenuId = subMenuId;
        try {
            await chrome.storage.sync.set({ 
                navUrl: navServerUrl,
                lastMenuId: menuId, 
                lastSubMenuId: subMenuId 
            });
        } catch (e) {}
        
        document.getElementById('navAddStatus').textContent = message;
        showToast(message);
        
        closeAddToNavModal();
        selectedBookmarks.clear();
        updateSelectionUI();
        renderBookmarkList();
        
    } catch (error) {
        console.error('添加到导航页失败:', error);
        document.getElementById('navAddStatus').textContent = '添加失败: ' + error.message;
        alert('添加失败: ' + error.message);
    } finally {
        document.getElementById('btnConfirmAddToNav').disabled = false;
    }
}

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
        // 清理标题中的特殊字符和多余空格
        desc = title.replace(/[\|\-–—_]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    
    if (domain && !desc.toLowerCase().includes(domain.toLowerCase())) {
        desc = desc ? `${desc} - ${domain}` : domain;
    }
    
    // 限制100字符
    return truncateText(desc, 100);
}

// 自动生成标签名称
function generateTagNames(url, title) {
    const tags = [];
    
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace(/^www\./, '');
        const pathname = urlObj.pathname.toLowerCase();
        
        // 常见网站分类映射
        const domainTagMap = {
            'github.com': '开发',
            'gitlab.com': '开发',
            'stackoverflow.com': '技术',
            'youtube.com': '视频',
            'bilibili.com': '视频',
            'zhihu.com': '问答',
            'juejin.cn': '技术',
            'csdn.net': '技术',
            'cnblogs.com': '技术',
            'segmentfault.com': '技术',
            'medium.com': '博客',
            'dev.to': '技术',
            'twitter.com': '社交',
            'x.com': '社交',
            'facebook.com': '社交',
            'linkedin.com': '职场',
            'reddit.com': '社区',
            'v2ex.com': '社区',
            'taobao.com': '购物',
            'jd.com': '购物',
            'amazon.com': '购物',
            'tmall.com': '购物',
            'douban.com': '影视',
            'imdb.com': '影视',
            'netflix.com': '影视',
            'spotify.com': '音乐',
            'music.163.com': '音乐',
            'wikipedia.org': '百科',
            'baike.baidu.com': '百科',
            'notion.so': '工具',
            'figma.com': '设计',
            'dribbble.com': '设计',
            'behance.net': '设计',
            'unsplash.com': '图片',
            'pexels.com': '图片',
            'google.com': '搜索',
            'baidu.com': '搜索',
            'bing.com': '搜索'
        };
        
        // 根据域名添加标签
        for (const [site, tag] of Object.entries(domainTagMap)) {
            if (domain.includes(site) || domain.endsWith('.' + site.split('.')[0])) {
                tags.push(tag);
                break;
            }
        }
        
        // 根据路径关键词添加标签
        const pathKeywords = {
            '/doc': '文档',
            '/docs': '文档',
            '/api': 'API',
            '/blog': '博客',
            '/news': '新闻',
            '/tool': '工具',
            '/download': '下载',
            '/learn': '学习',
            '/tutorial': '教程',
            '/course': '课程'
        };
        
        for (const [path, tag] of Object.entries(pathKeywords)) {
            if (pathname.includes(path)) {
                if (!tags.includes(tag)) tags.push(tag);
                break;
            }
        }
        
        // 根据标题关键词添加标签
        if (title) {
            const titleLower = title.toLowerCase();
            const titleKeywords = {
                '文档': '文档',
                'doc': '文档',
                'api': 'API',
                '教程': '教程',
                'tutorial': '教程',
                '工具': '工具',
                'tool': '工具',
                '下载': '下载',
                'download': '下载',
                '官网': '官网',
                'official': '官网'
            };
            
            for (const [keyword, tag] of Object.entries(titleKeywords)) {
                if (titleLower.includes(keyword) && !tags.includes(tag)) {
                    tags.push(tag);
                    break;
                }
            }
        }
        
    } catch (e) {}
    
    // 限制最多2个标签，每个标签最多8字符
    return tags.slice(0, 2).map(tag => truncateText(tag, 8));
}

// 获取或创建标签ID（支持传入token或使用fetchWithAuth）
async function getOrCreateTagIds(tagNames, existingTags, token = null) {
    if (!tagNames || tagNames.length === 0) return [];
    
    const tagIds = [];
    
    for (const tagName of tagNames) {
        // 查找已存在的标签
        const existing = existingTags.find(t => t.name === tagName);
        if (existing) {
            tagIds.push(existing.id);
        } else {
            // 创建新标签
            try {
                let response;
                if (token) {
                    // 使用传入的token
                    response = await fetch(`${navServerUrl}/api/tags`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ name: tagName })
                    });
                } else {
                    // 使用fetchWithAuth自动获取token
                    response = await fetchWithAuth(`${navServerUrl}/api/tags`, {
                        method: 'POST',
                        body: JSON.stringify({ name: tagName })
                    });
                }
                
                if (response.ok) {
                    const newTag = await response.json();
                    tagIds.push(newTag.id);
                    // 添加到缓存避免重复创建
                    existingTags.push({ id: newTag.id, name: tagName });
                }
            } catch (e) {
                console.log('创建标签失败:', tagName, e);
            }
        }
    }
    
    return tagIds;
}


// ==================== 导航页设置 ====================
let settingsMenus = [];

// 显示导航页设置弹窗
async function showNavSettingsModal() {
    const modal = document.getElementById('navSettingsModal');
    modal.classList.add('active');
    
    // 加载已保存的设置
    try {
        const config = await chrome.storage.sync.get(['navUrl', 'lastMenuId', 'lastSubMenuId']);
        document.getElementById('navSettingsUrl').value = config.navUrl || '';
        
        if (config.navUrl) {
            await loadSettingsMenus();
            
            if (config.lastMenuId) {
                document.getElementById('defaultMenuSelect').value = config.lastMenuId;
                onDefaultMenuChange();
                
                if (config.lastSubMenuId) {
                    document.getElementById('defaultSubMenuSelect').value = config.lastSubMenuId;
                }
            }
        }
    } catch (e) {
        console.error('加载设置失败:', e);
    }
}

// 关闭导航页设置弹窗
function closeNavSettingsModal() {
    document.getElementById('navSettingsModal').classList.remove('active');
}

// 测试连接并加载分类
async function testNavConnection() {
    const urlInput = document.getElementById('navSettingsUrl');
    const statusDiv = document.getElementById('connectionStatus');
    const url = urlInput.value.trim();
    
    if (!url) {
        statusDiv.innerHTML = '<span style="color: #dc2626;">请输入导航站地址</span>';
        return;
    }
    
    statusDiv.innerHTML = '<span style="color: #666;">正在测试连接...</span>';
    
    try {
        const serverUrl = url.replace(/\/$/, '');
        const response = await fetch(`${serverUrl}/api/menus`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const menus = await response.json();
        settingsMenus = menus;
        
        // 填充分类下拉框
        const menuSelect = document.getElementById('defaultMenuSelect');
        menuSelect.innerHTML = '<option value="">-- 选择默认分类 --</option>';
        
        menus.forEach(menu => {
            const option = document.createElement('option');
            option.value = menu.id;
            option.textContent = menu.name;
            menuSelect.appendChild(option);
        });
        
        statusDiv.innerHTML = `<span style="color: #059669;">✓ 连接成功，已加载 ${menus.length} 个分类</span>`;
        
        // 临时保存URL
        navServerUrl = serverUrl;
    } catch (e) {
        statusDiv.innerHTML = `<span style="color: #dc2626;">✗ 连接失败: ${e.message}</span>`;
    }
}

// 加载设置中的分类
async function loadSettingsMenus() {
    const url = document.getElementById('navSettingsUrl').value.trim();
    if (!url) return;
    
    try {
        const serverUrl = url.replace(/\/$/, '');
        const response = await fetch(`${serverUrl}/api/menus`);
        if (!response.ok) return;
        
        const menus = await response.json();
        settingsMenus = menus;
        
        const menuSelect = document.getElementById('defaultMenuSelect');
        menuSelect.innerHTML = '<option value="">-- 选择默认分类 --</option>';
        
        menus.forEach(menu => {
            const option = document.createElement('option');
            option.value = menu.id;
            option.textContent = menu.name;
            menuSelect.appendChild(option);
        });
        
        navServerUrl = serverUrl;
    } catch (e) {
        console.error('加载分类失败:', e);
    }
}

// 默认分类选择变化
function onDefaultMenuChange() {
    const menuId = document.getElementById('defaultMenuSelect').value;
    const subMenuSelect = document.getElementById('defaultSubMenuSelect');
    
    subMenuSelect.innerHTML = '<option value="">-- 不使用子分类 --</option>';
    
    if (!menuId) return;
    
    const menu = settingsMenus.find(m => String(m.id) === String(menuId));
    if (menu && menu.subMenus && menu.subMenus.length > 0) {
        menu.subMenus.forEach(sub => {
            const option = document.createElement('option');
            option.value = sub.id;
            option.textContent = sub.name;
            subMenuSelect.appendChild(option);
        });
    }
}

// 保存导航页设置
async function saveNavSettings() {
    const url = document.getElementById('navSettingsUrl').value.trim();
    const menuId = document.getElementById('defaultMenuSelect').value;
    const subMenuId = document.getElementById('defaultSubMenuSelect').value;
    const statusDiv = document.getElementById('navSettingsStatus');
    
    if (!url) {
        statusDiv.innerHTML = '<span style="color: #dc2626;">请输入导航站地址</span>';
        return;
    }
    
    try {
        // 保存设置
        await chrome.storage.sync.set({
            navUrl: url.replace(/\/$/, ''),
            lastMenuId: menuId || '',
            lastSubMenuId: subMenuId || ''
        });
        
        statusDiv.innerHTML = '<span style="color: #059669;">✓ 设置已保存</span>';
        
        // 后台刷新右键菜单（不阻塞）
        chrome.runtime.sendMessage({ action: 'refreshMenus' }).catch(() => {});
        
        setTimeout(() => {
            closeNavSettingsModal();
        }, 1000);
    } catch (e) {
        statusDiv.innerHTML = `<span style="color: #dc2626;">保存失败: ${e.message}</span>`;
    }
}

// 从设置弹窗新建分类
let settingsNewMenuType = 'menu';

function showNewMenuModalFromSettings(type) {
    settingsNewMenuType = type;
    
    if (type === 'menu') {
        document.getElementById('newMenuTitle').textContent = '新建分类';
    } else {
        const menuId = document.getElementById('defaultMenuSelect').value;
        if (!menuId) {
            alert('请先选择一个主分类');
            return;
        }
        document.getElementById('newMenuTitle').textContent = '新建子分类';
    }
    
    document.getElementById('newMenuName').value = '';
    document.getElementById('newMenuModal').classList.add('active');
    
    // 临时修改确认按钮的行为
    const confirmBtn = document.getElementById('btnConfirmNewMenu');
    confirmBtn.onclick = confirmNewMenuFromSettings;
}

// 从设置弹窗确认新建分类
async function confirmNewMenuFromSettings() {
    const name = document.getElementById('newMenuName').value.trim();
    if (!name) {
        alert('请输入分类名称');
        return;
    }
    
    const url = document.getElementById('navSettingsUrl').value.trim();
    if (!url) {
        alert('请先设置导航站地址');
        return;
    }
    
    // 确保navServerUrl已设置
    const serverUrl = url.replace(/\/$/, '');
    navServerUrl = serverUrl;
    
    // 立即关闭弹窗，提升响应速度
    document.getElementById('newMenuModal').classList.remove('active');
    document.getElementById('btnConfirmNewMenu').onclick = confirmNewMenu;
    
    try {
        let apiUrl, body;
        const parentMenuId = document.getElementById('defaultMenuSelect').value;
        
        if (settingsNewMenuType === 'menu') {
            apiUrl = `${serverUrl}/api/menus`;
            body = { name, order: settingsMenus.length };
        } else {
            const menu = settingsMenus.find(m => String(m.id) === String(parentMenuId));
            apiUrl = `${serverUrl}/api/menus/${parentMenuId}/submenus`;
            body = { name, order: menu?.subMenus?.length || 0 };
        }
        
        // 使用带自动重试的认证请求
        const response = await fetchWithAuth(apiUrl, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `创建失败 (${response.status})`);
        }
        
        const result = await response.json();
        
        // 本地立即更新下拉框（不等待重新加载）
        if (settingsNewMenuType === 'menu') {
            const option = document.createElement('option');
            option.value = result.id;
            option.textContent = name;
            document.getElementById('defaultMenuSelect').appendChild(option);
            document.getElementById('defaultMenuSelect').value = result.id;
            settingsMenus.push({ id: result.id, name: name, subMenus: [] });
            onDefaultMenuChange();
        } else {
            const option = document.createElement('option');
            option.value = result.id;
            option.textContent = name;
            document.getElementById('defaultSubMenuSelect').appendChild(option);
            document.getElementById('defaultSubMenuSelect').value = result.id;
            // 更新本地缓存
            const menu = settingsMenus.find(m => String(m.id) === String(parentMenuId));
            if (menu) {
                if (!menu.subMenus) menu.subMenus = [];
                menu.subMenus.push({ id: result.id, name: name });
            }
        }
        
        // 后台异步刷新右键菜单（不阻塞）
        chrome.runtime.sendMessage({ action: 'refreshMenus' }).catch(() => {});
        
    } catch (e) {
        alert('创建分类失败: ' + e.message);
    }
}


// ==================== 文件夹右键菜单 ====================
let rightClickedFolderId = null;
let rightClickedFolder = null;

function showFolderContextMenu(x, y, folder) {
    rightClickedFolder = folder;
    const menu = document.getElementById('folderContextMenu');
    
    // 计算书签数量
    const bookmarkCount = countFolderBookmarks(folder);
    document.querySelector('#ctxFolderToNav span:last-child').textContent = `导入到导航页 (${bookmarkCount}个书签)`;
    
    menu.classList.add('active');
    
    // 调整位置
    let left = x;
    let top = y;
    
    if (x + 200 > window.innerWidth) {
        left = x - 200;
    }
    if (y + 150 > window.innerHeight) {
        top = y - 150;
    }
    
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    
    // 点击其他地方关闭
    setTimeout(() => {
        document.addEventListener('click', hideFolderContextMenuOnClick);
    }, 0);
}

function hideFolderContextMenuOnClick(e) {
    if (!e.target.closest('#folderContextMenu')) {
        hideFolderContextMenu();
    }
}

function hideFolderContextMenu() {
    document.getElementById('folderContextMenu').classList.remove('active');
    document.removeEventListener('click', hideFolderContextMenuOnClick);
}

// ==================== 导入文件夹到导航页 ====================
let importFolderData = null;

function showImportFolderModal() {
    if (!rightClickedFolder) return;
    
    const folder = rightClickedFolder;
    const bookmarks = [];
    collectFolderBookmarks(folder, bookmarks);
    
    importFolderData = {
        folder: folder,
        bookmarks: bookmarks
    };
    
    document.getElementById('importFolderName').value = folder.title || '未命名';
    document.getElementById('importFolderCount').value = bookmarks.length + ' 个';
    document.getElementById('importMenuName').textContent = folder.title || '未命名';
    document.getElementById('importFolderType').value = 'menu';
    document.getElementById('parentMenuGroup').style.display = 'none';
    document.getElementById('importFolderStatus').textContent = '';
    
    // 加载父分类列表
    loadImportParentMenus();
    
    document.getElementById('importFolderModal').classList.add('active');
}

function closeImportFolderModal() {
    document.getElementById('importFolderModal').classList.remove('active');
    importFolderData = null;
}

// 收集文件夹下的所有书签（不包括子文件夹中的）
function collectFolderBookmarks(folder, result) {
    if (!folder.children) return;
    
    for (const child of folder.children) {
        if (child.url && !isSeparatorBookmark(child.url)) {
            result.push(child);
        }
    }
}

// 导入类型变化
function onImportTypeChange() {
    const type = document.getElementById('importFolderType').value;
    document.getElementById('parentMenuGroup').style.display = type === 'submenu' ? 'block' : 'none';
}

// 加载父分类列表
async function loadImportParentMenus() {
    try {
        const config = await chrome.storage.sync.get(['navUrl']);
        if (!config.navUrl) return;
        
        const response = await fetch(`${config.navUrl}/api/menus`);
        if (!response.ok) return;
        
        const menus = await response.json();
        const select = document.getElementById('importParentMenu');
        select.innerHTML = '<option value="">-- 请选择 --</option>';
        
        menus.forEach(menu => {
            const option = document.createElement('option');
            option.value = menu.id;
            option.textContent = menu.name;
            select.appendChild(option);
        });
    } catch (e) {
        console.error('加载分类失败:', e);
    }
}

// 确认导入文件夹
async function confirmImportFolder() {
    if (!importFolderData) return;
    
    const statusDiv = document.getElementById('importFolderStatus');
    const confirmBtn = document.getElementById('btnConfirmImportFolder');
    
    const config = await chrome.storage.sync.get(['navUrl']);
    if (!config.navUrl) {
        statusDiv.innerHTML = '<span style="color: #dc2626;">请先在导航页设置中配置导航站地址</span>';
        return;
    }
    
    // 确保navServerUrl已设置（fetchWithAuth依赖它）
    navServerUrl = config.navUrl.replace(/\/$/, '');
    
    const importType = document.getElementById('importFolderType').value;
    const parentMenuId = document.getElementById('importParentMenu').value;
    const folderName = importFolderData.folder.title || '未命名';
    const bookmarks = importFolderData.bookmarks;
    
    if (importType === 'submenu' && !parentMenuId) {
        statusDiv.innerHTML = '<span style="color: #dc2626;">请选择父分类</span>';
        return;
    }
    
    if (bookmarks.length === 0) {
        statusDiv.innerHTML = '<span style="color: #dc2626;">该文件夹下没有书签</span>';
        return;
    }
    
    confirmBtn.disabled = true;
    statusDiv.innerHTML = '<span style="color: #666;">正在导入...</span>';
    
    try {
        const serverUrl = navServerUrl;
        let menuId, subMenuId = null;
        
        // 1. 创建菜单或子菜单（使用带自动重试的认证请求）
        if (importType === 'menu') {
            // 创建主菜单
            const menuResponse = await fetchWithAuth(`${serverUrl}/api/menus`, {
                method: 'POST',
                body: JSON.stringify({ name: folderName, order: 999 })
            });
            
            if (!menuResponse.ok) {
                const errorData = await menuResponse.json().catch(() => ({}));
                throw new Error(errorData.error || `创建分类失败 (${menuResponse.status})`);
            }
            
            const menuResult = await menuResponse.json();
            menuId = menuResult.id;
        } else {
            // 创建子菜单
            const subMenuResponse = await fetchWithAuth(`${serverUrl}/api/menus/${parentMenuId}/submenus`, {
                method: 'POST',
                body: JSON.stringify({ name: folderName, order: 999 })
            });
            
            if (!subMenuResponse.ok) {
                const errorData = await subMenuResponse.json().catch(() => ({}));
                throw new Error(errorData.error || `创建子分类失败 (${subMenuResponse.status})`);
            }
            
            const subMenuResult = await subMenuResponse.json();
            menuId = parseInt(parentMenuId);
            subMenuId = subMenuResult.id;
        }
        
        // 2. 获取已有标签
        let existingTags = [];
        try {
            const tagsResponse = await fetchWithAuth(`${serverUrl}/api/tags`);
            if (tagsResponse.ok) {
                existingTags = await tagsResponse.json();
            }
        } catch (e) {}
        
        // 3. 批量添加书签作为卡片（包含自动生成的标签和描述）
        const cards = await Promise.all(bookmarks.map(async bookmark => {
            let logo = '';
            let domain = '';
            try {
                const urlObj = new URL(bookmark.url);
                logo = `https://api.xinac.net/icon/?url=${urlObj.origin}&sz=128`;
                domain = urlObj.hostname.replace(/^www\./, '');
            } catch (e) {}
            
            const title = truncateText(bookmark.title || domain || '无标题', 20);
            const description = generateDescription(bookmark.title, domain);
            const tagNames = generateTagNames(bookmark.url, bookmark.title);
            const tagIds = await getOrCreateTagIds(tagNames, existingTags);
            
            return {
                title,
                url: bookmark.url,
                logo,
                description,
                tagIds
            };
        }));
        
        const addResponse = await fetchWithAuth(`${serverUrl}/api/batch/add`, {
            method: 'POST',
            body: JSON.stringify({
                menu_id: menuId,
                sub_menu_id: subMenuId,
                cards: cards
            })
        });
        
        if (!addResponse.ok) {
            const errorData = await addResponse.json().catch(() => ({}));
            throw new Error(errorData.error || '添加卡片失败');
        }
        
        const addResult = await addResponse.json();
        
        let message = `✓ 成功创建分类"${folderName}"，添加了 ${addResult.added} 个卡片`;
        if (addResult.skipped > 0) {
            message += `，跳过 ${addResult.skipped} 个重复`;
        }
        
        // 后台刷新右键菜单（不阻塞）
        chrome.runtime.sendMessage({ action: 'refreshMenus' }).catch(() => {});
        
        statusDiv.innerHTML = `<span style="color: #059669;">${message}</span>`;
        
        setTimeout(() => {
            closeImportFolderModal();
        }, 2000);
        
    } catch (e) {
        console.error('导入失败:', e);
        statusDiv.innerHTML = `<span style="color: #dc2626;">导入失败: ${e.message}</span>`;
    } finally {
        confirmBtn.disabled = false;
    }
}


// ==================== 删除菜单/子菜单 ====================

// 删除主菜单
async function deleteMenuFromSettings() {
    const menuId = document.getElementById('defaultMenuSelect').value;
    if (!menuId) {
        alert('请先选择要删除的分类');
        return;
    }
    
    const menuSelect = document.getElementById('defaultMenuSelect');
    const selectedIndex = menuSelect.selectedIndex;
    const menuName = menuSelect.options[selectedIndex].text;
    
    // 二次确认
    const confirmed = confirm(`⚠️ 确定要删除分类"${menuName}"吗？\n\n删除后该分类下的所有卡片也将被删除，此操作不可恢复！`);
    if (!confirmed) return;
    
    // 再次确认
    const doubleConfirmed = confirm(`⚠️ 再次确认：删除分类"${menuName}"及其所有内容？`);
    if (!doubleConfirmed) return;
    
    const url = document.getElementById('navSettingsUrl').value.trim();
    if (!url) {
        alert('请先设置导航站地址');
        return;
    }
    
    // 确保navServerUrl已设置
    navServerUrl = url.replace(/\/$/, '');
    
    const statusDiv = document.getElementById('navSettingsStatus');
    statusDiv.innerHTML = '<span style="color: #666;">正在删除...</span>';
    
    try {
        // 使用带自动重试的认证请求
        const response = await fetchWithAuth(`${navServerUrl}/api/menus/${menuId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `删除失败 (${response.status})`);
        }
        
        // 删除成功，更新UI
        menuSelect.remove(selectedIndex);
        settingsMenus = settingsMenus.filter(m => String(m.id) !== String(menuId));
        document.getElementById('defaultSubMenuSelect').innerHTML = '<option value="">-- 不使用子分类 --</option>';
        statusDiv.innerHTML = '<span style="color: #059669;">✓ 分类已删除</span>';
        
        // 后台刷新右键菜单（不阻塞）
        chrome.runtime.sendMessage({ action: 'refreshMenus' }).catch(() => {});
    } catch (e) {
        statusDiv.innerHTML = `<span style="color: #dc2626;">删除失败: ${e.message}</span>`;
    }
}

// 删除子菜单
async function deleteSubMenuFromSettings() {
    const subMenuId = document.getElementById('defaultSubMenuSelect').value;
    if (!subMenuId) {
        alert('请先选择要删除的子分类');
        return;
    }
    
    const subMenuSelect = document.getElementById('defaultSubMenuSelect');
    const selectedIndex = subMenuSelect.selectedIndex;
    const subMenuName = subMenuSelect.options[selectedIndex].text;
    const menuId = document.getElementById('defaultMenuSelect').value;
    
    // 二次确认
    const confirmed = confirm(`⚠️ 确定要删除子分类"${subMenuName}"吗？\n\n删除后该子分类下的所有卡片也将被删除，此操作不可恢复！`);
    if (!confirmed) return;
    
    // 再次确认
    const doubleConfirmed = confirm(`⚠️ 再次确认：删除子分类"${subMenuName}"及其所有内容？`);
    if (!doubleConfirmed) return;
    
    const url = document.getElementById('navSettingsUrl').value.trim();
    if (!url) {
        alert('请先设置导航站地址');
        return;
    }
    
    // 确保navServerUrl已设置
    navServerUrl = url.replace(/\/$/, '');
    
    const statusDiv = document.getElementById('navSettingsStatus');
    statusDiv.innerHTML = '<span style="color: #666;">正在删除...</span>';
    
    try {
        // 使用带自动重试的认证请求
        const response = await fetchWithAuth(`${navServerUrl}/api/menus/submenus/${subMenuId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `删除失败 (${response.status})`);
        }
        
        // 删除成功，更新UI
        subMenuSelect.remove(selectedIndex);
        const menu = settingsMenus.find(m => String(m.id) === String(menuId));
        if (menu && menu.subMenus) {
            menu.subMenus = menu.subMenus.filter(s => String(s.id) !== String(subMenuId));
        }
        statusDiv.innerHTML = '<span style="color: #059669;">✓ 子分类已删除</span>';
        
        // 后台刷新右键菜单（不阻塞）
        chrome.runtime.sendMessage({ action: 'refreshMenus' }).catch(() => {});
    } catch (e) {
        statusDiv.innerHTML = `<span style="color: #dc2626;">删除失败: ${e.message}</span>`;
    }
}
