// 书签管理器 - 重构版
let allBookmarks = [];
let bookmarkCount = 0;
let folderCount = 0;
let currentFolderId = null;
let selectedBookmarks = new Set();
let editingItem = null;
let draggedBookmark = null;
let bookmarkUsageCache = new Map(); // 使用频率缓存
let currentSortOrder = 'smart'; // 当前排序方式
let autoSortInterval = null; // 自动排序定时器
let bookmarkTags = new Map(); // 书签标签映射 {bookmarkId: [tags]}
let allTags = new Set(); // 所有标签集合
let currentTagFilters = []; // 当前标签筛选（支持多标签）
let filterNoTag = false; // 是否筛选无标签书签
let bookmarkNotes = new Map(); // 书签笔记映射 {bookmarkId: note}
let currentViewMode = 'grid'; // 当前视图模式: 'grid' 或 'list'

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

// 下拉菜单管理
function setupDropdowns() {
    const dropdowns = document.querySelectorAll('.dropdown');
    dropdowns.forEach(dropdown => {
        const toggle = dropdown.querySelector('.dropdown-toggle');
        const content = dropdown.querySelector('.dropdown-content');
        
        if (toggle && content) {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                // 关闭其他所有下拉菜单
                document.querySelectorAll('.dropdown-content').forEach(c => {
                    if (c !== content) c.classList.remove('show');
                });
                content.classList.toggle('show');
            });
        }
    });
    
    // 点击外部关闭下拉菜单
    document.addEventListener('click', () => {
        document.querySelectorAll('.dropdown-content').forEach(c => {
            c.classList.remove('show');
        });
    });
    
    // 点击下拉菜单内部项也关闭
    document.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.dropdown-content').forEach(c => {
                c.classList.remove('show');
            });
        });
    });
}

// 初始化
document.addEventListener('DOMContentLoaded', init);

async function init() {
    await loadUsageData();
    await loadTags();
    await loadNotes();
    await loadViewModeSetting();
    await loadBookmarks();
    setupDropdowns();
    bindEvents();
    renderTagCloud();
    updateViewModeButtons();
    // 预加载导航页配置
    await initNavConfig();
    // 检查URL参数，处理从右键菜单传递的添加请求
    handleUrlParams();
}

// 从URL参数传递的分类ID（用于右键菜单选择分类后打开弹窗）
let urlParamMenuId = null;
let urlParamSubMenuId = null;

// 处理URL参数（从右键菜单传递）
function handleUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const addToNav = urlParams.get('addToNav');
    const url = urlParams.get('url');
    const title = urlParams.get('title');
    const openCloudBackup = urlParams.get('openCloudBackup');
    const menuId = urlParams.get('menuId');
    const subMenuId = urlParams.get('subMenuId');
    
    if (addToNav === 'true' && url) {
        // 保存URL参数中的分类ID
        urlParamMenuId = menuId || null;
        urlParamSubMenuId = subMenuId || null;
        
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
    
    // 处理打开云备份设置的请求
    if (openCloudBackup === 'true') {
        // 延迟显示云备份弹窗，等待页面完全加载
        setTimeout(() => {
            showCloudBackupModal();
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
    
    // 如果已有服务器地址，自动加载分类并恢复选择
    if (navServerUrl) {
        await loadNavMenus();
        // 优先使用URL参数中的分类（用户在右键菜单选择的分类）
        const targetMenuId = urlParamMenuId || lastSelectedMenuId;
        const targetSubMenuId = urlParamSubMenuId || lastSelectedSubMenuId;
        
        if (targetMenuId) {
            document.getElementById('navMenuSelect').value = targetMenuId;
            onMenuSelectChange();
            if (targetSubMenuId) {
                document.getElementById('navSubMenuSelect').value = targetSubMenuId;
            }
        }
        
        // 使用后清除URL参数中的分类ID
        urlParamMenuId = null;
        urlParamSubMenuId = null;
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

// ==================== 标签管理功能 ====================

// 按文件夹为书签打标签
async function tagBookmarksByFolder() {
    const allBookmarksList = [];
    collectAllBookmarks(allBookmarks, allBookmarksList);
    
    let taggedCount = 0;
    for (const bookmark of allBookmarksList) {
        const folderTags = extractTagsFromFolderPath(bookmark);
        if (folderTags.length > 0) {
            const currentTags = bookmarkTags.get(bookmark.id) || [];
            const newTags = [...new Set([...currentTags, ...folderTags])];
            bookmarkTags.set(bookmark.id, newTags);
            folderTags.forEach(t => allTags.add(t));
            taggedCount++;
        }
    }
    
    if (taggedCount > 0) {
        await saveTags();
        renderTagCloud();
        renderBookmarkList();
        alert(`成功根据文件夹为 ${taggedCount} 个书签添加了标签`);
    }
}

// 重新生成所有标签
async function regenerateAllTags() {
    if (!confirm('确定要清除现有标签并重新生成吗？\n这将根据书签的文件夹、标题和内容自动生成新标签。')) return;
    await executeAutoTag(true);
}

// 清除所有标签
async function clearAllTags() {
    if (!confirm('确定要清除所有书签的标签吗？此操作无法撤销。')) return;
    bookmarkTags.clear();
    allTags.clear();
    await saveTags();
    renderTagCloud();
    renderBookmarkList();
    alert('已清除所有标签');
}
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

// ==================== 智能标签生成系统（增强版） ====================

// 扩展的域名标签映射（200+网站）
const DOMAIN_TAG_MAP = {
    // 开发技术
    'github.com': ['开发', '代码'], 'gitlab.com': ['开发', '代码'], 'bitbucket.org': ['开发', '代码'],
    'gitee.com': ['开发', '代码'], 'coding.net': ['开发', '代码'],
    'stackoverflow.com': ['技术', '问答'], 'stackexchange.com': ['技术', '问答'],
    'npmjs.com': ['开发', '工具'], 'pypi.org': ['开发', '工具'], 'maven.org': ['开发', '工具'],
    'docker.com': ['开发', '容器'], 'kubernetes.io': ['开发', '容器'],
    'juejin.cn': ['技术', '博客'], 'csdn.net': ['技术', '博客'], 'cnblogs.com': ['技术', '博客'],
    'segmentfault.com': ['技术', '问答'], 'oschina.net': ['技术', '开源'],
    'dev.to': ['技术', '博客'], 'hashnode.com': ['技术', '博客'], 'hackernews.com': ['技术', '资讯'],
    'codepen.io': ['开发', '代码'], 'jsfiddle.net': ['开发', '代码'], 'codesandbox.io': ['开发', '代码'],
    'developer.mozilla.org': ['开发', '文档'], 'w3schools.com': ['开发', '教程'], 'runoob.com': ['开发', '教程'],
    'leetcode.com': ['开发', '算法'], 'hackerrank.com': ['开发', '算法'], 'codeforces.com': ['开发', '算法'],
    'vercel.com': ['开发', '部署'], 'netlify.com': ['开发', '部署'], 'heroku.com': ['开发', '部署'],
    'rust-lang.org': ['开发', '语言'], 'golang.org': ['开发', '语言'], 'python.org': ['开发', '语言'],
    'nodejs.org': ['开发', '语言'], 'typescriptlang.org': ['开发', '语言'],
    
    // 视频娱乐
    'youtube.com': ['视频', '娱乐'], 'bilibili.com': ['视频', '娱乐'], 'youku.com': ['视频', '娱乐'],
    'iqiyi.com': ['视频', '娱乐'], 'v.qq.com': ['视频', '娱乐'], 'mgtv.com': ['视频', '娱乐'],
    'twitch.tv': ['直播', '游戏'], 'douyu.com': ['直播', '游戏'], 'huya.com': ['直播', '游戏'],
    'netflix.com': ['影视', '订阅'], 'disneyplus.com': ['影视', '订阅'], 'hbomax.com': ['影视', '订阅'],
    'primevideo.com': ['影视', '订阅'], 'hulu.com': ['影视', '订阅'],
    'vimeo.com': ['视频', '创作'], 'dailymotion.com': ['视频'],
    
    // 社交媒体
    'twitter.com': ['社交'], 'x.com': ['社交'], 'facebook.com': ['社交'],
    'instagram.com': ['社交', '图片'], 'linkedin.com': ['职场', '社交'], 'weibo.com': ['社交'],
    'douban.com': ['社区', '影评'], 'xiaohongshu.com': ['社交', '种草'], 'tiktok.com': ['短视频'],
    'reddit.com': ['社区', '论坛'], 'v2ex.com': ['社区', '技术'], 'discord.com': ['社区', '聊天'],
    'telegram.org': ['通讯'], 'slack.com': ['协作', '通讯'], 'teams.microsoft.com': ['协作', '通讯'],
    'tieba.baidu.com': ['社区', '论坛'], 'nga.cn': ['社区', '游戏'],
    
    // 购物电商
    'taobao.com': ['购物'], 'tmall.com': ['购物'], 'jd.com': ['购物'],
    'amazon.com': ['购物'], 'amazon.cn': ['购物'], 'ebay.com': ['购物'],
    'pinduoduo.com': ['购物'], 'suning.com': ['购物'], 'dangdang.com': ['购物', '图书'],
    'vip.com': ['购物'], 'kaola.com': ['购物', '海淘'], 'smzdm.com': ['购物', '优惠'],
    
    // 知识学习
    'zhihu.com': ['问答', '知识'], 'quora.com': ['问答', '知识'],
    'wikipedia.org': ['百科'], 'baike.baidu.com': ['百科'],
    'coursera.org': ['学习', '课程'], 'udemy.com': ['学习', '课程'], 'edx.org': ['学习', '课程'],
    'mooc.cn': ['学习', '课程'], 'icourse163.org': ['学习', '课程'], 'xuetangx.com': ['学习', '课程'],
    'khanacademy.org': ['学习', '教育'], 'duolingo.com': ['学习', '语言'],
    'ted.com': ['学习', '演讲'], 'skillshare.com': ['学习', '技能'],
    
    // 设计创意
    'figma.com': ['设计', '工具'], 'sketch.com': ['设计', '工具'], 'canva.com': ['设计', '工具'],
    'adobe.com': ['设计', '工具'], 'photopea.com': ['设计', '工具'],
    'dribbble.com': ['设计', '灵感'], 'behance.net': ['设计', '灵感'], 'pinterest.com': ['灵感', '图片'],
    'unsplash.com': ['图片', '素材'], 'pexels.com': ['图片', '素材'], 'pixabay.com': ['图片', '素材'],
    'iconfont.cn': ['设计', '图标'], 'flaticon.com': ['设计', '图标'],
    'coolors.co': ['设计', '配色'], 'colorhunt.co': ['设计', '配色'],
    
    // 工具效率
    'notion.so': ['笔记', '效率'], 'evernote.com': ['笔记'], 'onenote.com': ['笔记'],
    'obsidian.md': ['笔记', '知识库'], 'roamresearch.com': ['笔记', '知识库'],
    'trello.com': ['项目', '看板'], 'asana.com': ['项目', '协作'], 'monday.com': ['项目', '协作'],
    'airtable.com': ['数据库', '协作'], 'coda.io': ['文档', '协作'],
    'google.com': ['搜索'], 'baidu.com': ['搜索'], 'bing.com': ['搜索'], 'duckduckgo.com': ['搜索', '隐私'],
    'translate.google.com': ['翻译'], 'deepl.com': ['翻译'], 'fanyi.baidu.com': ['翻译'],
    'grammarly.com': ['写作', '工具'], 'hemingwayapp.com': ['写作', '工具'],
    
    // 音乐音频
    'spotify.com': ['音乐'], 'music.163.com': ['音乐'], 'music.qq.com': ['音乐'],
    'kugou.com': ['音乐'], 'kuwo.cn': ['音乐'], 'soundcloud.com': ['音乐'],
    'music.apple.com': ['音乐'], 'tidal.com': ['音乐'],
    'ximalaya.com': ['播客', '音频'], 'lizhi.fm': ['播客', '音频'],
    
    // 新闻资讯
    'news.qq.com': ['新闻'], 'news.sina.com.cn': ['新闻'], 'thepaper.cn': ['新闻'],
    'bbc.com': ['新闻', '国际'], 'cnn.com': ['新闻', '国际'], 'reuters.com': ['新闻', '国际'],
    'nytimes.com': ['新闻', '国际'], 'wsj.com': ['新闻', '财经'],
    '36kr.com': ['科技', '创业'], 'techcrunch.com': ['科技', '创业'], 'wired.com': ['科技'],
    'huxiu.com': ['科技', '商业'], 'geekpark.net': ['科技'],
    'toutiao.com': ['资讯'], 'ifeng.com': ['新闻'],
    
    // 云服务
    'aws.amazon.com': ['云服务'], 'cloud.google.com': ['云服务'], 'azure.microsoft.com': ['云服务'],
    'aliyun.com': ['云服务'], 'cloud.tencent.com': ['云服务'], 'huaweicloud.com': ['云服务'],
    'digitalocean.com': ['云服务'], 'linode.com': ['云服务'], 'vultr.com': ['云服务'],
    
    // AI工具
    'openai.com': ['AI'], 'chat.openai.com': ['AI', '聊天'], 'claude.ai': ['AI', '聊天'],
    'bard.google.com': ['AI', '聊天'], 'copilot.microsoft.com': ['AI', '编程'],
    'midjourney.com': ['AI', '绘画'], 'stability.ai': ['AI', '绘画'], 'leonardo.ai': ['AI', '绘画'],
    'huggingface.co': ['AI', '模型'], 'replicate.com': ['AI', '模型'],
    'runway.ml': ['AI', '视频'], 'elevenlabs.io': ['AI', '语音'],
    'perplexity.ai': ['AI', '搜索'], 'you.com': ['AI', '搜索'],
    
    // 游戏
    'steam.com': ['游戏', '平台'], 'steampowered.com': ['游戏', '平台'],
    'epicgames.com': ['游戏', '平台'], 'gog.com': ['游戏', '平台'],
    'itch.io': ['游戏', '独立'], 'indiedb.com': ['游戏', '独立'],
    'playstation.com': ['游戏', '主机'], 'xbox.com': ['游戏', '主机'], 'nintendo.com': ['游戏', '主机'],
    
    // 博客平台
    'medium.com': ['博客', '阅读'], 'wordpress.com': ['博客'], 'substack.com': ['博客', '订阅'],
    'ghost.org': ['博客'], 'typecho.org': ['博客'], 'hexo.io': ['博客', '静态'],
    
    // 金融理财
    'xueqiu.com': ['投资', '股票'], 'eastmoney.com': ['投资', '财经'],
    'investing.com': ['投资', '财经'], 'tradingview.com': ['投资', '图表'],
    'coinmarketcap.com': ['加密货币'], 'coingecko.com': ['加密货币'],
    
    // 政府教育
    'gov.cn': ['政府'], 'edu.cn': ['教育']
};

// 路径关键词映射
const PATH_KEYWORDS = {
    '/doc': '文档', '/docs': '文档', '/documentation': '文档', '/wiki': '文档',
    '/api': 'API', '/reference': '参考', '/spec': '规范',
    '/blog': '博客', '/article': '文章', '/post': '文章', '/news': '新闻',
    '/tool': '工具', '/tools': '工具', '/utility': '工具', '/app': '应用',
    '/download': '下载', '/release': '下载', '/releases': '下载',
    '/learn': '学习', '/tutorial': '教程', '/guide': '指南', '/course': '课程', '/lesson': '课程',
    '/video': '视频', '/watch': '视频', '/play': '播放',
    '/shop': '购物', '/store': '商店', '/product': '产品', '/buy': '购买',
    '/forum': '论坛', '/community': '社区', '/discuss': '讨论', '/bbs': '论坛',
    '/dashboard': '控制台', '/admin': '管理', '/console': '控制台', '/panel': '面板',
    '/pricing': '定价', '/plan': '方案', '/subscribe': '订阅',
    '/login': '登录', '/signup': '注册', '/auth': '认证', '/account': '账户',
    '/search': '搜索', '/explore': '探索', '/discover': '发现',
    '/settings': '设置', '/config': '配置', '/preference': '偏好',
    '/help': '帮助', '/support': '支持', '/faq': '常见问题',
    '/opensource': '开源', '/open-source': '开源'
};

// 标题/内容关键词映射（中英文）
const CONTENT_KEYWORDS = {
    // 技术开发
    '文档': '文档', 'documentation': '文档', 'docs': '文档', 'manual': '手册', '手册': '手册',
    'api': 'API', '接口': 'API', 'sdk': 'SDK',
    '教程': '教程', 'tutorial': '教程', 'guide': '指南', '指南': '指南', 'getting started': '入门',
    '工具': '工具', 'tool': '工具', 'utility': '工具', 'toolkit': '工具包',
    '官网': '官网', 'official': '官网', 'home': '首页', '首页': '首页',
    '开源': '开源', 'open source': '开源', 'opensource': '开源', 'oss': '开源',
    '框架': '框架', 'framework': '框架', '库': '库', 'library': '库',
    '插件': '插件', 'plugin': '插件', 'extension': '扩展', 'addon': '插件',
    '模板': '模板', 'template': '模板', 'theme': '主题', '主题': '主题',
    
    // 内容类型
    '视频': '视频', 'video': '视频', 'watch': '视频', '播放': '视频',
    '音乐': '音乐', 'music': '音乐', 'song': '音乐', '歌曲': '音乐',
    '图片': '图片', 'image': '图片', 'photo': '图片', 'gallery': '图库', '相册': '图库',
    '新闻': '新闻', 'news': '新闻', '资讯': '资讯', '快讯': '新闻',
    '博客': '博客', 'blog': '博客', '日志': '博客', '随笔': '博客',
    '论坛': '论坛', 'forum': '论坛', 'bbs': '论坛', '社区': '社区', 'community': '社区',
    
    // 功能类型
    '下载': '下载', 'download': '下载', '安装': '安装', 'install': '安装',
    '在线': '在线', 'online': '在线', '免费': '免费', 'free': '免费',
    '登录': '登录', 'login': '登录', 'signin': '登录', '注册': '注册', 'register': '注册', 'signup': '注册',
    '购买': '购物', 'buy': '购物', 'purchase': '购物', '商城': '购物', 'shop': '购物', 'store': '商店',
    
    // AI相关
    'ai': 'AI', '人工智能': 'AI', 'artificial intelligence': 'AI',
    'chatgpt': 'AI', 'gpt': 'AI', 'llm': 'AI', '大模型': 'AI',
    '机器学习': 'AI', 'machine learning': 'AI', 'ml': 'AI',
    '深度学习': 'AI', 'deep learning': 'AI', 'neural': 'AI',
    
    // 其他
    '游戏': '游戏', 'game': '游戏', 'gaming': '游戏', '电竞': '游戏',
    '电影': '影视', 'movie': '影视', 'film': '影视', '剧集': '影视', 'tv': '影视',
    '学习': '学习', 'learn': '学习', 'course': '课程', 'education': '教育', '教育': '教育',
    '投资': '投资', 'invest': '投资', '理财': '理财', 'finance': '金融', '金融': '金融',
    '设计': '设计', 'design': '设计', 'ui': '设计', 'ux': '设计',
    '效率': '效率', 'productivity': '效率', '协作': '协作', 'collaboration': '协作'
};

// 子域名标签映射
const SUBDOMAIN_TAGS = {
    'docs': '文档', 'doc': '文档', 'api': 'API', 'developer': '开发',
    'blog': '博客', 'news': '新闻', 'shop': '购物', 'store': '商店',
    'app': '应用', 'dev': '开发', 'admin': '管理', 'dashboard': '控制台',
    'learn': '学习', 'edu': '教育', 'help': '帮助', 'support': '支持',
    'community': '社区', 'forum': '论坛', 'status': '状态', 'cdn': 'CDN',
    'cloud': '云服务', 'console': '控制台', 'portal': '门户', 'my': '个人',
    'mail': '邮箱', 'drive': '网盘', 'music': '音乐', 'video': '视频'
};

// 系统文件夹名称（不作为标签）
const SYSTEM_FOLDER_NAMES = [
    '书签栏', '其他书签', 'bookmarks bar', 'other bookmarks', 
    'bookmarks', '收藏夹', 'favorites', '移动设备书签',
    'mobile bookmarks', '根目录', ''
];

// 无意义的标题词（需要过滤）
const NOISE_WORDS = [
    '首页', '官网', '官方', '网站', '平台', '系统', '中心', '在线',
    'home', 'index', 'welcome', 'official', 'website', 'platform',
    '|', '-', '–', '—', '_', '·', '/', '\\', ':', '：',
    'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'at', 'by', 'with'
];

// ==================== 标准标签库（约60个标准标签） ====================
// 所有自动生成的标签都必须映射到这个库中的标签，确保标签数量可控

const STANDARD_TAGS = {
    // 开发技术（10个）
    '开发': ['development', 'dev', 'develop', 'coding', 'programming', '软件开发', '程序开发', '编程', 'code', 'source', '源码', '代码'],
    '前端': ['frontend', 'front-end', 'front end', '前端开发', 'web前端', 'fe', 'html', 'css', 'javascript', 'js'],
    '后端': ['backend', 'back-end', 'back end', '后端开发', '服务端', 'be', 'server'],
    '文档': ['docs', 'doc', 'documentation', '手册', 'manual', 'reference', '参考', 'wiki', 'api', '接口'],
    '教程': ['tutorial', 'tutorials', 'guide', 'guides', '指南', '入门', 'getting started', 'learn', 'learning', '学习'],
    '工具': ['tool', 'tools', 'utility', 'utilities', '实用工具', '在线工具'],
    '开源': ['opensource', 'open source', 'open-source', 'github', 'gitlab', 'gitee'],
    '算法': ['algorithm', 'algorithms', '数据结构', 'leetcode', '刷题', 'coding'],
    '部署': ['deploy', 'deployment', '部署', 'devops', 'ci', 'cd', 'docker', 'kubernetes'],
    '数据库': ['database', 'db', 'sql', 'mysql', 'mongodb', 'redis', '数据库'],
    
    // 内容类型（8个）
    '视频': ['video', 'videos', '影片', '短片', 'watch', '播放', '直播', 'live', 'stream'],
    '音乐': ['music', '歌曲', 'song', 'songs', '音频', 'audio', '播客', 'podcast'],
    '图片': ['image', 'images', 'photo', 'photos', '照片', '图像', 'picture', 'gallery', '图库'],
    '文章': ['article', 'articles', 'post', 'posts', '帖子', 'blog', 'blogs', '博客', '日志'],
    '新闻': ['news', '资讯', '快讯', '头条', '新闻'],
    '影视': ['movie', 'movies', 'film', 'films', '电影', '电视剧', 'tv', '剧集', '动漫', 'anime'],
    '电子书': ['ebook', 'book', 'books', '图书', '书籍', '阅读', 'reading', 'kindle'],
    '素材': ['resource', 'resources', 'asset', 'assets', '资源', '模板', 'template'],
    
    // 平台类型（8个）
    '购物': ['shopping', 'shop', 'store', '商城', '电商', 'ecommerce', 'e-commerce', '淘宝', '京东', '购买'],
    '社交': ['social', '社交媒体', 'sns', '微博', 'twitter', 'facebook', '朋友圈'],
    '社区': ['community', 'forum', 'bbs', '论坛', '讨论区', '贴吧'],
    '游戏': ['game', 'games', 'gaming', '电竞', 'esports', 'steam', '游戏'],
    '云服务': ['cloud', '云服务', '云计算', 'aws', 'azure', 'aliyun', '阿里云', '腾讯云'],
    '金融': ['finance', 'financial', '金融', '投资', 'invest', '理财', '股票', 'stock', '基金'],
    '政府': ['gov', 'government', '政府', '政务'],
    '教育': ['edu', 'education', '教育', '学校', 'university', '大学', '课程', 'course'],
    
    // AI相关（2个）
    'AI': ['ai', '人工智能', 'artificial intelligence', 'ml', 'machine learning', '机器学习', 'deep learning', '深度学习', 'chatgpt', 'gpt', 'llm', '大模型', 'claude', 'midjourney'],
    '数据': ['data', '数据分析', 'analytics', 'bi', '大数据', 'bigdata'],
    
    // 设计相关（4个）
    '设计': ['design', 'ui', 'ux', 'ui/ux', '界面设计', '交互设计', '平面设计', 'graphic'],
    '图标': ['icon', 'icons', '图标库', 'iconfont', 'emoji'],
    '配色': ['color', 'colors', '配色', '颜色', 'palette'],
    '字体': ['font', 'fonts', '字体', 'typography'],
    
    // 效率工具（6个）
    '效率': ['productivity', '生产力', '提效', '效率工具'],
    '笔记': ['note', 'notes', '记录', '备忘', 'notion', 'evernote', '印象笔记'],
    '协作': ['collaboration', 'collaborate', '团队协作', '合作', 'teamwork'],
    '项目': ['project', 'projects', '项目管理', 'task', 'tasks', '任务'],
    '日历': ['calendar', '日历', '日程', 'schedule'],
    '邮箱': ['email', 'mail', '邮箱', '邮件', 'gmail', 'outlook'],
    
    // 生活服务（6个）
    '地图': ['map', 'maps', '地图', '导航', 'navigation', '位置'],
    '天气': ['weather', '天气', '气象'],
    '外卖': ['food', 'delivery', '外卖', '美食', '餐饮'],
    '出行': ['travel', 'trip', '出行', '旅行', '机票', '酒店', 'hotel', 'flight'],
    '健康': ['health', 'fitness', '健康', '运动', '医疗', 'medical'],
    '招聘': ['job', 'jobs', 'career', '招聘', '求职', '工作', 'hr'],
    
    // 其他（6个）
    '搜索': ['search', '搜索', '查找', '检索', 'google', 'baidu', 'bing'],
    '翻译': ['translate', 'translation', '翻译', '翻译器', 'deepl'],
    '网盘': ['drive', 'storage', '网盘', '云盘', '存储', 'dropbox'],
    '安全': ['security', '安全', '隐私', 'privacy', 'vpn', '加密'],
    '浏览器': ['browser', '浏览器', 'chrome', 'firefox', 'edge', '扩展', 'extension'],
    '百科': ['wiki', 'wikipedia', '百科', '知识', 'knowledge']
};

// 将标准标签库转换为快速查找映射
const TAG_LOOKUP = new Map();
for (const [standard, synonyms] of Object.entries(STANDARD_TAGS)) {
    TAG_LOOKUP.set(standard.toLowerCase(), standard);
    for (const syn of synonyms) {
        TAG_LOOKUP.set(syn.toLowerCase(), standard);
    }
}

// 规范化标签（只返回标准标签库中的标签）
function normalizeTag(tag) {
    if (!tag) return null;
    
    const lowerTag = tag.toLowerCase().trim();
    
    // 精确匹配
    if (TAG_LOOKUP.has(lowerTag)) {
        return TAG_LOOKUP.get(lowerTag);
    }
    
    // 部分匹配（标签包含关键词）
    for (const [keyword, standard] of TAG_LOOKUP.entries()) {
        if (keyword.length >= 3 && lowerTag.includes(keyword)) {
            return standard;
        }
    }
    
    // 无法映射到标准标签，返回null（将被过滤）
    return null;
}

// 验证标签是否为标准标签
function isValidTag(tag) {
    if (!tag) return false;
    // 只接受标准标签库中的标签
    return Object.keys(STANDARD_TAGS).includes(tag);
}

// 处理标签列表：规范化到标准标签 + 去重
function processTagList(tags) {
    const processed = new Set();
    
    for (const tag of tags) {
        // 规范化到标准标签
        const normalized = normalizeTag(tag);
        
        // 只保留标准标签
        if (normalized && isValidTag(normalized)) {
            processed.add(normalized);
        }
    }
    
    // 返回去重后的标准标签，最多3个
    return Array.from(processed).slice(0, 3);
}

// 从文件夹路径提取标签
function extractTagsFromFolderPath(bookmark) {
    const tags = [];
    
    // 递归查找书签所在的文件夹路径
    function findPath(nodes, targetId, path = []) {
        for (const node of nodes) {
            if (node.id === targetId) {
                return path;
            }
            if (node.children) {
                const newPath = node.title ? [...path, node.title] : path;
                const result = findPath(node.children, targetId, newPath);
                if (result) return result;
            }
        }
        return null;
    }
    
    const folderPath = findPath(allBookmarks, bookmark.id) || [];
    
    // 过滤系统文件夹名称，提取有意义的文件夹名作为标签
    for (const folderName of folderPath) {
        const cleanName = folderName.trim();
        if (cleanName && !SYSTEM_FOLDER_NAMES.some(sys => 
            cleanName.toLowerCase() === sys.toLowerCase()
        )) {
            // 文件夹名称可能包含多个词，尝试拆分
            const parts = cleanName.split(/[\s\-_\/\\|·]+/).filter(p => p.length > 0);
            for (const part of parts) {
                if (part.length >= 2 && part.length <= 10) {
                    tags.push(part);
                }
            }
            // 也保留完整的文件夹名（如果不太长）
            if (cleanName.length >= 2 && cleanName.length <= 8) {
                tags.push(cleanName);
            }
        }
    }
    
    return [...new Set(tags)]; // 去重
}

// 从标题提取关键词
function extractKeywordsFromTitle(title) {
    if (!title) return [];
    
    const keywords = [];
    
    // 清理标题：移除常见分隔符两边的内容，保留核心部分
    let cleanTitle = title
        .replace(/[\|\-–—_·]+/g, ' ')  // 替换分隔符为空格
        .replace(/\s+/g, ' ')           // 合并多个空格
        .trim();
    
    // 移除无意义词
    const lowerTitle = cleanTitle.toLowerCase();
    for (const noise of NOISE_WORDS) {
        if (typeof noise === 'string' && noise.length > 1) {
            cleanTitle = cleanTitle.replace(new RegExp(`\\b${noise}\\b`, 'gi'), ' ');
        }
    }
    cleanTitle = cleanTitle.replace(/\s+/g, ' ').trim();
    
    // 提取中文词汇（2-6个字的连续中文）
    const chineseMatches = cleanTitle.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
    keywords.push(...chineseMatches);
    
    // 提取英文单词（首字母大写的词可能是品牌/产品名）
    const englishMatches = cleanTitle.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
    keywords.push(...englishMatches.filter(w => w.length >= 3 && w.length <= 15));
    
    // 提取全大写缩写（如 API, SDK, AI）
    const acronyms = cleanTitle.match(/\b[A-Z]{2,5}\b/g) || [];
    keywords.push(...acronyms);
    
    return [...new Set(keywords)];
}

// 自动生成标签（基于URL、标题和文件夹）- 增强版
function autoGenerateTags(bookmark) {
    const tags = new Set();
    
    try {
        // ========== 1. 文件夹名称（最高优先级） ==========
        const folderTags = extractTagsFromFolderPath(bookmark);
        folderTags.slice(0, 2).forEach(t => tags.add(t)); // 最多取2个文件夹标签
        
        // ========== 2. 标题关键词分析 ==========
        const titleKeywords = extractKeywordsFromTitle(bookmark.title);
        
        // 检查标题关键词是否匹配已知分类
        const title = (bookmark.title || '').toLowerCase();
        for (const [keyword, tag] of Object.entries(CONTENT_KEYWORDS)) {
            if (title.includes(keyword.toLowerCase())) {
                tags.add(tag);
                if (tags.size >= 4) break;
            }
        }
        
        // 如果标题中有有意义的关键词，添加为标签
        for (const kw of titleKeywords) {
            if (kw.length >= 2 && kw.length <= 8 && tags.size < 4) {
                // 检查是否是无意义词
                const isNoise = NOISE_WORDS.some(n => 
                    kw.toLowerCase() === n.toLowerCase()
                );
                if (!isNoise) {
                    tags.add(kw);
                }
            }
        }
        
        // ========== 3. 域名匹配 ==========
        const url = new URL(bookmark.url);
        const domain = url.hostname.replace(/^www\./, '');
        const pathname = url.pathname.toLowerCase();
        
        // 精确域名匹配
        for (const [site, siteTags] of Object.entries(DOMAIN_TAG_MAP)) {
            if (domain === site || domain.endsWith('.' + site)) {
                siteTags.forEach(t => {
                    if (tags.size < 4) tags.add(t);
                });
                break;
            }
        }
        
        // 模糊域名匹配（如果还没有足够标签）
        if (tags.size < 2) {
            for (const [site, siteTags] of Object.entries(DOMAIN_TAG_MAP)) {
                const siteName = site.split('.')[0];
                if (domain.includes(siteName) && siteName.length > 3) {
                    siteTags.forEach(t => {
                        if (tags.size < 4) tags.add(t);
                    });
                    break;
                }
            }
        }
        
        // ========== 4. 子域名分析 ==========
        const subdomains = domain.split('.');
        if (subdomains.length > 2 && tags.size < 4) {
            const subdomain = subdomains[0];
            if (SUBDOMAIN_TAGS[subdomain]) {
                tags.add(SUBDOMAIN_TAGS[subdomain]);
            }
        }
        
        // ========== 5. 路径关键词匹配 ==========
        if (tags.size < 4) {
            for (const [path, tag] of Object.entries(PATH_KEYWORDS)) {
                if (pathname.includes(path)) {
                    tags.add(tag);
                    if (tags.size >= 4) break;
                }
            }
        }
        
        // ========== 6. 特殊域名后缀分析 ==========
        if (tags.size < 4) {
            if (domain.endsWith('.gov') || domain.endsWith('.gov.cn')) tags.add('政府');
            else if (domain.endsWith('.edu') || domain.endsWith('.edu.cn')) tags.add('教育');
            else if (domain.endsWith('.org')) tags.add('组织');
        }
        
    } catch (e) {
        console.warn('标签生成失败:', e);
    }
    
    // 规范化到标准标签库，返回最多2个标签
    const rawTags = Array.from(tags);
    const processedTags = processTagList(rawTags);
    return processedTags.slice(0, 2);
}

// 批量自动标签（增强版）
async function autoTagAllBookmarks() {
    // 显示模式选择弹窗
    const noTagCount = countNoTagBookmarks();
    const allBookmarksList = [];
    collectAllBookmarks(allBookmarks, allBookmarksList);
    const totalCount = allBookmarksList.length;
    const hasTagCount = totalCount - noTagCount;
    
    // 创建选择弹窗
    const modeDiv = document.createElement('div');
    modeDiv.id = 'autoTagModeSelect';
    modeDiv.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;';
    modeDiv.innerHTML = `
        <div style="background: white; border-radius: 12px; padding: 24px; max-width: 400px; width: 90%;">
            <div style="font-size: 18px; font-weight: 600; margin-bottom: 16px;">🏷️ 自动标签模式</div>
            <div style="margin-bottom: 20px;">
                <label style="display: flex; align-items: flex-start; gap: 12px; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; cursor: pointer; margin-bottom: 12px; transition: all 0.2s;" id="modeOnlyNew">
                    <input type="radio" name="autoTagMode" value="onlyNew" checked style="margin-top: 4px;">
                    <div>
                        <div style="font-weight: 500;">仅无标签书签</div>
                        <div style="font-size: 13px; color: #666; margin-top: 4px;">只为没有标签的 ${noTagCount} 个书签生成标签，保留已有标签</div>
                    </div>
                </label>
                <label style="display: flex; align-items: flex-start; gap: 12px; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; cursor: pointer; transition: all 0.2s;" id="modeRegenerate">
                    <input type="radio" name="autoTagMode" value="regenerate" style="margin-top: 4px;">
                    <div>
                        <div style="font-weight: 500;">全部重新生成</div>
                        <div style="font-size: 13px; color: #666; margin-top: 4px;">清除所有现有标签，为全部 ${totalCount} 个书签重新生成</div>
                        <div style="font-size: 12px; color: #dc2626; margin-top: 4px;">⚠️ 将覆盖 ${hasTagCount} 个已有标签的书签</div>
                    </div>
                </label>
            </div>
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button class="btn btn-secondary" id="btnCancelAutoTag">取消</button>
                <button class="btn btn-primary" id="btnStartAutoTag">开始</button>
            </div>
        </div>
    `;
    document.body.appendChild(modeDiv);
    
    // 高亮选中的选项
    const updateSelection = () => {
        const onlyNew = document.getElementById('modeOnlyNew');
        const regenerate = document.getElementById('modeRegenerate');
        const onlyNewRadio = onlyNew.querySelector('input');
        const regenerateRadio = regenerate.querySelector('input');
        
        onlyNew.style.borderColor = onlyNewRadio.checked ? '#667eea' : '#e0e0e0';
        onlyNew.style.background = onlyNewRadio.checked ? '#f0f4ff' : 'white';
        regenerate.style.borderColor = regenerateRadio.checked ? '#667eea' : '#e0e0e0';
        regenerate.style.background = regenerateRadio.checked ? '#f0f4ff' : 'white';
    };
    
    document.querySelectorAll('input[name="autoTagMode"]').forEach(radio => {
        radio.addEventListener('change', updateSelection);
    });
    updateSelection();
    
    // 等待用户选择
    return new Promise((resolve) => {
        document.getElementById('btnCancelAutoTag').addEventListener('click', () => {
            modeDiv.remove();
            resolve();
        });
        
        document.getElementById('btnStartAutoTag').addEventListener('click', async () => {
            const mode = document.querySelector('input[name="autoTagMode"]:checked').value;
            modeDiv.remove();
            
            // 执行自动标签
            await executeAutoTag(mode === 'regenerate');
            resolve();
        });
    });
}

// 执行自动标签
async function executeAutoTag(regenerateAll = false) {
    const allBookmarksList = [];
    collectAllBookmarks(allBookmarks, allBookmarksList);
    
    // 排除热门书签等快捷方式文件夹中的副本书签
    const normalBookmarks = allBookmarksList.filter(b => !isInShortcutFolder(b));
    
    // 如果是全部重新生成，先清除所有标签
    if (regenerateAll) {
        bookmarkTags.clear();
        allTags.clear();
    }
    
    // 统计信息
    let taggedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    
    // 显示进度
    const total = normalBookmarks.length;
    const progressDiv = document.createElement('div');
    progressDiv.id = 'autoTagProgress';
    progressDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 24px 32px; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); z-index: 10000; text-align: center; min-width: 300px;';
    progressDiv.innerHTML = `
        <div style="font-size: 16px; font-weight: 600; margin-bottom: 16px;">🏷️ ${regenerateAll ? '正在重新生成标签...' : '正在自动标签...'}</div>
        <div style="background: #e0e0e0; border-radius: 8px; height: 8px; overflow: hidden; margin-bottom: 12px;">
            <div id="autoTagProgressBar" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); height: 100%; width: 0%; transition: width 0.3s;"></div>
        </div>
        <div id="autoTagProgressText" style="font-size: 14px; color: #666;">0 / ${total}</div>
    `;
    document.body.appendChild(progressDiv);
    
    const progressBar = document.getElementById('autoTagProgressBar');
    const progressText = document.getElementById('autoTagProgressText');
    
    for (let i = 0; i < normalBookmarks.length; i++) {
        const bookmark = normalBookmarks[i];
        
        // 更新进度
        const percent = Math.round((i + 1) / total * 100);
        progressBar.style.width = percent + '%';
        progressText.textContent = `${i + 1} / ${total}`;
        
        // 如果不是重新生成模式，且已有标签，跳过
        if (!regenerateAll && bookmarkTags.has(bookmark.id) && bookmarkTags.get(bookmark.id).length > 0) {
            skippedCount++;
            continue;
        }
        
        try {
            const suggestedTags = autoGenerateTags(bookmark);
            if (suggestedTags.length > 0) {
                bookmarkTags.set(bookmark.id, suggestedTags);
                suggestedTags.forEach(tag => allTags.add(tag));
                taggedCount++;
            } else {
                failedCount++;
            }
        } catch (e) {
            failedCount++;
        }
        
        // 每处理50个书签，让UI有机会更新
        if (i % 50 === 0) {
            await new Promise(r => setTimeout(r, 10));
        }
    }
    
    // 移除进度条
    progressDiv.remove();
    
    if (taggedCount > 0) {
        await saveTags();
        renderTagCloud();
        renderBookmarkList();
    }
    
    // 显示结果弹窗
    showAutoTagResult(taggedCount, skippedCount, failedCount, regenerateAll);
}

// 显示自动标签结果弹窗
function showAutoTagResult(taggedCount, skippedCount, failedCount, isRegenerate = false) {
    const resultList = document.getElementById('resultList');
    document.getElementById('resultTitle').textContent = isRegenerate ? '🏷️ 重新生成标签结果' : '🏷️ 自动标签结果';
    
    const noTagCount = countNoTagBookmarks();
    
    let html = `
        <div style="padding: 16px;">
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 12px 16px; font-size: 14px; margin-bottom: 20px;">
                <div style="font-size: 24px;">✅</div>
                <div>
                    <div style="font-weight: 600; color: #059669;">${isRegenerate ? '重新生成' : '成功标签'}</div>
                    <div style="color: #666;">${taggedCount} 个书签</div>
                </div>
                
                ${!isRegenerate ? `
                <div style="font-size: 24px;">⏭️</div>
                <div>
                    <div style="font-weight: 600; color: #6b7280;">已有标签跳过</div>
                    <div style="color: #666;">${skippedCount} 个书签</div>
                </div>
                ` : ''}
                
                <div style="font-size: 24px;">❌</div>
                <div>
                    <div style="font-weight: 600; color: #dc2626;">无法识别</div>
                    <div style="color: #666;">${failedCount} 个书签</div>
                </div>
            </div>
    `;
    
    if (noTagCount > 0) {
        html += `
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                <div style="font-weight: 600; color: #dc2626; margin-bottom: 8px;">📭 还有 ${noTagCount} 个书签没有标签</div>
                <div style="color: #666; font-size: 13px; margin-bottom: 12px;">
                    这些书签无法自动识别分类，需要手动添加标签。<br>
                    点击下方按钮可以筛选出这些书签，然后批量添加标签。
                </div>
                <button class="btn btn-primary" id="btnShowNoTagBookmarks" style="width: 100%;">
                    📭 查看无标签书签 (${noTagCount})
                </button>
            </div>
        `;
    } else {
        html += `
            <div style="background: #d1fae5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 16px; text-align: center;">
                <div style="font-size: 32px; margin-bottom: 8px;">🎉</div>
                <div style="font-weight: 600; color: #059669;">太棒了！所有书签都已有标签</div>
            </div>
        `;
    }
    
    html += '</div>';
    resultList.innerHTML = html;
    
    // 绑定查看无标签书签按钮
    const showNoTagBtn = document.getElementById('btnShowNoTagBookmarks');
    if (showNoTagBtn) {
        showNoTagBtn.addEventListener('click', () => {
            closeResultModal();
            // 切换到无标签筛选
            filterNoTag = true;
            currentTagFilters = [];
            renderTagCloud();
            renderBookmarkList();
        });
    }
    
    document.getElementById('resultModal').classList.add('active');
    hideResultFooterActions();
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

// 统计无标签书签数量
function countNoTagBookmarks() {
    const allBookmarksList = [];
    collectAllBookmarks(allBookmarks, allBookmarksList);
    return allBookmarksList.filter(b => {
        const tags = bookmarkTags.get(b.id);
        return !tags || tags.length === 0;
    }).length;
}

// 渲染标签云
function renderTagCloud() {
    const container = document.getElementById('tagCloud');
    const content = document.getElementById('tagCloudContent');
    
    if (!container || !content) return;
    
    // 统计无标签书签数量
    const noTagCount = countNoTagBookmarks();
    
    // 即使没有标签，如果有无标签书签也显示
    if (allTags.size === 0 && noTagCount === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    content.innerHTML = '';
    
    // 首先添加"无标签"筛选器（如果有无标签书签）
    if (noTagCount > 0) {
        const noTagEl = document.createElement('span');
        noTagEl.style.cssText = `
            display: inline-block;
            padding: 4px 10px;
            background: ${filterNoTag ? '#ef4444' : '#fef2f2'};
            color: ${filterNoTag ? 'white' : '#dc2626'};
            border-radius: 16px;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s;
            border: 1px solid ${filterNoTag ? '#dc2626' : '#fecaca'};
            margin-right: 8px;
        `;
        noTagEl.textContent = `📭 无标签 (${noTagCount})${filterNoTag ? ' ✓' : ''}`;
        noTagEl.title = filterNoTag ? '点击取消筛选无标签书签' : '点击筛选没有标签的书签，方便批量打标签';
        
        noTagEl.addEventListener('click', () => {
            filterNoTag = !filterNoTag;
            if (filterNoTag) {
                // 筛选无标签时清除其他标签筛选
                currentTagFilters = [];
            }
            renderTagCloud();
            renderBookmarkList();
        });
        
        noTagEl.addEventListener('mouseenter', () => {
            if (!filterNoTag) {
                noTagEl.style.background = '#fee2e2';
                noTagEl.style.transform = 'translateY(-2px)';
            }
        });
        
        noTagEl.addEventListener('mouseleave', () => {
            if (!filterNoTag) {
                noTagEl.style.background = '#fef2f2';
                noTagEl.style.transform = 'translateY(0)';
            }
        });
        
        content.appendChild(noTagEl);
    }
    
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
            // 点击普通标签时取消无标签筛选
            filterNoTag = false;
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
const HOT_FOLDER_NAME = '🔥 热门书签';

// 特殊文件夹名称列表（用于判断是否为快捷方式文件夹，查找重复时会排除）
const SHORTCUT_FOLDER_NAMES = [FAVORITES_FOLDER_NAME, RECENT_FOLDER_NAME, HOT_FOLDER_NAME];

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
        <span class="folder-name" title="${escapeHtml(folder.title || '未命名')}">${escapeHtml(folder.title || '未命名')}</span>
        <span class="folder-count">${bookmarkCount}</span>
        ${!isAll && folder.id ? '<span class="folder-actions" style="display: none; margin-left: auto; gap: 4px;"><button class="btn-icon" title="编辑">✏️</button><button class="btn-icon" title="删除">🗑️</button></span>' : ''}
    `;
    
    // 点击选择文件夹
    div.addEventListener('click', (e) => {
        // 如果点击的是按钮，不触发选择
        if (e.target.closest('.folder-actions')) return;
        
        document.querySelectorAll('.folder-item').forEach(el => el.classList.remove('active'));
        div.classList.add('active');
        
        // 锚点导航模式：滚动到对应区域
        if (anchorNavMode && !isAll && folder.id) {
            currentFolderId = null; // 保持全部书签模式
            scrollToFolderSection(folder.id);
            return;
        }
        
        // 传统模式：切换文件夹
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
// 锚点导航模式：显示所有文件夹的书签，按分组展示
let anchorNavMode = true; // 锚点导航模式开关
let scrollListenerBound = false; // 滚动监听是否已绑定

async function renderBookmarkList() {
    const container = document.getElementById('bookmarkList');
    container.innerHTML = '<div class="loading">加载中...</div>';
    
    // 如果有标签筛选或无标签筛选，使用传统列表模式
    if (filterNoTag || currentTagFilters.length > 0) {
        await renderBookmarkListTraditional();
        return;
    }
    
    // 锚点导航模式：按文件夹分组显示所有书签
    if (anchorNavMode && currentFolderId === null) {
        await renderBookmarkListByFolder();
        return;
    }
    
    // 单文件夹模式
    await renderBookmarkListTraditional();
}

// 传统列表渲染（用于筛选模式或单文件夹模式）
async function renderBookmarkListTraditional() {
    const container = document.getElementById('bookmarkList');
    
    let bookmarks = getBookmarksForCurrentFolder();
    
    // 无标签筛选
    if (filterNoTag) {
        bookmarks = bookmarks.filter(b => {
            const tags = getBookmarkTags(b.id);
            return !tags || tags.length === 0;
        });
        document.getElementById('currentFolderName').textContent = `📭 无标签书签 (${bookmarks.length})`;
    }
    // 标签筛选（支持多标签：书签需包含所有选中的标签）
    else if (currentTagFilters.length > 0) {
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
        let msg = '暂无书签';
        if (filterNoTag) {
            msg = '🎉 太棒了！所有书签都已有标签';
        } else if (currentTagFilters.length > 0) {
            msg = `没有同时包含 "${currentTagFilters.join('" 和 "')}" 标签的书签`;
        }
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${filterNoTag ? '✅' : '📭'}</div><p>${msg}</p></div>`;
        return;
    }
    
    container.innerHTML = '';
    
    // 如果是单文件夹模式，创建一个分组容器
    const section = document.createElement('div');
    section.className = 'folder-section';
    section.innerHTML = `<div class="folder-section-bookmarks"></div>`;
    const bookmarksContainer = section.querySelector('.folder-section-bookmarks');
    
    for (const bookmark of bookmarks) {
        const item = createBookmarkItem(bookmark);
        bookmarksContainer.appendChild(item);
    }
    
    container.appendChild(section);
}

// 按文件夹分组渲染（锚点导航模式）
async function renderBookmarkListByFolder() {
    const container = document.getElementById('bookmarkList');
    container.innerHTML = '';
    
    document.getElementById('currentFolderName').textContent = '全部书签';
    
    // 收集所有文件夹及其书签
    const folderGroups = [];
    collectFolderGroups(allBookmarks, folderGroups, '');
    
    if (folderGroups.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><p>暂无书签</p></div>';
        return;
    }
    
    // 渲染每个文件夹分组
    for (const group of folderGroups) {
        if (group.bookmarks.length === 0) continue;
        
        // 排序书签
        const sortedBookmarks = await sortBookmarks(group.bookmarks, currentSortOrder);
        const bookmarkIds = sortedBookmarks.map(b => b.id);
        
        const section = document.createElement('div');
        section.className = 'folder-section';
        section.id = `folder-section-${group.id}`;
        section.dataset.folderId = group.id;
        
        section.innerHTML = `
            <div class="folder-section-header" data-folder-id="${group.id}">
                <div class="folder-section-left">
                    <label class="folder-select-all" onclick="event.stopPropagation()">
                        <input type="checkbox" data-folder-id="${group.id}">
                        <span>全选</span>
                    </label>
                    <div class="folder-section-title">
                        <span>📁</span>
                        <span>${escapeHtml(group.title)}</span>
                    </div>
                </div>
                <div class="folder-section-actions">
                    <span class="folder-section-count">${sortedBookmarks.length} 个书签</span>
                </div>
            </div>
            <div class="folder-section-bookmarks ${currentViewMode === 'list' ? 'list-view' : ''}"></div>
        `;
        
        const bookmarksContainer = section.querySelector('.folder-section-bookmarks');
        for (const bookmark of sortedBookmarks) {
            const item = createBookmarkItem(bookmark);
            bookmarksContainer.appendChild(item);
        }
        
        // 分组全选
        const selectAllCheckbox = section.querySelector('.folder-select-all input');
        selectAllCheckbox.addEventListener('change', (e) => {
            e.stopPropagation();
            const isChecked = e.target.checked;
            bookmarkIds.forEach(id => {
                if (isChecked) {
                    selectedBookmarks.add(id);
                } else {
                    selectedBookmarks.delete(id);
                }
            });
            // 更新该分组内书签的选中状态
            section.querySelectorAll('.bookmark-item').forEach(item => {
                const checkbox = item.querySelector('.bookmark-checkbox');
                if (checkbox) {
                    checkbox.checked = isChecked;
                    item.classList.toggle('selected', isChecked);
                }
            });
            updateSelectionUI();
        });
        
        // 点击标题可以折叠/展开
        const titleDiv = section.querySelector('.folder-section-title');
        titleDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            const bookmarksDiv = section.querySelector('.folder-section-bookmarks');
            if (bookmarksDiv.style.display === 'none') {
                bookmarksDiv.style.display = currentViewMode === 'list' ? 'flex' : 'grid';
                titleDiv.querySelector('span:first-child').textContent = '📁';
            } else {
                bookmarksDiv.style.display = 'none';
                titleDiv.querySelector('span:first-child').textContent = '📂';
            }
        });
        
        container.appendChild(section);
    }
    
    // 绑定滚动监听
    bindScrollListener();
    
    // 更新视图按钮状态
    updateViewModeButtons();
}

// 收集文件夹分组
function collectFolderGroups(nodes, groups, parentPath) {
    for (const node of nodes) {
        if (node.children) {
            const path = parentPath ? `${parentPath} / ${node.title}` : node.title;
            const bookmarks = node.children.filter(c => c.url && !isSeparatorBookmark(c.url));
            
            if (bookmarks.length > 0) {
                groups.push({
                    id: node.id,
                    title: path || '未命名',
                    bookmarks: bookmarks
                });
            }
            
            // 递归处理子文件夹
            collectFolderGroups(node.children, groups, path);
        }
    }
}

// 绑定滚动监听，实现左侧导航高亮
function bindScrollListener() {
    if (scrollListenerBound) return;
    
    const panel = document.querySelector('.bookmark-panel');
    if (!panel) return;
    
    panel.addEventListener('scroll', debounce(() => {
        updateActiveFolderOnScroll();
    }, 100));
    
    scrollListenerBound = true;
}

// 根据滚动位置更新左侧导航高亮
function updateActiveFolderOnScroll() {
    const panel = document.querySelector('.bookmark-panel');
    if (!panel) return;
    
    const sections = document.querySelectorAll('.folder-section');
    if (sections.length === 0) return;
    
    const panelTop = panel.scrollTop + 100; // 偏移量
    
    let activeId = null;
    for (const section of sections) {
        const rect = section.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const relativeTop = rect.top - panelRect.top + panel.scrollTop;
        
        if (relativeTop <= panelTop) {
            activeId = section.dataset.folderId;
        }
    }
    
    // 更新左侧导航高亮
    if (activeId) {
        document.querySelectorAll('.folder-item').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.folderId === activeId) {
                el.classList.add('active');
            }
        });
    }
}

// 滚动到指定文件夹区域
function scrollToFolderSection(folderId) {
    const section = document.getElementById(`folder-section-${folderId}`);
    const panel = document.querySelector('.bookmark-panel');
    
    if (!section || !panel) return;
    
    // 计算section相对于panel的位置
    const panelRect = panel.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    
    // 计算需要滚动的距离
    const scrollOffset = sectionRect.top - panelRect.top + panel.scrollTop - 80; // 80px留给header
    
    // 平滑滚动
    panel.scrollTo({
        top: Math.max(0, scrollOffset),
        behavior: 'smooth'
    });
}

// 排序书签
async function sortBookmarks(bookmarks, order) {
    if (order === 'smart') {
        // 智能排序：综合考虑使用频率和最近访问时间
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        
        const scorePromises = bookmarks.map(async (b) => {
            const usage = await getBookmarkUsage(b.url);
            const lastVisit = await getLastVisitTime(b.url);
            
            // 计算热度分数
            // 频率分数：访问次数 * 10，最高100分
            const frequencyScore = Math.min(usage * 10, 100);
            
            // 时间分数：最近访问越近分数越高
            let recencyScore = 0;
            if (lastVisit > 0) {
                const daysAgo = (now - lastVisit) / dayMs;
                if (daysAgo < 1) recencyScore = 100;      // 今天访问
                else if (daysAgo < 3) recencyScore = 80;  // 3天内
                else if (daysAgo < 7) recencyScore = 60;  // 一周内
                else if (daysAgo < 30) recencyScore = 40; // 一个月内
                else if (daysAgo < 90) recencyScore = 20; // 三个月内
                else recencyScore = 10;
            }
            
            // 综合分数：频率权重60%，时间权重40%
            const totalScore = frequencyScore * 0.6 + recencyScore * 0.4;
            
            return { bookmark: b, score: totalScore, usage, lastVisit };
        });
        
        const withScores = await Promise.all(scorePromises);
        withScores.sort((a, b) => b.score - a.score);
        return withScores.map(item => item.bookmark);
        
    } else if (order === 'frequency') {
        // 按使用频率排序
        const usagePromises = bookmarks.map(async (b) => {
            const usage = await getBookmarkUsage(b.url);
            return { bookmark: b, usage };
        });
        const withUsage = await Promise.all(usagePromises);
        withUsage.sort((a, b) => b.usage - a.usage);
        return withUsage.map(item => item.bookmark);
        
    } else if (order === 'recent') {
        // 按最近访问时间排序
        const visitPromises = bookmarks.map(async (b) => {
            const lastVisit = await getLastVisitTime(b.url);
            return { bookmark: b, lastVisit };
        });
        const withVisits = await Promise.all(visitPromises);
        withVisits.sort((a, b) => b.lastVisit - a.lastVisit);
        return withVisits.map(item => item.bookmark);
        
    } else if (order === 'name') {
        return [...bookmarks].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (order === 'date') {
        return [...bookmarks].sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
    }
    return bookmarks;
}

// 获取书签最后访问时间
async function getLastVisitTime(url) {
    try {
        const visits = await chrome.history.getVisits({ url });
        if (visits.length > 0) {
            // 返回最近一次访问的时间
            return Math.max(...visits.map(v => v.visitTime || 0));
        }
        return 0;
    } catch {
        return 0;
    }
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

// 获取当前筛选后的书签列表（用于全选等操作）
function getFilteredBookmarks() {
    let bookmarks = getBookmarksForCurrentFolder();
    
    // 无标签筛选
    if (filterNoTag) {
        bookmarks = bookmarks.filter(b => {
            const tags = getBookmarkTags(b.id);
            return !tags || tags.length === 0;
        });
    }
    // 标签筛选
    else if (currentTagFilters.length > 0) {
        bookmarks = bookmarks.filter(b => {
            const tags = getBookmarkTags(b.id);
            return currentTagFilters.every(filter => tags.includes(filter));
        });
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
    
    // favicon 错误处理（降级到默认图标，避免多次重试产生更多错误）
    const faviconImg = div.querySelector('.bookmark-favicon');
    faviconImg.addEventListener('error', function() {
        // 直接使用默认图标，避免多次重试产生更多控制台错误
        this.src = 'icons/icon16.png';
        this.onerror = null; // 防止循环
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
    const batchTagBtn = document.getElementById('btnBatchTag');
    const addToNavBtn = document.getElementById('btnAddToNav');
    const quickAddBtn = document.getElementById('btnQuickAddToNav');
    const selectAllCheckbox = document.getElementById('selectAllBookmarks');
    const bookmarks = getFilteredBookmarks();
    
    if (selectedBookmarks.size > 0) {
        deleteBtn.style.display = 'block';
        moveBtn.style.display = 'block';
        renameBtn.style.display = 'block';
        batchTagBtn.style.display = 'block';
        addToNavBtn.style.display = 'block';
        quickAddBtn.style.display = 'block';
        deleteBtn.textContent = `删除 (${selectedBookmarks.size})`;
        batchTagBtn.textContent = `🏷️ 批量标签 (${selectedBookmarks.size})`;
        addToNavBtn.textContent = `🚀 选择分类 (${selectedBookmarks.size})`;
        quickAddBtn.textContent = `⚡ 快速添加 (${selectedBookmarks.size})`;
    } else {
        deleteBtn.style.display = 'none';
        moveBtn.style.display = 'none';
        renameBtn.style.display = 'none';
        batchTagBtn.style.display = 'none';
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
        const bookmarks = getFilteredBookmarks();
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
    
    // 健康中心 (作为核心维护入口)
    document.getElementById('btnHealthDashboard').addEventListener('click', showHealthDashboard);
    
    // 时间线筛选
    document.getElementById('timelineFilter').addEventListener('change', handleTimelineFilter);
    
    // 批量标签
    document.getElementById('btnBatchTag').addEventListener('click', showBatchTagModal);
    document.getElementById('batchTagClose').addEventListener('click', closeBatchTagModal);
    document.getElementById('btnCancelBatchTag').addEventListener('click', closeBatchTagModal);
    document.getElementById('btnConfirmBatchTag').addEventListener('click', confirmBatchTag);
    document.getElementById('batchTagMode').addEventListener('change', updateBatchTagUI);
    
    // 标签管理
    document.getElementById('btnRegenerateTags').addEventListener('click', regenerateAllTags);
    document.getElementById('btnClearAllTags').addEventListener('click', clearAllTags);
    
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
    
    // 更新热门书签
    document.getElementById('btnUpdateHotBookmarks').addEventListener('click', updateHotBookmarks);
    
    // 云备份
    document.getElementById('btnCloudBackup').addEventListener('click', showCloudBackupModal);
    document.getElementById('cloudBackupClose').addEventListener('click', closeCloudBackupModal);
    document.getElementById('btnCloseCloudBackup').addEventListener('click', closeCloudBackupModal);
    document.getElementById('btnTestBackupServer').addEventListener('click', testBackupServerConnection);
    document.getElementById('btnAuthLogin').addEventListener('click', showAuthLoginDialog);
    document.getElementById('btnUploadBackup').addEventListener('click', uploadBookmarkBackup);
    document.getElementById('btnRestoreBackup').addEventListener('click', restoreBookmarkBackup);
    document.getElementById('cloudBackupSelect').addEventListener('change', onBackupSelectChange);
    document.getElementById('autoBackupEnabled').addEventListener('change', toggleAutoBackup);
    document.getElementById('btnSyncFromWebDAV').addEventListener('click', syncFromWebDAV);
    document.getElementById('btnSyncToWebDAV').addEventListener('click', syncToWebDAV);
    // 备份历史来源切换
    document.querySelectorAll('.backup-source-btn').forEach(btn => {
        btn.addEventListener('click', () => switchBackupSource(btn.dataset.source));
    });
    // 恢复来源切换
    document.querySelectorAll('.restore-source-btn').forEach(btn => {
        btn.addEventListener('click', () => switchRestoreSource(btn.dataset.source));
    });
    
    // 空文件夹检测
    document.getElementById('btnFindEmptyFolders').addEventListener('click', findEmptyFolders);
    
    // 清除标签筛选
    document.getElementById('btnClearTagFilter').addEventListener('click', () => {
        currentTagFilters = [];
        filterNoTag = false;
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
    
    // 视图切换
    document.getElementById('btnGridView').addEventListener('click', () => switchViewMode('grid'));
    document.getElementById('btnListView').addEventListener('click', () => switchViewMode('list'));
    
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
            const bookmarks = getFilteredBookmarks();
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
            
            // 清除标签筛选（包括无标签筛选）
            if (currentTagFilters.length > 0 || filterNoTag) {
                currentTagFilters = [];
                filterNoTag = false;
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
    
    document.getElementById('ctxBatchTag').addEventListener('click', (e) => {
        e.stopPropagation();
        hideContextMenu();
        showBatchTagModal();
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
    document.querySelector('#ctxBatchTag span:last-child').textContent = `批量标签 (${count})`;
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

// ==================== 健康中心 ====================

// 显示健康中心仪表盘
async function showHealthDashboard() {
    const resultList = document.getElementById('resultList');
    document.getElementById('resultTitle').textContent = '🛡️ 书签健康中心';
    resultList.innerHTML = '<div class="loading">正在扫描书签状态...</div>';
    document.getElementById('resultModal').classList.add('active');
    hideResultFooterActions();
    
    const allBookmarksList = [];
    collectAllBookmarks(allBookmarks, allBookmarksList);
    
    // 1. 计算重复项 (快速扫描)
    const urlMap = new Map();
    let duplicateCount = 0;
    allBookmarksList.forEach(b => {
        if (isInShortcutFolder(b)) return;
        const normalized = normalizeUrl(b.url);
        if (urlMap.has(normalized)) {
            duplicateCount++;
        } else {
            urlMap.set(normalized, true);
        }
    });
    
    // 2. 加载无效链接缓存
    const cachedLinks = await loadInvalidLinksCache();
    const invalidCount = cachedLinks ? cachedLinks.length : 0;
    
    // 3. 计算空文件夹
    const allFolders = [];
    collectAllFolders(allBookmarks, allFolders);
    let emptyFolderCount = 0;
    for (const f of allFolders) {
        if (!f.id || SYSTEM_FOLDER_IDS.includes(f.id)) continue;
        if (!f.children || f.children.length === 0) emptyFolderCount++;
    }
    
    // 4. 统计无标签项
    const noTagCount = countNoTagBookmarks();
    
    let html = `
        <div style="padding: 10px;">
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px;">
                <!-- 重复书签 -->
                <div style="background: #fdf2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <span style="font-size: 24px;">👯</span>
                        <span style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: 600;">${duplicateCount}</span>
                    </div>
                    <div>
                        <div style="font-weight: 600; color: #991b1b;">重复书签</div>
                        <div style="font-size: 12px; color: #b91c1c; margin-top: 4px;">相同网址在不同位置</div>
                    </div>
                    <button class="btn btn-small" onclick="closeResultModal(); findDuplicates();" style="background: white; border: 1px solid #fecaca; color: #dc2626;">查看并处理</button>
                </div>
                
                <!-- 无效链接 -->
                <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <span style="font-size: 24px;">🔗</span>
                        <span style="background: #f59e0b; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: 600;">${invalidCount > 0 ? invalidCount : '?'}</span>
                    </div>
                    <div>
                        <div style="font-weight: 600; color: #92400e;">失效链接</div>
                        <div style="font-size: 12px; color: #a16207; margin-top: 4px;">${invalidCount > 0 ? '发现已知失效链接' : '尚未进行全面检测'}</div>
                    </div>
                    <button class="btn btn-small" onclick="closeResultModal(); showCheckOptions();" style="background: white; border: 1px solid #fef3c7; color: #d97706;">开始深度检测</button>
                </div>
                
                <!-- 空文件夹 -->
                <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <span style="font-size: 24px;">📭</span>
                        <span style="background: #6b7280; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: 600;">${emptyFolderCount}</span>
                    </div>
                    <div>
                        <div style="font-weight: 600; color: #374151;">空文件夹</div>
                        <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">不含任何书签的目录</div>
                    </div>
                    <button class="btn btn-small" onclick="closeResultModal(); findEmptyFolders();" style="background: white; border: 1px solid #e5e7eb; color: #4b5563;">清理空文件夹</button>
                </div>
                
                <!-- 无标签书签 -->
                <div style="background: #eff6ff; border: 1px solid #dbeafe; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <span style="font-size: 24px;">🏷️</span>
                        <span style="background: #3b82f6; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: 600;">${noTagCount}</span>
                    </div>
                    <div>
                        <div style="font-weight: 600; color: #1e40af;">未分类书签</div>
                        <div style="font-size: 12px; color: #1d4ed8; margin-top: 4px;">尚未添加任何标签</div>
                    </div>
                    <button class="btn btn-small" onclick="closeResultModal(); filterNoTag=true; renderBookmarkList();" style="background: white; border: 1px solid #dbeafe; color: #2563eb;">去打标签</button>
                </div>
            </div>
            
            <!-- 一键清理建议 -->
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 20px; color: white; margin-bottom: 16px;">
                <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">✨ 智能整理建议</div>
                <div style="font-size: 13px; opacity: 0.9; line-height: 1.6; margin-bottom: 16px;">
                    检测到 ${duplicateCount + emptyFolderCount} 个可安全清理的项目。使用自动标签可以帮助您更好地管理书签。
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn" onclick="closeResultModal(); autoTagAllBookmarks();" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3);">批量自动打标签</button>
                    <button class="btn" onclick="closeResultModal(); analyzeUsage();" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3);">分析吃灰书签</button>
                </div>
            </div>
        </div>
    `;
    
    resultList.innerHTML = html;
}
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
    
    // 过滤掉快捷方式文件夹（热门、常用、最近使用）中的书签
    const normalBookmarks = allBookmarksList.filter(b => !isInShortcutFolder(b));
    
    // 为每个书签添加路径信息
    for (const bookmark of normalBookmarks) {
        const normalizedUrl = normalizeUrl(bookmark.url);
        const path = await getBookmarkPath(bookmark.id);
        
        if (!urlMap.has(normalizedUrl)) {
            urlMap.set(normalizedUrl, []);
        }
        urlMap.get(normalizedUrl).push({ ...bookmark, path, isShortcut: false });
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
        
        // 移除www前缀
        let hostname = urlObj.hostname.replace(/^www\./, '');
        
        // 移除末尾斜杠
        let pathname = urlObj.pathname.replace(/\/+$/, '');
        
        // 处理查询参数：移除常见的追踪参数
        const trackingParams = [
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
            'fbclid', 'gclid', 'ref', 'source', 'from', 'spm', 'share_source',
            '_ga', '_gl', 'mc_cid', 'mc_eid', 'mkt_tok'
        ];
        
        const params = new URLSearchParams(urlObj.search);
        trackingParams.forEach(p => params.delete(p));
        
        // 对参数排序以确保一致性
        const sortedParams = new URLSearchParams([...params.entries()].sort());
        const search = sortedParams.toString() ? '?' + sortedParams.toString() : '';
        
        // 忽略hash部分
        // 忽略协议差异（http/https视为相同）
        // 忽略默认端口
        
        let normalized = hostname + pathname + search;
        return normalized.toLowerCase();
    } catch {
        return url.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
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
    
    if (!confirm(`确定要删除选中的 ${checked.length} 项吗？`)) return;
    
    const ids = [];
    checked.forEach(cb => {
        const item = cb.closest('.result-item');
        if (item) {
            // 支持书签ID和文件夹ID
            const id = item.dataset.bookmarkId || item.dataset.folderId;
            if (id) ids.push(id);
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
        const domain = urlObj.hostname;
        // 使用 Google Favicon 服务（更可靠，有缓存，减少404错误）
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
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
    
    const count = selectedBookmarks.size;
    
    try {
        for (const id of selectedBookmarks) {
            await chrome.bookmarks.move(id, { parentId: targetId });
        }
        
        closeBatchMoveModal();
        selectedBookmarks.clear();
        await loadBookmarks();
        alert(`成功移动 ${count} 个书签`);
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

// 浏览器系统文件夹ID（这些文件夹无法删除）
// Chrome: 1=书签栏, 2=其他书签, 3=移动设备书签(如果有)
// Edge类似
const SYSTEM_FOLDER_IDS = ['0', '1', '2', '3'];

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
        // 跳过根节点和系统文件夹（书签栏、其他书签等无法删除）
        if (!folder.id || SYSTEM_FOLDER_IDS.includes(folder.id)) continue;
        
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
        
        // 注：已移除自动创建"常用"和"最近使用"文件夹的功能
        
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
        <div class="pending-bookmark-item" style="display: flex; align-items: center; gap: 8px; padding: 8px; border-bottom: 1px solid #f0f0f0;">
            <img class="pending-favicon" data-url="${escapeHtml(bookmark.url)}" src="${getFaviconUrl(bookmark.url)}" style="width: 16px; height: 16px; flex-shrink: 0;">
            <div style="flex: 1; min-width: 0;">
                <input type="text" class="pending-title-input" data-index="${index}" value="${escapeHtml(bookmark.title || '')}" placeholder="输入标题" style="width: 100%; padding: 4px 6px; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 13px; margin-bottom: 2px;">
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
    
    // 绑定标题输入框事件
    container.querySelectorAll('.pending-title-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index, 10);
            pendingNavBookmarks[index].title = e.target.value;
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
                        await chrome.storage.local.remove(['navAuthToken']);
                    } catch (e) {
                        // 解析失败，token可能无效
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
    const password = await showAuthPasswordModal('请输入导航站管理密码：');
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


// ==================== 批量标签功能 ====================

// 显示批量标签弹窗
function showBatchTagModal() {
    if (selectedBookmarks.size === 0) {
        alert('请先选择要添加标签的书签');
        return;
    }
    
    document.getElementById('batchTagCount').textContent = `将为 ${selectedBookmarks.size} 个书签操作标签`;
    document.getElementById('batchTagInput').value = '';
    document.getElementById('batchTagMode').value = 'add';
    
    // 渲染已有标签供快速选择
    renderExistingTagsSelect();
    
    updateBatchTagUI();
    document.getElementById('batchTagModal').classList.add('active');
}

// 关闭批量标签弹窗
function closeBatchTagModal() {
    document.getElementById('batchTagModal').classList.remove('active');
}

// 更新批量标签UI（根据操作模式）
function updateBatchTagUI() {
    const mode = document.getElementById('batchTagMode').value;
    const label = document.getElementById('batchTagInputLabel');
    const input = document.getElementById('batchTagInput');
    
    switch (mode) {
        case 'add':
            label.textContent = '输入要添加的标签（多个标签用逗号分隔）';
            input.placeholder = '例如: 工具, 开发, 常用';
            break;
        case 'replace':
            label.textContent = '输入新标签（将替换所有现有标签）';
            input.placeholder = '例如: 工具, 开发';
            break;
        case 'remove':
            label.textContent = '输入要移除的标签';
            input.placeholder = '例如: 临时, 待整理';
            break;
    }
}

// 渲染已有标签供快速选择
function renderExistingTagsSelect() {
    const container = document.getElementById('existingTagsSelect');
    
    if (allTags.size === 0) {
        container.innerHTML = '<span style="color: #999; font-size: 12px;">暂无已有标签</span>';
        return;
    }
    
    // 统计标签使用次数并排序
    const tagCounts = {};
    for (const tags of bookmarkTags.values()) {
        for (const tag of tags) {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
    }
    
    const sortedTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30); // 最多显示30个
    
    container.innerHTML = sortedTags.map(([tag, count]) => `
        <span class="tag-select-item" data-tag="${escapeHtml(tag)}" style="
            display: inline-block;
            padding: 4px 10px;
            background: #f0f0f0;
            color: #333;
            border-radius: 12px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
            border: 1px solid transparent;
        " title="使用 ${count} 次">${escapeHtml(tag)}</span>
    `).join('');
    
    // 绑定点击事件
    container.querySelectorAll('.tag-select-item').forEach(item => {
        item.addEventListener('click', () => {
            const tag = item.dataset.tag;
            const input = document.getElementById('batchTagInput');
            const currentTags = input.value.split(',').map(t => t.trim()).filter(t => t);
            
            if (item.classList.contains('selected')) {
                // 取消选择
                item.classList.remove('selected');
                item.style.background = '#f0f0f0';
                item.style.color = '#333';
                item.style.borderColor = 'transparent';
                const index = currentTags.indexOf(tag);
                if (index > -1) currentTags.splice(index, 1);
            } else {
                // 选择
                item.classList.add('selected');
                item.style.background = '#667eea';
                item.style.color = 'white';
                item.style.borderColor = '#5a67d8';
                if (!currentTags.includes(tag)) currentTags.push(tag);
            }
            
            input.value = currentTags.join(', ');
        });
    });
}

// 为选中书签智能生成标签建议
function autoSuggestTagsForSelected() {
    const container = document.getElementById('suggestedTagsSelect');
    const suggestedTags = new Map(); // tag -> count
    
    // 获取选中的书签
    const allBookmarksList = [];
    collectAllBookmarks(allBookmarks, allBookmarksList);
    const selectedList = allBookmarksList.filter(b => selectedBookmarks.has(b.id));
    
    // 为每个书签生成建议标签
    for (const bookmark of selectedList) {
        const tags = autoGenerateTags(bookmark);
        for (const tag of tags) {
            suggestedTags.set(tag, (suggestedTags.get(tag) || 0) + 1);
        }
    }
    
    if (suggestedTags.size === 0) {
        container.innerHTML = '<span style="color: #999; font-size: 12px;">无法为选中书签生成标签建议</span>';
        return;
    }
    
    // 按出现次数排序
    const sortedTags = Array.from(suggestedTags.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);
    
    container.innerHTML = sortedTags.map(([tag, count]) => {
        const percent = Math.round(count / selectedList.length * 100);
        return `
            <span class="suggested-tag-item" data-tag="${escapeHtml(tag)}" style="
                display: inline-block;
                padding: 4px 10px;
                background: #e0f2fe;
                color: #0369a1;
                border-radius: 12px;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s;
                border: 1px solid transparent;
            " title="${count}/${selectedList.length} 个书签 (${percent}%)">${escapeHtml(tag)} <small style="opacity:0.7">${percent}%</small></span>
        `;
    }).join('');
    
    // 绑定点击事件
    container.querySelectorAll('.suggested-tag-item').forEach(item => {
        item.addEventListener('click', () => {
            const tag = item.dataset.tag;
            const input = document.getElementById('batchTagInput');
            const currentTags = input.value.split(',').map(t => t.trim()).filter(t => t);
            
            if (item.classList.contains('selected')) {
                item.classList.remove('selected');
                item.style.background = '#e0f2fe';
                item.style.color = '#0369a1';
                item.style.borderColor = 'transparent';
                const index = currentTags.indexOf(tag);
                if (index > -1) currentTags.splice(index, 1);
            } else {
                item.classList.add('selected');
                item.style.background = '#0369a1';
                item.style.color = 'white';
                item.style.borderColor = '#075985';
                if (!currentTags.includes(tag)) currentTags.push(tag);
            }
            
            input.value = currentTags.join(', ');
        });
    });
}

// 确认批量标签操作
async function confirmBatchTag() {
    const mode = document.getElementById('batchTagMode').value;
    const inputValue = document.getElementById('batchTagInput').value.trim();
    
    if (!inputValue && mode !== 'replace') {
        alert('请输入标签');
        return;
    }
    
    const inputTags = inputValue.split(',').map(t => t.trim()).filter(t => t.length > 0);
    
    if (inputTags.length === 0 && mode !== 'replace') {
        alert('请输入有效的标签');
        return;
    }
    
    // 获取选中的书签
    const allBookmarksList = [];
    collectAllBookmarks(allBookmarks, allBookmarksList);
    const selectedList = allBookmarksList.filter(b => selectedBookmarks.has(b.id));
    
    let modifiedCount = 0;
    
    for (const bookmark of selectedList) {
        const currentTags = bookmarkTags.get(bookmark.id) || [];
        let newTags = [];
        
        switch (mode) {
            case 'add':
                // 添加标签（保留现有）
                newTags = [...new Set([...currentTags, ...inputTags])];
                break;
            case 'replace':
                // 替换标签
                newTags = [...inputTags];
                break;
            case 'remove':
                // 移除指定标签
                newTags = currentTags.filter(t => !inputTags.includes(t));
                break;
        }
        
        // 检查是否有变化
        if (JSON.stringify(currentTags.sort()) !== JSON.stringify(newTags.sort())) {
            if (newTags.length > 0) {
                bookmarkTags.set(bookmark.id, newTags);
            } else {
                bookmarkTags.delete(bookmark.id);
            }
            modifiedCount++;
        }
    }
    
    // 更新全局标签集合
    allTags.clear();
    for (const tags of bookmarkTags.values()) {
        tags.forEach(tag => allTags.add(tag));
    }
    
    await saveTags();
    renderTagCloud();
    renderBookmarkList();
    closeBatchTagModal();
    
    // 显示结果
    const modeText = { add: '添加', replace: '替换', remove: '移除' }[mode];
    alert(`批量${modeText}标签完成！\n\n已修改 ${modifiedCount} 个书签的标签`);
}


// ==================== 按文件夹标签功能 ====================

// 从文件夹名称提取标签
function extractTagFromFolderName(folderName) {
    if (!folderName) return null;
    
    // 过滤系统文件夹名称
    const systemFolders = [
        '书签栏', '其他书签', 'bookmarks bar', 'other bookmarks', 
        'bookmarks', '收藏夹', 'favorites', '移动设备书签',
        'mobile bookmarks', '根目录', ''
    ];
    
    const cleanName = folderName.trim();
    if (!cleanName || systemFolders.some(sys => 
        cleanName.toLowerCase() === sys.toLowerCase()
    )) {
        return null;
    }
    
    // 如果文件夹名称太长，尝试提取关键词
    if (cleanName.length > 8) {
        // 尝试提取中文关键词（2-6个字）
        const chineseMatch = cleanName.match(/[\u4e00-\u9fa5]{2,6}/);
        if (chineseMatch) {
            return chineseMatch[0];
        }
        
        // 尝试提取英文单词
        const englishMatch = cleanName.match(/[A-Za-z]{3,8}/);
        if (englishMatch) {
            return englishMatch[0];
        }
        
        // 如果都没有，截取前6个字符
        return cleanName.substring(0, 6);
    }
    
    return cleanName;
}

// 获取书签的文件夹路径
function getBookmarkFolderPath(bookmarkId) {
    function findPath(nodes, targetId, path = []) {
        for (const node of nodes) {
            if (node.id === targetId) {
                return path;
            }
            if (node.children) {
                const newPath = node.title ? [...path, node.title] : path;
                const result = findPath(node.children, targetId, newPath);
                if (result) return result;
            }
        }
        return null;
    }
    
    return findPath(allBookmarks, bookmarkId) || [];
}

// 根据文件夹名称为书签添加标签
async function tagBookmarksByFolder() {
    const allBookmarksList = [];
    collectAllBookmarks(allBookmarks, allBookmarksList);
    
    // 排除热门书签等快捷方式文件夹中的副本书签
    const normalBookmarks = allBookmarksList.filter(b => !isInShortcutFolder(b));
    
    if (normalBookmarks.length === 0) {
        alert('没有找到书签');
        return;
    }
    
    // 显示确认弹窗
    const confirmed = confirm(
        `🏷️ 按文件夹标签\n\n` +
        `将根据书签所在文件夹的名称为书签添加标签。\n` +
        `例如："前端开发"文件夹下的书签会添加"前端开发"标签。\n\n` +
        `共 ${normalBookmarks.length} 个书签，是否继续？`
    );
    
    if (!confirmed) return;
    
    // 显示进度
    const progressDiv = document.createElement('div');
    progressDiv.id = 'folderTagProgress';
    progressDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 24px 32px; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); z-index: 10000; text-align: center; min-width: 300px;';
    progressDiv.innerHTML = `
        <div style="font-size: 16px; font-weight: 600; margin-bottom: 16px;">📁 正在按文件夹添加标签...</div>
        <div style="background: #e0e0e0; border-radius: 8px; height: 8px; overflow: hidden; margin-bottom: 12px;">
            <div id="folderTagProgressBar" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); height: 100%; width: 0%; transition: width 0.3s;"></div>
        </div>
        <div id="folderTagProgressText" style="font-size: 14px; color: #666;">0 / ${normalBookmarks.length}</div>
    `;
    document.body.appendChild(progressDiv);
    
    const progressBar = document.getElementById('folderTagProgressBar');
    const progressText = document.getElementById('folderTagProgressText');
    
    let taggedCount = 0;
    let skippedCount = 0;
    
    for (let i = 0; i < normalBookmarks.length; i++) {
        const bookmark = normalBookmarks[i];
        
        // 更新进度
        const percent = Math.round((i + 1) / normalBookmarks.length * 100);
        progressBar.style.width = percent + '%';
        progressText.textContent = `${i + 1} / ${normalBookmarks.length}`;
        
        // 获取文件夹路径
        const folderPath = getBookmarkFolderPath(bookmark.id);
        
        // 从文件夹路径提取标签
        const folderTags = [];
        for (const folderName of folderPath) {
            const tag = extractTagFromFolderName(folderName);
            if (tag && !folderTags.includes(tag)) {
                folderTags.push(tag);
            }
        }
        
        if (folderTags.length > 0) {
            // 获取现有标签
            const existingTags = bookmarkTags.get(bookmark.id) || [];
            
            // 合并标签（去重）
            const newTags = [...new Set([...existingTags, ...folderTags])];
            
            // 如果有新标签，更新
            if (newTags.length > existingTags.length) {
                bookmarkTags.set(bookmark.id, newTags);
                newTags.forEach(tag => allTags.add(tag));
                taggedCount++;
            } else {
                skippedCount++;
            }
        } else {
            skippedCount++;
        }
        
        // 每处理50个书签，让UI有机会更新
        if (i % 50 === 0) {
            await new Promise(r => setTimeout(r, 10));
        }
    }
    
    // 移除进度条
    progressDiv.remove();
    
    // 保存标签
    if (taggedCount > 0) {
        await saveTags();
        renderTagCloud();
        renderBookmarkList();
    }
    
    // 显示结果
    alert(
        `📁 按文件夹标签完成！\n\n` +
        `✅ 添加标签: ${taggedCount} 个书签\n` +
        `⏭️ 跳过: ${skippedCount} 个书签\n\n` +
        (taggedCount > 0 ? '标签已更新，可在标签云中查看。' : '没有新标签添加。')
    );
}


// 重新生成所有标签（清除现有标签后根据文件夹重新生成）
async function regenerateAllTags() {
    const allBookmarksList = [];
    collectAllBookmarks(allBookmarks, allBookmarksList);
    
    if (allBookmarksList.length === 0) {
        alert('没有找到书签');
        return;
    }
    
    // 显示确认弹窗
    const confirmed = confirm(
        `🔄 重新生成标签\n\n` +
        `此操作将：\n` +
        `1. 清除所有书签的现有标签\n` +
        `2. 根据文件夹名称重新生成标签\n\n` +
        `共 ${allBookmarksList.length} 个书签，是否继续？`
    );
    
    if (!confirmed) return;
    
    // 二次确认
    const doubleConfirmed = confirm('⚠️ 确定要清除所有现有标签并重新生成吗？此操作不可撤销！');
    if (!doubleConfirmed) return;
    
    // 显示进度
    const progressDiv = document.createElement('div');
    progressDiv.id = 'regenerateTagProgress';
    progressDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 24px 32px; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); z-index: 10000; text-align: center; min-width: 300px;';
    progressDiv.innerHTML = `
        <div style="font-size: 16px; font-weight: 600; margin-bottom: 16px;">🔄 正在重新生成标签...</div>
        <div style="background: #e0e0e0; border-radius: 8px; height: 8px; overflow: hidden; margin-bottom: 12px;">
            <div id="regenerateProgressBar" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); height: 100%; width: 0%; transition: width 0.3s;"></div>
        </div>
        <div id="regenerateProgressText" style="font-size: 14px; color: #666;">0 / ${allBookmarksList.length}</div>
    `;
    document.body.appendChild(progressDiv);
    
    const progressBar = document.getElementById('regenerateProgressBar');
    const progressText = document.getElementById('regenerateProgressText');
    
    // 清除所有标签
    bookmarkTags.clear();
    allTags.clear();
    
    let taggedCount = 0;
    
    for (let i = 0; i < allBookmarksList.length; i++) {
        const bookmark = allBookmarksList[i];
        
        // 更新进度
        const percent = Math.round((i + 1) / allBookmarksList.length * 100);
        progressBar.style.width = percent + '%';
        progressText.textContent = `${i + 1} / ${allBookmarksList.length}`;
        
        // 获取文件夹路径
        const folderPath = getBookmarkFolderPath(bookmark.id);
        
        // 从文件夹路径提取标签
        const folderTags = [];
        for (const folderName of folderPath) {
            const tag = extractTagFromFolderName(folderName);
            if (tag && !folderTags.includes(tag)) {
                folderTags.push(tag);
            }
        }
        
        if (folderTags.length > 0) {
            bookmarkTags.set(bookmark.id, folderTags);
            folderTags.forEach(tag => allTags.add(tag));
            taggedCount++;
        }
        
        // 每处理50个书签，让UI有机会更新
        if (i % 50 === 0) {
            await new Promise(r => setTimeout(r, 10));
        }
    }
    
    // 移除进度条
    progressDiv.remove();
    
    // 保存标签
    await saveTags();
    renderTagCloud();
    renderBookmarkList();
    
    // 显示结果
    alert(
        `🔄 重新生成标签完成！\n\n` +
        `✅ 已为 ${taggedCount} 个书签生成标签\n` +
        `📊 共 ${allTags.size} 个不同标签`
    );
}

// 清除所有标签
async function clearAllTags() {
    const tagCount = allTags.size;
    const bookmarkCount = bookmarkTags.size;
    
    if (tagCount === 0) {
        alert('当前没有任何标签');
        return;
    }
    
    // 显示确认弹窗
    const confirmed = confirm(
        `🗑️ 清除所有标签\n\n` +
        `当前共有 ${tagCount} 个标签，${bookmarkCount} 个书签有标签。\n\n` +
        `确定要清除所有书签的标签吗？`
    );
    
    if (!confirmed) return;
    
    // 二次确认
    const doubleConfirmed = confirm('⚠️ 再次确认：清除所有标签？此操作不可撤销！');
    if (!doubleConfirmed) return;
    
    // 清除所有标签
    bookmarkTags.clear();
    allTags.clear();
    currentTagFilters = [];
    filterNoTag = false;
    
    // 保存
    await saveTags();
    renderTagCloud();
    renderBookmarkList();
    
    alert('✅ 已清除所有标签');
}


// ==================== 视图切换功能 ====================

// 切换视图模式
function switchViewMode(mode) {
    if (currentViewMode === mode) return;
    
    currentViewMode = mode;
    
    // 更新所有分组的视图
    document.querySelectorAll('.folder-section-bookmarks').forEach(container => {
        if (mode === 'list') {
            container.classList.add('list-view');
            if (container.style.display !== 'none') {
                container.style.display = 'flex';
            }
        } else {
            container.classList.remove('list-view');
            if (container.style.display !== 'none') {
                container.style.display = 'grid';
            }
        }
    });
    
    // 更新按钮状态
    updateViewModeButtons();
    
    // 保存设置
    chrome.storage.local.set({ bookmarkViewMode: mode });
}

// 更新视图按钮状态
function updateViewModeButtons() {
    const gridBtn = document.getElementById('btnGridView');
    const listBtn = document.getElementById('btnListView');
    
    if (gridBtn && listBtn) {
        gridBtn.classList.toggle('btn-primary', currentViewMode === 'grid');
        gridBtn.classList.toggle('btn-secondary', currentViewMode !== 'grid');
        listBtn.classList.toggle('btn-primary', currentViewMode === 'list');
        listBtn.classList.toggle('btn-secondary', currentViewMode !== 'list');
    }
}

// 加载视图模式设置
async function loadViewModeSetting() {
    try {
        const result = await chrome.storage.local.get('bookmarkViewMode');
        if (result.bookmarkViewMode) {
            currentViewMode = result.bookmarkViewMode;
        }
    } catch (e) {
        console.error('加载视图模式设置失败:', e);
    }
}


// ==================== 自动更新热门书签功能 ====================

// 更新热门书签（根据智能排序选取TOP N，使用副本模式）
async function updateHotBookmarks() {
    const TOP_N = 20; // 热门书签数量
    
    // 收集所有书签（排除快捷方式文件夹中的）
    const allBookmarksList = [];
    collectAllBookmarks(allBookmarks, allBookmarksList);
    const normalBookmarks = allBookmarksList.filter(b => !isInShortcutFolder(b));
    
    if (normalBookmarks.length === 0) {
        alert('没有找到书签');
        return;
    }
    
    // 显示确认
    const confirmed = confirm(
        `🔥 更新热门书签\n\n` +
        `将根据使用频率和最近访问时间，自动选取 TOP ${TOP_N} 热门书签。\n\n` +
        `• 热门书签是副本，不会影响原书签位置\n` +
        `• 查找重复时会自动排除热门文件夹\n` +
        `• 每次更新会清空旧的热门书签\n\n` +
        `是否继续？`
    );
    
    if (!confirmed) return;
    
    try {
        // 计算每个书签的热度分数
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        
        const scorePromises = normalBookmarks.map(async (b) => {
            const usage = await getBookmarkUsage(b.url);
            const lastVisit = await getLastVisitTime(b.url);
            
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
            return { bookmark: b, score: totalScore };
        });
        
        const withScores = await Promise.all(scorePromises);
        
        // 按分数排序，取TOP N
        withScores.sort((a, b) => b.score - a.score);
        const topBookmarks = withScores.slice(0, TOP_N).filter(item => item.score > 0);
        
        if (topBookmarks.length === 0) {
            alert('没有找到有访问记录的书签，无法生成热门列表');
            return;
        }
        
        // 获取或创建热门书签文件夹
        const bookmarkBar = allBookmarks[0]?.children?.[0];
        if (!bookmarkBar) {
            alert('无法找到书签栏');
            return;
        }
        
        let hotFolder = bookmarkBar.children?.find(c => c.title === HOT_FOLDER_NAME);
        
        if (hotFolder) {
            // 清空现有热门书签
            if (hotFolder.children) {
                for (const child of hotFolder.children) {
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
        
        await loadBookmarks();
        
        alert(
            `🔥 热门书签已更新！\n\n` +
            `• 已添加 ${topBookmarks.length} 个热门书签\n` +
            `• 这些是副本，原书签位置不变\n` +
            `• 查找重复时会自动排除热门文件夹`
        );
        
    } catch (error) {
        alert('更新失败: ' + error.message);
    }
}


// ==================== 自动更新热门书签设置 ====================

// 加载自动更新热门设置
async function loadAutoUpdateHotSetting() {
    try {
        const result = await chrome.storage.local.get('autoUpdateHotBookmarks');
        const enabled = result.autoUpdateHotBookmarks !== false; // 默认启用
        document.getElementById('autoUpdateHotEnabled').checked = enabled;
    } catch (e) {
        console.error('加载自动更新热门设置失败:', e);
    }
}

// 切换自动更新热门
async function toggleAutoUpdateHot(e) {
    const enabled = e.target.checked;
    try {
        await chrome.storage.local.set({ autoUpdateHotBookmarks: enabled });
        // 通知background.js
        chrome.runtime.sendMessage({ action: 'setAutoUpdateHotBookmarks', enabled });
    } catch (e) {
        console.error('保存自动更新热门设置失败:', e);
    }
}


// ==================== 云端书签备份功能 ====================

let cloudBackupServerUrl = '';
let cloudBackupToken = ''; // 使用Token替代密码
let isVerifying = false; // 标记是否正在验证Token
let lastVerifiedToken = ''; // 上次验证通过的Token（用于避免重复验证同一个Token）

// 显示云备份弹窗
async function showCloudBackupModal() {
    // 先禁用所有操作，等待验证完成
    disableCloudBackupOperations();
    
    // 立即设置授权状态为"验证中"，避免显示旧状态
    const authStatusEl = document.getElementById('authStatus');
    const authBtnEl = document.getElementById('btnAuthLogin');
    authStatusEl.innerHTML = '<span style="color: #666;">⏳ 验证中...</span>';
    authStatusEl.style.borderColor = '#e5e7eb';
    authStatusEl.style.background = '#f9fafb';
    authBtnEl.disabled = true;
    authBtnEl.style.opacity = '0.6';
    
    // 加载保存的服务器地址和Token
    try {
        const result = await chrome.storage.local.get(['cloudBackupServer', 'backupDeviceName', 'cloudBackupToken', 'autoBookmarkBackupEnabled']);
        if (result.cloudBackupServer) {
            cloudBackupServerUrl = result.cloudBackupServer;
            document.getElementById('cloudBackupServer').value = result.cloudBackupServer;
        }
        if (result.backupDeviceName) {
            document.getElementById('backupDeviceName').value = result.backupDeviceName;
        }
        // 始终从storage同步Token状态（包括清空的情况）
        cloudBackupToken = result.cloudBackupToken || '';
        // 加载自动备份状态
        document.getElementById('autoBackupEnabled').checked = result.autoBookmarkBackupEnabled || false;
        updateAutoBackupStatus(result.autoBookmarkBackupEnabled || false);
    } catch (e) {
        console.error('[云备份弹窗] 加载配置失败:', e);
        // 加载失败时重置Token
        cloudBackupToken = '';
    }
    
    // 更新当前书签统计
    document.getElementById('currentBookmarkCount').textContent = bookmarkCount;
    document.getElementById('currentFolderCount').textContent = folderCount;
    
    document.getElementById('cloudBackupModal').classList.add('active');
    document.getElementById('cloudBackupStatus').textContent = '';
    
    // 更新授权状态显示（会进行后端验证）
    await updateAuthStatusDisplay();
    
    // 如果有服务器配置，检查WebDAV状态（不管Token是否有效都显示）
    if (cloudBackupServerUrl) {
        await checkWebDAVStatus();
    } else {
        // 没有服务器配置时隐藏WebDAV横幅
        const banner = document.getElementById('webdavStatusBanner');
        if (banner) banner.style.display = 'none';
    }
    
    // 只有在验证通过后才加载备份列表
    if (cloudBackupServerUrl && cloudBackupToken && lastVerifiedToken === cloudBackupToken) {
        await loadCloudBackupList();
    } else {
    }
}

// 更新授权状态显示
async function updateAuthStatusDisplay() {
    const statusEl = document.getElementById('authStatus');
    const btnEl = document.getElementById('btnAuthLogin');
    
    // 先从storage重新读取Token，确保使用最新的值
    try {
        const result = await chrome.storage.local.get(['cloudBackupToken']);
        if (result.cloudBackupToken && result.cloudBackupToken !== cloudBackupToken) {
            cloudBackupToken = result.cloudBackupToken;
        }
    } catch (e) {
        console.error('[授权状态] 读取storage失败:', e);
    }
    if (!cloudBackupToken || !cloudBackupServerUrl) {
        statusEl.innerHTML = '<span style="color: #ef4444;">❌ 未授权</span>';
        statusEl.style.borderColor = '#fecaca';
        statusEl.style.background = '#fef2f2';
        btnEl.textContent = '授权';
        btnEl.style.background = '#10b981';
        btnEl.disabled = false;
        btnEl.style.opacity = '1';
        enableCloudBackupOperations();
        return;
    }
    
    // 禁用所有操作，直到验证完成
    disableCloudBackupOperations();
    
    // 显示验证中状态
    statusEl.innerHTML = '<span style="color: #666;">⏳ 验证授权状态...</span>';
    statusEl.style.borderColor = '#e5e7eb';
    statusEl.style.background = '#f9fafb';
    btnEl.disabled = true;
    btnEl.style.opacity = '0.6';
    
    isVerifying = true;
    
    // 验证Token是否有效（带超时和重试）
    const verifyResult = await verifyTokenWithRetry(cloudBackupToken, 1, 10000);
    
    if (!verifyResult.success) {
        console.error('[授权状态] 验证超时或失败');
        statusEl.innerHTML = '<span style="color: #6b7280;">⚠️ 网络错误，无法验证</span>';
        statusEl.style.borderColor = '#e5e7eb';
        statusEl.style.background = '#f9fafb';
        btnEl.textContent = '重试';
        btnEl.style.background = '#6b7280';
        btnEl.disabled = false;
        btnEl.style.opacity = '1';
        isVerifying = false;
        // 网络错误时保持操作禁用状态，直到验证成功
        return;
    }
    
    const data = verifyResult.data;
    if (data.success && data.valid) {
        lastVerifiedToken = cloudBackupToken; // 记录验证通过的Token
        statusEl.innerHTML = '<span style="color: #10b981;">✅ 已授权</span>';
        statusEl.style.borderColor = '#a7f3d0';
        statusEl.style.background = '#ecfdf5';
        btnEl.textContent = '重新授权';
        btnEl.style.background = '#6b7280';
        btnEl.disabled = false;
        btnEl.style.opacity = '1';
        isVerifying = false;
        // 验证成功，启用操作
        enableCloudBackupOperations();
    } else {
        // Token确实无效，清除本地Token
        cloudBackupToken = '';
        lastVerifiedToken = '';
        await chrome.storage.local.remove('cloudBackupToken');
        // 显示需要重新授权的提示
        const message = data.reason === 'password_changed' 
            ? '⚠️ 密码已修改，请重新授权' 
            : `⚠️ ${data.message || '需要重新授权'}`;
        statusEl.innerHTML = `<span style="color: #f59e0b;">${message}</span>`;
        statusEl.style.borderColor = '#fde68a';
        statusEl.style.background = '#fffbeb';
        btnEl.textContent = '重新授权';
        btnEl.style.background = '#f59e0b';
        btnEl.disabled = false;
        btnEl.style.opacity = '1';
        isVerifying = false;
        // Token无效，保持操作禁用状态
    }
}

// 显示授权登录弹窗
// 禁用云备份相关操作
function disableCloudBackupOperations() {
    const btnUpload = document.getElementById('btnUploadBackup');
    const btnRestore = document.getElementById('btnRestoreBackup');
    const autoBackupCheckbox = document.getElementById('autoBackupEnabled');
    
    if (btnUpload) {
        btnUpload.disabled = true;
        btnUpload.style.opacity = '0.5';
        btnUpload.style.cursor = 'not-allowed';
    }
    if (btnRestore) {
        btnRestore.disabled = true;
        btnRestore.style.opacity = '0.5';
        btnRestore.style.cursor = 'not-allowed';
    }
    if (autoBackupCheckbox) {
        autoBackupCheckbox.disabled = true;
        autoBackupCheckbox.style.opacity = '0.5';
        autoBackupCheckbox.style.cursor = 'not-allowed';
    }
}

// 启用云备份相关操作
function enableCloudBackupOperations() {
    const btnUpload = document.getElementById('btnUploadBackup');
    const btnRestore = document.getElementById('btnRestoreBackup');
    const autoBackupCheckbox = document.getElementById('autoBackupEnabled');
    
    if (btnUpload) {
        btnUpload.disabled = false;
        btnUpload.style.opacity = '1';
        btnUpload.style.cursor = 'pointer';
    }
    if (btnRestore) {
        btnRestore.disabled = false;
        btnRestore.style.opacity = '1';
        btnRestore.style.cursor = 'pointer';
    }
    if (autoBackupCheckbox) {
        autoBackupCheckbox.disabled = false;
        autoBackupCheckbox.style.opacity = '1';
        autoBackupCheckbox.style.cursor = 'pointer';
    }
}

// 验证Token有效性（带重试机制）
async function verifyTokenWithRetry(token, maxRetries = 1, timeout = 10000) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
        }
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            // 添加时间戳防止缓存，并设置cache: 'no-store'确保不使用缓存
            const response = await fetch(`${cloudBackupServerUrl}/api/extension/verify?_t=${Date.now()}`, {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                },
                signal: controller.signal,
                cache: 'no-store'
            });
            
            clearTimeout(timeoutId);
            const data = await response.json();
            return { success: true, data };
        } catch (error) {
            console.error(`[Token验证] 第 ${attempt + 1} 次尝试失败:`, error.message);
            
            if (attempt === maxRetries) {
                return { success: false, error: error.message };
            }
            
            // 等待1秒后重试
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// 显示授权密码输入弹窗
function showAuthPasswordModal(promptText = '请输入管理密码进行授权：') {
    return new Promise((resolve) => {
        const modal = document.getElementById('authPasswordModal');
        const input = document.getElementById('authPasswordInput');
        const errorEl = document.getElementById('authPasswordError');
        const confirmBtn = document.getElementById('btnAuthPasswordConfirm');
        const cancelBtn = document.getElementById('btnAuthPasswordCancel');
        const closeBtn = document.getElementById('authPasswordClose');
        const labelEl = modal.querySelector('.form-group label');
        
        // 重置状态
        input.value = '';
        errorEl.style.display = 'none';
        errorEl.textContent = '';
        if (labelEl) labelEl.textContent = promptText;
        
        // 显示弹窗
        modal.classList.add('active');
        input.focus();
        
        // 清理函数
        const cleanup = () => {
            modal.classList.remove('active');
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            closeBtn.removeEventListener('click', handleCancel);
            input.removeEventListener('keydown', handleKeydown);
        };
        
        // 确认处理
        const handleConfirm = () => {
            const password = input.value.trim();
            if (!password) {
                errorEl.textContent = '请输入密码';
                errorEl.style.display = 'block';
                input.focus();
                return;
            }
            cleanup();
            resolve(password);
        };
        
        // 取消处理
        const handleCancel = () => {
            cleanup();
            resolve(null);
        };
        
        // 键盘事件
        const handleKeydown = (e) => {
            if (e.key === 'Enter') {
                handleConfirm();
            } else if (e.key === 'Escape') {
                handleCancel();
            }
        };
        
        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        closeBtn.addEventListener('click', handleCancel);
        input.addEventListener('keydown', handleKeydown);
    });
}

async function showAuthLoginDialog() {
    if (!cloudBackupServerUrl) {
        alert('请先配置并测试服务器连接');
        return;
    }
    
    const password = await showAuthPasswordModal();
    if (!password) return;
    
    const statusEl = document.getElementById('cloudBackupStatus');
    const authStatusEl = document.getElementById('authStatus');
    const btnEl = document.getElementById('btnAuthLogin');
    
    // 禁用所有操作按钮
    disableCloudBackupOperations();
    
    // 显示加载状态
    statusEl.textContent = '⏳ 正在授权...';
    statusEl.style.color = '#666';
    authStatusEl.innerHTML = '<span style="color: #666;">⏳ 验证中...</span>';
    authStatusEl.style.borderColor = '#e5e7eb';
    authStatusEl.style.background = '#f9fafb';
    btnEl.disabled = true;
    btnEl.style.opacity = '0.6';
    
    isVerifying = true;
    
    try {
        // 第一步：登录获取Token
        const response = await fetch(`${cloudBackupServerUrl}/api/extension/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        
        const data = await response.json();
        
        if (!data.success || !data.token) {
            statusEl.textContent = `❌ 授权失败: ${data.message || '密码错误'}`;
            statusEl.style.color = '#ef4444';
            authStatusEl.innerHTML = '<span style="color: #ef4444;">❌ 授权失败</span>';
            authStatusEl.style.borderColor = '#fecaca';
            authStatusEl.style.background = '#fef2f2';
            btnEl.disabled = false;
            btnEl.style.opacity = '1';
            isVerifying = false;
            enableCloudBackupOperations();
            return;
        }
        // 第二步：验证Token是否真的有效（等待后端状态同步）
        statusEl.textContent = '⏳ 等待服务器确认...';
        authStatusEl.innerHTML = '<span style="color: #666;">⏳ 等待确认...</span>';
        
        const verifyResult = await verifyTokenWithRetry(data.token, 1, 10000);
        
        if (!verifyResult.success) {
            // 验证超时或失败，询问用户
            const userChoice = confirm(
                '服务器响应超时，无法确认授权状态。\n\n' +
                '点击"确定"重试验证\n' +
                '点击"取消"放弃本次授权'
            );
            
            if (userChoice) {
                // 用户选择重试
                statusEl.textContent = '⏳ 重新验证中...';
                const retryResult = await verifyTokenWithRetry(data.token, 0, 10000);
                
                if (!retryResult.success) {
                    statusEl.textContent = '❌ 验证失败，请稍后重试';
                    statusEl.style.color = '#ef4444';
                    authStatusEl.innerHTML = '<span style="color: #ef4444;">❌ 验证超时</span>';
                    authStatusEl.style.borderColor = '#fecaca';
                    authStatusEl.style.background = '#fef2f2';
                    btnEl.disabled = false;
                    btnEl.style.opacity = '1';
                    isVerifying = false;
                    enableCloudBackupOperations();
                    return;
                }
                
                // 重试成功，继续处理
                Object.assign(verifyResult, retryResult);
            } else {
                // 用户选择取消
                statusEl.textContent = '❌ 已取消授权';
                statusEl.style.color = '#ef4444';
                authStatusEl.innerHTML = '<span style="color: #ef4444;">❌ 已取消</span>';
                authStatusEl.style.borderColor = '#fecaca';
                authStatusEl.style.background = '#fef2f2';
                btnEl.disabled = false;
                btnEl.style.opacity = '1';
                isVerifying = false;
                enableCloudBackupOperations();
                return;
            }
        }
        
        // 第三步：检查验证结果
        const verifyData = verifyResult.data;
        if (!verifyData.success || !verifyData.valid) {
            statusEl.textContent = `❌ 授权失败: ${verifyData.message || 'Token无效'}`;
            statusEl.style.color = '#ef4444';
            authStatusEl.innerHTML = '<span style="color: #ef4444;">❌ Token无效</span>';
            authStatusEl.style.borderColor = '#fecaca';
            authStatusEl.style.background = '#fef2f2';
            btnEl.disabled = false;
            btnEl.style.opacity = '1';
            isVerifying = false;
            enableCloudBackupOperations();
            return;
        }
        // 第四步：保存Token
        try {
            await chrome.storage.local.set({ cloudBackupToken: data.token });
            // 验证是否真的保存成功
            const verify = await chrome.storage.local.get(['cloudBackupToken']);
            if (!verify.cloudBackupToken) {
                throw new Error('Token保存验证失败');
            }
        } catch (e) {
            console.error('[授权] 保存Token失败:', e);
            statusEl.textContent = `❌ 保存失败: ${e.message}`;
            statusEl.style.color = '#ef4444';
            authStatusEl.innerHTML = '<span style="color: #ef4444;">❌ 保存失败</span>';
            authStatusEl.style.borderColor = '#fecaca';
            authStatusEl.style.background = '#fef2f2';
            btnEl.disabled = false;
            btnEl.style.opacity = '1';
            isVerifying = false;
            enableCloudBackupOperations();
            return;
        }
        
        // 第五步：更新内存和界面
        cloudBackupToken = data.token;
        lastVerifiedToken = data.token; // 记录验证通过的Token
        statusEl.textContent = '✅ 授权成功';
        statusEl.style.color = '#10b981';
        authStatusEl.innerHTML = '<span style="color: #10b981;">✅ 已授权</span>';
        authStatusEl.style.borderColor = '#a7f3d0';
        authStatusEl.style.background = '#ecfdf5';
        btnEl.textContent = '重新授权';
        btnEl.style.background = '#6b7280';
        btnEl.disabled = false;
        btnEl.style.opacity = '1';
        
        isVerifying = false;
        enableCloudBackupOperations();
    } catch (error) {
        console.error('[授权] 授权过程出错:', error);
        statusEl.textContent = `❌ 授权失败: ${error.message}`;
        statusEl.style.color = '#ef4444';
        authStatusEl.innerHTML = '<span style="color: #ef4444;">❌ 网络错误</span>';
        authStatusEl.style.borderColor = '#fecaca';
        authStatusEl.style.background = '#fef2f2';
        btnEl.disabled = false;
        btnEl.style.opacity = '1';
        isVerifying = false;
        enableCloudBackupOperations();
    }
}

// 获取认证头
function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (cloudBackupToken) {
        headers['Authorization'] = `Bearer ${cloudBackupToken}`;
    }
    return headers;
}

// 检查是否已授权
function isAuthorized() {
    return !!cloudBackupToken;
}

// 检查WebDAV配置状态并显示提示横幅
async function checkWebDAVStatus() {
    const banner = document.getElementById('webdavStatusBanner');
    if (!banner || !cloudBackupServerUrl) {
        if (banner) banner.style.display = 'none';
        return;
    }
    
    try {
        const response = await fetch(`${cloudBackupServerUrl}/api/bookmark-sync/webdav/status`);
        const data = await response.json();
        
        if (!data.success) {
            banner.style.display = 'none';
            return;
        }
        
        if (!data.configured) {
            // WebDAV未配置 - 显示警告横幅
            banner.style.display = 'block';
            banner.style.background = 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)';
            banner.style.border = '1px solid #f59e0b';
            banner.style.color = '#92400e';
            banner.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 16px;">⚠️</span>
                        <div>
                            <div style="font-weight: 600;">WebDAV云存储未配置</div>
                            <div style="font-size: 12px; margin-top: 2px;">配置WebDAV后，书签备份将自动同步到云端，实现多设备同步和容灾备份</div>
                        </div>
                    </div>
                    <a href="${cloudBackupServerUrl}/admin" target="_blank" class="btn btn-small" style="background: #f59e0b; color: white; text-decoration: none; white-space: nowrap;">
                        前往配置 →
                    </a>
                </div>
            `;
        } else if (!data.connected) {
            // WebDAV已配置但连接失败 - 显示错误横幅
            banner.style.display = 'block';
            banner.style.background = 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)';
            banner.style.border = '1px solid #ef4444';
            banner.style.color = '#991b1b';
            banner.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 16px;">❌</span>
                    <div>
                        <div style="font-weight: 600;">WebDAV连接失败</div>
                        <div style="font-size: 12px; margin-top: 2px;">${data.message || '请检查WebDAV配置是否正确'}</div>
                    </div>
                </div>
            `;
        } else {
            // WebDAV已配置且连接正常 - 显示成功横幅
            banner.style.display = 'block';
            banner.style.background = 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)';
            banner.style.border = '1px solid #10b981';
            banner.style.color = '#065f46';
            banner.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 16px;">✅</span>
                    <div>
                        <div style="font-weight: 600;">WebDAV云存储已连接</div>
                        <div style="font-size: 12px; margin-top: 2px;">书签备份将自动同步到云端，支持多设备同步</div>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        // 网络错误 - 隐藏横幅
        banner.style.display = 'none';
    }
}

// 关闭云备份弹窗
function closeCloudBackupModal() {
    document.getElementById('cloudBackupModal').classList.remove('active');
}

// 验证服务器URL安全性
function validateServerUrl(url) {
    if (!url || typeof url !== 'string') {
        return { valid: false, error: '请输入服务器地址' };
    }
    
    // 移除首尾空格
    url = url.trim();
    
    // 长度限制
    if (url.length > 200) {
        return { valid: false, error: '服务器地址过长' };
    }
    
    // 检查危险字符（防止注入）
    if (/[<>\"\'`\$\{\}]/.test(url)) {
        return { valid: false, error: '服务器地址包含非法字符' };
    }
    
    try {
        const parsed = new URL(url);
        
        // 只允许http和https协议
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return { valid: false, error: '只支持 http:// 或 https:// 协议' };
        }
        
        // 禁止本地文件协议
        if (parsed.hostname === '' || parsed.hostname === 'localhost' && parsed.port === '') {
            // localhost需要端口号（开发环境）
        }
        
        // 禁止内网IP（可选，根据需求）
        // const ip = parsed.hostname;
        // if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(ip)) {
        //     return { valid: false, error: '不支持内网地址' };
        // }
        
        return { valid: true, url: parsed.origin };
    } catch (e) {
        return { valid: false, error: '无效的URL格式' };
    }
}

// 验证密码安全性
function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: '请输入密码' };
    }
    
    // 长度限制
    if (password.length > 100) {
        return { valid: false, error: '密码过长' };
    }
    
    // 检查危险字符（防止注入，但密码允许大部分特殊字符）
    if (/[<>]/.test(password)) {
        return { valid: false, error: '密码包含非法字符' };
    }
    
    return { valid: true };
}

// 测试服务器连接
async function testBackupServerConnection() {
    const serverUrlInput = document.getElementById('cloudBackupServer').value;
    const statusEl = document.getElementById('backupServerStatus');
    
    // 验证URL
    const urlValidation = validateServerUrl(serverUrlInput);
    if (!urlValidation.valid) {
        statusEl.textContent = `❌ ${urlValidation.error}`;
        statusEl.style.color = '#dc2626';
        return;
    }
    
    const serverUrl = urlValidation.url;
    
    statusEl.textContent = '⏳ 正在测试连接...';
    statusEl.style.color = '#666';
    
    try {
        const response = await fetch(`${serverUrl}/api/bookmark-sync/list`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            cloudBackupServerUrl = serverUrl;
            // 保存服务器地址（已验证）
            await chrome.storage.local.set({ cloudBackupServer: serverUrl });
            // 更新输入框为规范化的URL
            document.getElementById('cloudBackupServer').value = serverUrl;
            
            statusEl.textContent = '✅ 连接成功';
            statusEl.style.color = '#059669';
            
            // 加载备份列表
            await loadCloudBackupList();
        } else {
            const data = await response.json();
            statusEl.textContent = `❌ 连接失败: ${data.message || '未知错误'}`;
            statusEl.style.color = '#dc2626';
        }
    } catch (error) {
        statusEl.textContent = `❌ 连接失败: ${error.message}`;
        statusEl.style.color = '#dc2626';
    }
}

// 加载云端备份列表（仅更新备份历史列表，不更新恢复下拉框）
async function loadCloudBackupList() {
    if (!cloudBackupServerUrl) return;
    
    const listEl = document.getElementById('cloudBackupList');
    const statsEl = document.getElementById('backupStats');
    
    listEl.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">加载中...</div>';
    if (statsEl) statsEl.textContent = '';
    
    // 同时加载恢复下拉框（根据当前恢复来源）
    loadRestoreBackupSelect(currentRestoreSource);
    
    try {
        const response = await fetch(`${cloudBackupServerUrl}/api/bookmark-sync/list`);
        const data = await response.json();
        
        if (data.success && data.backups) {
            if (data.backups.length === 0) {
                listEl.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">暂无备份</div>';
                if (statsEl) statsEl.textContent = '';
                return;
            }
            
            // 统计各类型备份数量
            const typeCounts = { auto: 0, daily: 0, weekly: 0, monthly: 0, manual: 0 };
            data.backups.forEach(b => {
                const type = b.type || 'manual';
                if (typeCounts[type] !== undefined) typeCounts[type]++;
            });
            
            // 显示统计信息
            if (statsEl) {
                const parts = [];
                if (typeCounts.auto > 0) parts.push(`自动${typeCounts.auto}`);
                if (typeCounts.daily > 0) parts.push(`每日${typeCounts.daily}`);
                if (typeCounts.weekly > 0) parts.push(`每周${typeCounts.weekly}`);
                if (typeCounts.monthly > 0) parts.push(`每月${typeCounts.monthly}`);
                if (typeCounts.manual > 0) parts.push(`手动${typeCounts.manual}`);
                statsEl.textContent = `共 ${data.backups.length} 个（${parts.join('/')}）`;
            }
            
            // 更新列表
            listEl.innerHTML = data.backups.map(b => `
                <div style="display: flex; align-items: center; padding: 10px 12px; border-bottom: 1px solid #f0f0f0; gap: 12px;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-weight: 500; color: #333;">${b.deviceName || '未知设备'}</span>
                            <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; ${getBackupTypeStyle(b.type)}">${getBackupTypeLabel(b.type)}</span>
                        </div>
                        <div style="font-size: 12px; color: #666; margin-top: 2px;">
                            ${b.bookmarkCount || 0} 个书签, ${b.folderCount || 0} 个文件夹 · ${b.size}
                        </div>
                        <div style="font-size: 11px; color: #999; margin-top: 2px;">${formatBackupTime(b.backupTime)}</div>
                    </div>
                    <button class="btn btn-small btn-danger btn-delete-backup" data-filename="${b.filename}" title="删除">🗑️</button>
                </div>
            `).join('');
            
            // 绑定删除按钮事件
            listEl.querySelectorAll('.btn-delete-backup').forEach(btn => {
                btn.addEventListener('click', () => {
                    deleteCloudBackup(btn.dataset.filename);
                });
            });
        } else {
            listEl.innerHTML = `<div style="padding: 20px; text-align: center; color: #dc2626;">${data.message || '加载失败'}</div>`;
        }
    } catch (error) {
        listEl.innerHTML = `<div style="padding: 20px; text-align: center; color: #dc2626;">加载失败: ${error.message}</div>`;
    }
}

// 获取备份类型标签
function getBackupTypeLabel(type) {
    const labels = {
        auto: '自动',
        daily: '每日',
        weekly: '每周',
        monthly: '每月',
        manual: '手动'
    };
    return labels[type] || '手动';
}

// 获取备份类型样式
function getBackupTypeStyle(type) {
    const styles = {
        auto: 'background: #dbeafe; color: #1d4ed8;',
        daily: 'background: #dcfce7; color: #166534;',
        weekly: 'background: #fef3c7; color: #92400e;',
        monthly: 'background: #f3e8ff; color: #7c3aed;',
        manual: 'background: #f3f4f6; color: #374151;'
    };
    return styles[type] || styles.manual;
}

// 格式化备份时间
function formatBackupTime(isoString) {
    if (!isoString) return '未知时间';
    try {
        const date = new Date(isoString);
        return date.toLocaleString('zh-CN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    } catch (e) {
        return isoString;
    }
}

// 备份选择变化
async function onBackupSelectChange() {
    const filename = document.getElementById('cloudBackupSelect').value;
    const infoEl = document.getElementById('selectedBackupInfo');
    
    if (!filename) {
        infoEl.textContent = '';
        return;
    }
    
    try {
        const response = await fetch(`${cloudBackupServerUrl}/api/bookmark-sync/download/${filename}`);
        const data = await response.json();
        
        if (data.success && data.backup) {
            const b = data.backup;
            infoEl.innerHTML = `
                <div>📊 ${b.stats?.bookmarkCount || 0} 个书签, ${b.stats?.folderCount || 0} 个文件夹</div>
                <div>📅 ${formatBackupTime(b.timestamp)}</div>
            `;
        }
    } catch (e) {
        infoEl.textContent = '无法加载备份信息';
    }
}

// 上传书签备份
async function uploadBookmarkBackup() {
    if (!cloudBackupServerUrl) {
        alert('请先测试服务器连接');
        return;
    }
    
    // 检查是否已授权
    if (!isAuthorized()) {
        alert('请先点击"授权"按钮进行身份验证');
        return;
    }
    
    // 获取并清理设备名称（前端验证）
    let deviceName = document.getElementById('backupDeviceName').value.trim() || '未命名设备';
    // 只允许安全字符：字母、数字、中文、下划线、连字符、空格
    deviceName = deviceName
        .replace(/<[^>]*>/g, '')  // 移除HTML标签
        .replace(/[<>\"\'&;\\\/\`\$\{\}\[\]\(\)]/g, '')  // 移除危险字符
        .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_\-\s]/g, '')  // 只保留安全字符
        .trim()
        .slice(0, 30) || '未命名设备';
    
    const statusEl = document.getElementById('cloudBackupStatus');
    
    // 保存设备名称
    await chrome.storage.local.set({ backupDeviceName: deviceName });
    
    statusEl.textContent = '⏳ 正在备份...';
    
    try {
        // 获取所有书签
        const tree = await chrome.bookmarks.getTree();
        
        const response = await fetch(`${cloudBackupServerUrl}/api/bookmark-sync/upload`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                bookmarks: tree,
                deviceName: deviceName,
                type: 'manual',  // 手动备份
                skipIfSame: false  // 手动备份不跳过
            })
        });
        
        const data = await response.json();
        
        // 检查是否Token失效
        if (response.status === 401 && data.reason === 'token_invalid') {
            cloudBackupToken = '';
            await chrome.storage.local.remove('cloudBackupToken');
            await updateAuthStatusDisplay();
            statusEl.textContent = '❌ 授权已失效，请重新授权';
            statusEl.style.color = '#ef4444';
            return;
        }
        
        if (data.success) {
            if (data.skipped) {
                statusEl.textContent = '📋 书签无变化，已跳过备份';
                statusEl.style.color = '#f59e0b';
            } else {
                let msg = `✅ 备份成功！${data.backup?.bookmarkCount || 0} 个书签`;
                if (data.cleaned > 0) msg += `，清理了 ${data.cleaned} 个旧备份`;
                statusEl.textContent = msg;
                statusEl.style.color = '#059669';
            }
            await loadCloudBackupList();
        } else {
            statusEl.textContent = `❌ 备份失败: ${data.message}`;
            statusEl.style.color = '#dc2626';
        }
    } catch (error) {
        statusEl.textContent = `❌ 备份失败: ${error.message}`;
        statusEl.style.color = '#dc2626';
    }
}

// 显示冲突处理对话框
function showConflictDialog(conflicts) {
    return new Promise((resolve) => {
        const dialog = document.createElement('div');
        dialog.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10002; display: flex; align-items: center; justify-content: center;';
        dialog.innerHTML = `
            <div style="background: white; border-radius: 12px; max-width: 700px; width: 95%; max-height: 80vh; display: flex; flex-direction: column;">
                <div style="padding: 16px 20px; border-bottom: 1px solid #e0e0e0;">
                    <div style="font-size: 18px; font-weight: 600;">⚠️ 发现 ${conflicts.length} 个重复书签</div>
                    <div style="font-size: 13px; color: #666; margin-top: 4px;">以下书签在本地已存在，请选择处理方式</div>
                </div>
                <div style="padding: 12px 20px; border-bottom: 1px solid #e0e0e0; display: flex; gap: 12px; align-items: center;">
                    <span style="font-size: 13px;">批量操作：</span>
                    <button class="btn btn-small btn-secondary" id="btnSkipAll">全部跳过</button>
                    <button class="btn btn-small btn-secondary" id="btnImportAll">全部导入（产生重复）</button>
                    <label style="display: flex; align-items: center; gap: 4px; margin-left: auto; font-size: 13px;">
                        <input type="checkbox" id="selectAllConflicts">
                        <span>全选</span>
                    </label>
                </div>
                <div style="flex: 1; overflow-y: auto; padding: 12px 20px;" id="conflictList"></div>
                <div style="padding: 16px 20px; border-top: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-size: 13px; color: #666;">
                        <span id="conflictStats">已选择跳过 0 个</span>
                    </div>
                    <div style="display: flex; gap: 12px;">
                        <button class="btn btn-secondary" id="btnCancelConflict">取消恢复</button>
                        <button class="btn btn-primary" id="btnConfirmConflict">继续恢复</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        
        // 渲染冲突列表
        const listEl = dialog.querySelector('#conflictList');
        listEl.innerHTML = conflicts.map((c, i) => `
            <div style="display: flex; align-items: center; gap: 12px; padding: 10px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px;">
                <input type="checkbox" class="conflict-checkbox" data-url="${encodeURIComponent(c.backup.url)}" data-index="${i}" checked>
                <img src="https://www.google.com/s2/favicons?domain=${new URL(c.backup.url).hostname}&sz=32" style="width: 20px; height: 20px; border-radius: 4px;">
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.backup.title || '无标题'}</div>
                    <div style="font-size: 11px; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.backup.url}</div>
                </div>
                <div style="font-size: 11px; color: #666; text-align: right;">
                    <div>本地: ${c.local.title || '无标题'}</div>
                </div>
            </div>
        `).join('');
        
        // 更新统计
        const updateStats = () => {
            const checked = dialog.querySelectorAll('.conflict-checkbox:checked').length;
            dialog.querySelector('#conflictStats').textContent = `已选择跳过 ${checked} 个`;
        };
        updateStats();
        
        // 事件绑定
        dialog.querySelectorAll('.conflict-checkbox').forEach(cb => {
            cb.addEventListener('change', updateStats);
        });
        
        dialog.querySelector('#selectAllConflicts').addEventListener('change', (e) => {
            dialog.querySelectorAll('.conflict-checkbox').forEach(cb => cb.checked = e.target.checked);
            updateStats();
        });
        
        dialog.querySelector('#btnSkipAll').addEventListener('click', () => {
            dialog.querySelectorAll('.conflict-checkbox').forEach(cb => cb.checked = true);
            dialog.querySelector('#selectAllConflicts').checked = true;
            updateStats();
        });
        
        dialog.querySelector('#btnImportAll').addEventListener('click', () => {
            dialog.querySelectorAll('.conflict-checkbox').forEach(cb => cb.checked = false);
            dialog.querySelector('#selectAllConflicts').checked = false;
            updateStats();
        });
        
        dialog.querySelector('#btnCancelConflict').addEventListener('click', () => {
            dialog.remove();
            resolve(null);
        });
        
        dialog.querySelector('#btnConfirmConflict').addEventListener('click', () => {
            const skipUrls = new Set();
            dialog.querySelectorAll('.conflict-checkbox:checked').forEach(cb => {
                skipUrls.add(decodeURIComponent(cb.dataset.url));
            });
            dialog.remove();
            resolve({ skipUrls });
        });
    });
}

// 显示恢复模式选择对话框
function showRestoreModeDialog() {
    return new Promise((resolve) => {
        const dialog = document.createElement('div');
        dialog.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10001; display: flex; align-items: center; justify-content: center;';
        dialog.innerHTML = `
            <div style="background: white; border-radius: 12px; padding: 24px; max-width: 450px; width: 90%;">
                <div style="font-size: 18px; font-weight: 600; margin-bottom: 16px;">📥 选择恢复模式</div>
                <div style="margin-bottom: 20px;">
                    <label style="display: flex; align-items: flex-start; gap: 12px; padding: 14px; border: 2px solid #e0e0e0; border-radius: 8px; cursor: pointer; margin-bottom: 12px; transition: all 0.2s;" id="modeFolder">
                        <input type="radio" name="restoreMode" value="folder" style="margin-top: 4px;">
                        <div>
                            <div style="font-weight: 500;">📁 恢复到独立文件夹</div>
                            <div style="font-size: 13px; color: #666; margin-top: 4px;">在书签栏创建"云端恢复"文件夹，所有书签放入其中。<br>✅ 安全，不影响现有书签</div>
                        </div>
                    </label>
                    <label style="display: flex; align-items: flex-start; gap: 12px; padding: 14px; border: 2px solid #e0e0e0; border-radius: 8px; cursor: pointer; transition: all 0.2s;" id="modeDirect">
                        <input type="radio" name="restoreMode" value="direct" checked style="margin-top: 4px;">
                        <div>
                            <div style="font-weight: 500;">🔄 直接恢复到原位置</div>
                            <div style="font-size: 13px; color: #666; margin-top: 4px;">书签栏内容恢复到书签栏，其他书签恢复到其他书签。<br>⚠️ 可能产生重复，恢复后可用"查找重复"清理</div>
                        </div>
                    </label>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 12px;">
                    <button class="btn btn-secondary" id="btnCancelRestore">取消</button>
                    <button class="btn btn-primary" id="btnConfirmRestore">确认恢复</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        
        // 高亮选中项
        const updateHighlight = () => {
            const selected = dialog.querySelector('input[name="restoreMode"]:checked').value;
            dialog.querySelector('#modeFolder').style.borderColor = selected === 'folder' ? '#3b82f6' : '#e0e0e0';
            dialog.querySelector('#modeFolder').style.background = selected === 'folder' ? '#eff6ff' : 'white';
            dialog.querySelector('#modeDirect').style.borderColor = selected === 'direct' ? '#3b82f6' : '#e0e0e0';
            dialog.querySelector('#modeDirect').style.background = selected === 'direct' ? '#eff6ff' : 'white';
        };
        updateHighlight();
        
        dialog.querySelectorAll('input[name="restoreMode"]').forEach(input => {
            input.addEventListener('change', updateHighlight);
        });
        
        dialog.querySelector('#btnCancelRestore').addEventListener('click', () => {
            dialog.remove();
            resolve(null);
        });
        
        dialog.querySelector('#btnConfirmRestore').addEventListener('click', () => {
            const mode = dialog.querySelector('input[name="restoreMode"]:checked').value;
            dialog.remove();
            resolve(mode);
        });
    });
}

// 删除云端备份
async function deleteCloudBackup(filename) {
    if (!isAuthorized()) {
        alert('请先点击"授权"按钮进行身份验证');
        return;
    }
    
    if (!confirm('确定要删除这个备份吗？')) return;
    
    try {
        const response = await fetch(`${cloudBackupServerUrl}/api/bookmark-sync/delete/${filename}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        // 检查是否Token失效
        if (response.status === 401 && data.reason === 'token_invalid') {
            cloudBackupToken = '';
            await chrome.storage.local.remove('cloudBackupToken');
            await updateAuthStatusDisplay();
            alert('授权已失效，请重新授权');
            return;
        }
        
        if (data.success) {
            await loadCloudBackupList();
        } else {
            alert('删除失败: ' + (data.message || '未知错误'));
        }
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

// ==================== 自动备份功能 ====================

// 切换自动备份
async function toggleAutoBackup(e) {
    const enabled = e.target.checked;
    const serverUrl = document.getElementById('cloudBackupServer').value.trim();
    const deviceName = document.getElementById('backupDeviceName').value.trim();
    
    if (enabled) {
        // 检查必要配置
        if (!serverUrl) {
            alert('请先配置服务器地址');
            e.target.checked = false;
            return;
        }
        if (!isAuthorized()) {
            alert('请先点击"授权"按钮进行身份验证');
            e.target.checked = false;
            return;
        }
    }
    
    // 保存配置（使用Token而非密码）
    await chrome.storage.local.set({
        autoBookmarkBackupEnabled: enabled,
        cloudBackupServer: serverUrl,
        backupDeviceName: deviceName || 'Chrome'
    });
    
    updateAutoBackupStatus(enabled);
    
    if (enabled) {
        document.getElementById('cloudBackupStatus').textContent = '✅ 自动备份已启用';
        document.getElementById('cloudBackupStatus').style.color = '#059669';
    } else {
        document.getElementById('cloudBackupStatus').textContent = '自动备份已关闭';
        document.getElementById('cloudBackupStatus').style.color = '#666';
    }
}

// 更新自动备份状态显示
function updateAutoBackupStatus(enabled) {
    const statusEl = document.getElementById('autoBackupStatus');
    if (enabled) {
        statusEl.innerHTML = `
            <div style="color: #059669; font-weight: 500;">✅ 自动备份已启用</div>
            <div style="font-size: 12px; color: #666; margin-top: 4px; line-height: 1.6;">
                • 书签变化后5分钟自动备份（保留最近10个）<br>
                • 每天凌晨2点执行每日备份（保留7天）<br>
                • 每周一执行每周备份（保留4周）<br>
                • 每月1号执行每月备份（保留3个月）
            </div>
        `;
    } else {
        statusEl.textContent = '未启用 - 开启后将自动备份书签变化';
    }
}

// ==================== WebDAV独立备份功能 ====================

let currentBackupSource = 'local'; // 当前备份历史来源: 'local' 或 'webdav'
let currentRestoreSource = 'local'; // 当前恢复来源: 'local' 或 'webdav'

// 切换备份历史来源
async function switchBackupSource(source) {
    currentBackupSource = source;
    
    // 更新按钮状态
    document.querySelectorAll('.backup-source-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.source === source);
        btn.classList.toggle('btn-primary', btn.dataset.source === source);
        btn.classList.toggle('btn-secondary', btn.dataset.source !== source);
    });
    
    // 加载对应来源的备份列表
    if (source === 'webdav') {
        await loadWebDAVBackupList();
    } else {
        await loadCloudBackupList();
    }
}

// 切换恢复来源
async function switchRestoreSource(source) {
    currentRestoreSource = source;
    
    // 更新按钮状态
    document.querySelectorAll('.restore-source-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.source === source);
        btn.classList.toggle('btn-primary', btn.dataset.source === source);
        btn.classList.toggle('btn-secondary', btn.dataset.source !== source);
    });
    
    // 加载对应来源的备份到下拉框
    await loadRestoreBackupSelect(source);
}

// 加载恢复备份下拉框
async function loadRestoreBackupSelect(source) {
    const selectEl = document.getElementById('cloudBackupSelect');
    const infoEl = document.getElementById('selectedBackupInfo');
    
    if (!cloudBackupServerUrl) {
        selectEl.innerHTML = '<option value="">-- 请先测试连接 --</option>';
        if (infoEl) infoEl.textContent = '';
        return;
    }
    
    selectEl.innerHTML = '<option value="">加载中...</option>';
    
    try {
        let apiPath = source === 'webdav' 
            ? `${cloudBackupServerUrl}/api/bookmark-sync/webdav/list`
            : `${cloudBackupServerUrl}/api/bookmark-sync/list`;
        
        const response = await fetch(apiPath);
        const data = await response.json();
        
        if (!data.success && source === 'webdav') {
            selectEl.innerHTML = '<option value="">-- WebDAV未配置 --</option>';
            if (infoEl) infoEl.innerHTML = '<span style="color: #f59e0b;">请先在管理后台配置WebDAV</span>';
            return;
        }
        
        if (!data.backups || data.backups.length === 0) {
            selectEl.innerHTML = '<option value="">-- 暂无备份 --</option>';
            if (infoEl) infoEl.textContent = '';
            return;
        }
        
        const sourceLabel = source === 'webdav' ? 'WebDAV' : '服务器';
        selectEl.innerHTML = `<option value="">-- 选择${sourceLabel}备份 --</option>` +
            data.backups.map(b => {
                const time = source === 'webdav' ? formatBackupTime(b.lastmod) : formatBackupTime(b.backupTime);
                return `<option value="${b.filename}" data-source="${source}">${b.deviceName || '未知设备'} - ${time}</option>`;
            }).join('');
        
        if (infoEl) infoEl.textContent = '';
        
    } catch (error) {
        selectEl.innerHTML = '<option value="">-- 加载失败 --</option>';
        if (infoEl) infoEl.innerHTML = `<span style="color: #dc2626;">${error.message}</span>`;
    }
}

// 加载WebDAV备份列表（仅更新备份历史列表，不更新恢复下拉框）
async function loadWebDAVBackupList() {
    if (!cloudBackupServerUrl) {
        document.getElementById('cloudBackupList').innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">请先测试服务器连接</div>';
        return;
    }
    
    const listEl = document.getElementById('cloudBackupList');
    const statsEl = document.getElementById('backupStats');
    
    listEl.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">正在从WebDAV加载...</div>';
    if (statsEl) statsEl.textContent = '';
    
    try {
        const response = await fetch(`${cloudBackupServerUrl}/api/bookmark-sync/webdav/list`);
        const data = await response.json();
        
        if (!data.success) {
            const webdavConfigUrl = cloudBackupServerUrl ? `${cloudBackupServerUrl}/admin` : '#';
            listEl.innerHTML = `
                <div style="padding: 20px; text-align: center;">
                    <div style="color: #f59e0b; margin-bottom: 8px;">⚠️ ${data.message || 'WebDAV未配置'}</div>
                    <a href="${webdavConfigUrl}" target="_blank" style="color: #3b82f6; font-size: 13px; text-decoration: underline; cursor: pointer;">
                        👉 前往管理后台配置WebDAV
                    </a>
                </div>`;
            return;
        }
        
        if (!data.backups || data.backups.length === 0) {
            listEl.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">WebDAV上暂无书签备份</div>';
            if (statsEl) statsEl.textContent = '';
            return;
        }
        
        // 统计各类型备份数量
        const typeCounts = { auto: 0, daily: 0, weekly: 0, monthly: 0, manual: 0 };
        data.backups.forEach(b => {
            const type = b.type || 'manual';
            if (typeCounts[type] !== undefined) typeCounts[type]++;
        });
        
        // 显示统计信息
        if (statsEl) {
            const parts = [];
            if (typeCounts.auto > 0) parts.push(`自动${typeCounts.auto}`);
            if (typeCounts.daily > 0) parts.push(`每日${typeCounts.daily}`);
            if (typeCounts.weekly > 0) parts.push(`每周${typeCounts.weekly}`);
            if (typeCounts.monthly > 0) parts.push(`每月${typeCounts.monthly}`);
            if (typeCounts.manual > 0) parts.push(`手动${typeCounts.manual}`);
            statsEl.innerHTML = `<span style="color: #7c3aed;">WebDAV</span> ${data.backups.length} 个（${parts.join('/')}）`;
        }
        
        // 更新列表
        listEl.innerHTML = data.backups.map(b => `
            <div style="display: flex; align-items: center; padding: 10px 12px; border-bottom: 1px solid #f0f0f0; gap: 12px;">
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-weight: 500; color: #333;">${b.deviceName || '未知设备'}</span>
                        <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; ${getBackupTypeStyle(b.type)}">${getBackupTypeLabel(b.type)}</span>
                        <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #f3e8ff; color: #7c3aed;">WebDAV</span>
                    </div>
                    <div style="font-size: 12px; color: #666; margin-top: 2px;">${b.size}</div>
                    <div style="font-size: 11px; color: #999; margin-top: 2px;">${formatBackupTime(b.lastmod)}</div>
                </div>
                <button class="btn btn-small btn-danger btn-delete-webdav-backup" data-filename="${b.filename}" title="删除">🗑️</button>
            </div>
        `).join('');
        
        // 绑定删除按钮事件
        listEl.querySelectorAll('.btn-delete-webdav-backup').forEach(btn => {
            btn.addEventListener('click', () => {
                deleteWebDAVBackup(btn.dataset.filename);
            });
        });
        
    } catch (error) {
        listEl.innerHTML = `<div style="padding: 20px; text-align: center; color: #dc2626;">加载失败: ${error.message}</div>`;
    }
}

// 删除WebDAV备份
async function deleteWebDAVBackup(filename) {
    if (!isAuthorized()) {
        alert('请先点击"授权"按钮进行身份验证');
        return;
    }
    
    if (!confirm('确定要从WebDAV删除这个备份吗？')) return;
    
    try {
        const response = await fetch(`${cloudBackupServerUrl}/api/bookmark-sync/webdav/delete/${filename}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (response.status === 401 && data.reason === 'token_invalid') {
            cloudBackupToken = '';
            await chrome.storage.local.remove('cloudBackupToken');
            await updateAuthStatusDisplay();
            alert('授权已失效，请重新授权');
            return;
        }
        
        if (data.success) {
            await loadWebDAVBackupList();
        } else {
            alert('删除失败: ' + (data.message || '未知错误'));
        }
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

// 从WebDAV同步备份到本地
async function syncFromWebDAV() {
    if (!cloudBackupServerUrl) {
        alert('请先测试服务器连接');
        return;
    }
    
    if (!isAuthorized()) {
        alert('请先点击"授权"按钮进行身份验证');
        return;
    }
    
    const statusEl = document.getElementById('cloudBackupStatus');
    statusEl.textContent = '⏳ 正在从WebDAV下载...';
    statusEl.style.color = '#666';
    
    try {
        const response = await fetch(`${cloudBackupServerUrl}/api/bookmark-sync/webdav/sync-to-local`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (response.status === 401 && data.reason === 'token_invalid') {
            cloudBackupToken = '';
            await chrome.storage.local.remove('cloudBackupToken');
            await updateAuthStatusDisplay();
            statusEl.textContent = '❌ 授权已失效，请重新授权';
            statusEl.style.color = '#ef4444';
            return;
        }
        
        if (data.success) {
            statusEl.textContent = `✅ ${data.message}`;
            statusEl.style.color = '#059669';
            // 刷新本地备份列表
            if (currentBackupSource === 'local') {
                await loadCloudBackupList();
            }
        } else {
            statusEl.textContent = `❌ 下载失败: ${data.message}`;
            statusEl.style.color = '#dc2626';
        }
    } catch (error) {
        statusEl.textContent = `❌ 下载失败: ${error.message}`;
        statusEl.style.color = '#dc2626';
    }
}

// 同步本地备份到WebDAV
async function syncToWebDAV() {
    if (!cloudBackupServerUrl) {
        alert('请先测试服务器连接');
        return;
    }
    
    if (!isAuthorized()) {
        alert('请先点击"授权"按钮进行身份验证');
        return;
    }
    
    const statusEl = document.getElementById('cloudBackupStatus');
    statusEl.textContent = '⏳ 正在上传到WebDAV...';
    statusEl.style.color = '#666';
    
    try {
        const response = await fetch(`${cloudBackupServerUrl}/api/bookmark-sync/webdav/sync-to-webdav`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (response.status === 401 && data.reason === 'token_invalid') {
            cloudBackupToken = '';
            await chrome.storage.local.remove('cloudBackupToken');
            await updateAuthStatusDisplay();
            statusEl.textContent = '❌ 授权已失效，请重新授权';
            statusEl.style.color = '#ef4444';
            return;
        }
        
        if (data.success) {
            statusEl.textContent = `✅ ${data.message}`;
            statusEl.style.color = '#059669';
            // 刷新WebDAV备份列表
            if (currentBackupSource === 'webdav') {
                await loadWebDAVBackupList();
            }
            // 刷新WebDAV状态
            await checkWebDAVStatus();
        } else {
            statusEl.textContent = `❌ 上传失败: ${data.message}`;
            statusEl.style.color = '#dc2626';
        }
    } catch (error) {
        statusEl.textContent = `❌ 上传失败: ${error.message}`;
        statusEl.style.color = '#dc2626';
    }
}

// 修改恢复函数以支持WebDAV来源
async function restoreBookmarkBackup() {
    const selectEl = document.getElementById('cloudBackupSelect');
    const filename = selectEl.value;
    const statusEl = document.getElementById('cloudBackupStatus');
    
    if (!filename) {
        alert('请选择要恢复的备份');
        return;
    }
    
    if (!isAuthorized()) {
        alert('请先点击"授权"按钮进行身份验证');
        return;
    }
    
    // 使用恢复来源设置来确定是否从WebDAV恢复
    const isWebDAV = currentRestoreSource === 'webdav';
    
    // 让用户选择恢复模式
    const restoreMode = await showRestoreModeDialog();
    if (!restoreMode) return;
    
    statusEl.textContent = '⏳ 正在分析备份数据...';
    
    try {
        // 根据来源获取备份数据
        const apiPath = isWebDAV 
            ? `${cloudBackupServerUrl}/api/bookmark-sync/webdav/download/${filename}`
            : `${cloudBackupServerUrl}/api/bookmark-sync/download/${filename}`;
        
        const response = await fetch(apiPath);
        const data = await response.json();
        
        if (!data.success || !data.backup) {
            throw new Error(data.message || '获取备份失败');
        }
        
        const backupData = data.backup;
        
        // 获取当前浏览器的书签树
        const tree = await chrome.bookmarks.getTree();
        const bookmarkBar = tree[0]?.children?.[0];
        const otherBookmarks = tree[0]?.children?.[1];
        
        if (!bookmarkBar) {
            throw new Error('无法找到书签栏');
        }
        
        // 收集本地所有书签URL
        const localBookmarks = [];
        collectAllBookmarks(tree, localBookmarks);
        const localUrlMap = new Map();
        localBookmarks.forEach(b => {
            if (b.url) localUrlMap.set(b.url, b);
        });
        
        // 收集备份中的所有书签
        const backupBookmarksList = [];
        function collectBackupBookmarks(nodes) {
            for (const node of nodes) {
                if (node.children) {
                    collectBackupBookmarks(node.children);
                } else if (node.url) {
                    backupBookmarksList.push(node);
                }
            }
        }
        const bookmarksToImport = backupData.bookmarks || [];
        for (const root of bookmarksToImport) {
            if (root.children) collectBackupBookmarks(root.children);
        }
        
        // 检测冲突
        const conflicts = [];
        for (const backupItem of backupBookmarksList) {
            if (localUrlMap.has(backupItem.url)) {
                conflicts.push({
                    backup: backupItem,
                    local: localUrlMap.get(backupItem.url)
                });
            }
        }
        
        // 如果有冲突，让用户选择处理方式
        let skipUrls = new Set();
        if (conflicts.length > 0 && restoreMode === 'direct') {
            statusEl.textContent = `发现 ${conflicts.length} 个冲突书签...`;
            const conflictResult = await showConflictDialog(conflicts);
            if (!conflictResult) return;
            skipUrls = conflictResult.skipUrls;
        }
        
        statusEl.textContent = '⏳ 正在恢复...';
        
        // 递归导入书签
        let importedCount = 0;
        let skippedCount = 0;
        
        async function importBookmarks(nodes, parentId) {
            for (const node of nodes) {
                if (node.children) {
                    const folder = await chrome.bookmarks.create({
                        parentId: parentId,
                        title: node.title || '未命名文件夹'
                    });
                    await importBookmarks(node.children, folder.id);
                } else if (node.url) {
                    if (skipUrls.has(node.url)) {
                        skippedCount++;
                        continue;
                    }
                    await chrome.bookmarks.create({
                        parentId: parentId,
                        title: node.title || node.url,
                        url: node.url
                    });
                    importedCount++;
                }
            }
        }
        
        // 执行恢复
        if (restoreMode === 'folder') {
            const timestamp = new Date().toLocaleString('zh-CN', {
                month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
            }).replace(/[\/\s:]/g, '-');
            
            const sourceName = isWebDAV ? 'WebDAV' : '云端';
            const restoreFolder = await chrome.bookmarks.create({
                parentId: bookmarkBar.id,
                title: `${sourceName}恢复-${backupData.deviceName || '未知'}-${timestamp}`
            });
            
            for (const root of bookmarksToImport) {
                if (root.children) {
                    for (const topFolder of root.children) {
                        if (topFolder.children && topFolder.children.length > 0) {
                            await importBookmarks(topFolder.children, restoreFolder.id);
                        }
                    }
                }
            }
        } else {
            for (const root of bookmarksToImport) {
                if (root.children) {
                    for (const topFolder of root.children) {
                        const isBookmarkBar = topFolder.id === '1';
                        const isOtherBookmarks = topFolder.id === '2';
                        
                        let targetFolder = bookmarkBar;
                        if (isOtherBookmarks && otherBookmarks) {
                            targetFolder = otherBookmarks;
                        }
                        
                        if (topFolder.children && topFolder.children.length > 0) {
                            await importBookmarks(topFolder.children, targetFolder.id);
                        }
                    }
                }
            }
        }
        
        let msg = `✅ 恢复成功！导入了 ${importedCount} 个书签`;
        if (skippedCount > 0) msg += `，跳过 ${skippedCount} 个重复`;
        if (isWebDAV) msg += ' (来自WebDAV)';
        statusEl.textContent = msg;
        statusEl.style.color = '#059669';
        
        await loadBookmarks();
        
    } catch (error) {
        statusEl.textContent = `❌ 恢复失败: ${error.message}`;
        statusEl.style.color = '#dc2626';
    }
}
