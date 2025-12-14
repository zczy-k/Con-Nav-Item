// popup.js - 扩展弹窗脚本

// 加载当前设置
chrome.storage.sync.get(['navUrl', 'newtabMode', 'floatBtnEnabled'], function(result) {
    const urlElement = document.getElementById('currentUrl');
    const openNavBtn = document.getElementById('openNav');
    const modeSelect = document.getElementById('newtabMode');
    const navUrlInfo = document.getElementById('navUrlInfo');
    const navButtons = document.getElementById('navButtons');

    // 浮动按钮开关
    const floatBtnCheckbox = document.getElementById('floatBtnEnabled');
    if (floatBtnCheckbox) {
        floatBtnCheckbox.checked = result.floatBtnEnabled !== false;
        floatBtnCheckbox.addEventListener('change', function() {
            chrome.storage.sync.set({ floatBtnEnabled: this.checked });
        });
    }

    // 设置模式
    const mode = result.newtabMode || 'nav';
    modeSelect.value = mode;

    // 根据模式显示/隐藏导航站相关元素
    if (mode === 'quickaccess') {
        navUrlInfo.style.display = 'none';
        navButtons.style.display = 'none';
    } else {
        navUrlInfo.style.display = 'block';
        navButtons.style.display = 'flex';
    }

    if (result.navUrl) {
        // 隐藏完整网址，只显示已配置状态
        urlElement.textContent = '✅ 已配置';
        urlElement.classList.remove('empty');
        urlElement.style.color = '#10b981';
        openNavBtn.disabled = false;
    } else {
        urlElement.textContent = '❌ 未设置';
        urlElement.classList.add('empty');
        openNavBtn.disabled = true;
    }
});

// 模式切换
document.getElementById('newtabMode').addEventListener('change', function(e) {
    const mode = e.target.value;
    const navUrlInfo = document.getElementById('navUrlInfo');
    const navButtons = document.getElementById('navButtons');

    chrome.storage.sync.set({ newtabMode: mode }, function() {
        if (mode === 'quickaccess') {
            navUrlInfo.style.display = 'none';
            navButtons.style.display = 'none';
        } else {
            navUrlInfo.style.display = 'block';
            navButtons.style.display = 'flex';
        }
        alert('模式已切换，请刷新或重新打开新标签页查看效果');
    });
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
            window.close();
        }
    });
});

// 打开书签管理器
document.getElementById('openBookmarks').addEventListener('click', function() {
    chrome.tabs.create({ url: chrome.runtime.getURL('bookmarks.html') });
    window.close();
});
