// popup.js - 扩展弹窗脚本

// 每次打开弹窗时刷新右键菜单分类（确保与后台管理同步）
chrome.runtime.sendMessage({ action: 'refreshMenus' }).catch(() => {});

// 加载当前设置
chrome.storage.sync.get(['navUrl'], function(result) {
    const urlElement = document.getElementById('currentUrl');
    const openNavBtn = document.getElementById('openNav');

    if (result.navUrl) {
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

// 打开设置页面
document.getElementById('openSettings').addEventListener('click', function() {
    chrome.runtime.openOptionsPage();
});

// 访问管理后台
document.getElementById('openNav').addEventListener('click', function() {
    chrome.storage.sync.get(['navUrl'], function(result) {
        if (result.navUrl) {
            let adminUrl = result.navUrl.replace(/\/+$/, '') + '/admin';
            chrome.tabs.create({ url: adminUrl });
            window.close();
        }
    });
});

// 打开书签管理器
document.getElementById('openBookmarks').addEventListener('click', function() {
    chrome.tabs.create({ url: chrome.runtime.getURL('bookmarks.html') });
    window.close();
});

