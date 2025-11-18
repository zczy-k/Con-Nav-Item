// 全局变量
let allTabs = [];
let selectedTabs = new Set();
let navUrl = '';

// 加载当前设置
chrome.storage.sync.get(['navUrl'], function(result) {
    const urlElement = document.getElementById('currentUrl');
    const openNavBtn = document.getElementById('openNav');
    const addCurrentBtn = document.getElementById('addCurrentTab');
    const selectTabsBtn = document.getElementById('selectTabs');
    
    if (result.navUrl) {
        navUrl = result.navUrl;
        urlElement.textContent = result.navUrl;
        urlElement.classList.remove('empty');
        openNavBtn.disabled = false;
        addCurrentBtn.disabled = false;
        selectTabsBtn.disabled = false;
    } else {
        urlElement.textContent = '未设置';
        urlElement.classList.add('empty');
        openNavBtn.disabled = true;
        addCurrentBtn.disabled = true;
        selectTabsBtn.disabled = true;
    }
});

// 打开设置页面
document.getElementById('openSettings').addEventListener('click', function() {
    chrome.runtime.openOptionsPage();
});

// 访问导航站
document.getElementById('openNav').addEventListener('click', function() {
    chrome.storage.sync.get(['navUrl'], function(result) {
        if (result.navUrl) {
            chrome.tabs.create({ url: result.navUrl });
        }
    });
});

// 添加当前标签页
document.getElementById('addCurrentTab').addEventListener('click', async function() {
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
document.getElementById('selectTabs').addEventListener('click', async function() {
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
    
    chrome.tabs.query({ active: true, currentWindow: true }, function([currentTab]) {
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
    item.addEventListener('click', function(e) {
        if (e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
        }
    });
    
    // 复选框变化
    checkbox.addEventListener('change', function(e) {
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
document.getElementById('selectAll').addEventListener('click', function() {
    const checkboxes = document.querySelectorAll('.tab-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
        selectedTabs.add(parseInt(checkbox.dataset.index));
    });
    updateConfirmButton();
});

// 清除
document.getElementById('clearAll').addEventListener('click', function() {
    const checkboxes = document.querySelectorAll('.tab-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    selectedTabs.clear();
    updateConfirmButton();
});

// 取消选择
document.getElementById('cancelSelect').addEventListener('click', function() {
    document.getElementById('tabsSelector').classList.remove('active');
    selectedTabs.clear();
});

// 确认添加
document.getElementById('confirmAdd').addEventListener('click', function() {
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
