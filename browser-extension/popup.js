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

// 访问管理后台
document.getElementById('openNav').addEventListener('click', function() {
    chrome.storage.sync.get(['navUrl'], function(result) {
        if (result.navUrl) {
            // 管理后台地址为 domain/admin
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

// 检查云备份配置状态，显示提示
chrome.storage.local.get(['cloudBackupServer', 'cloudBackupPopupDismissed'], function(result) {
    const tip = document.getElementById('cloudBackupTip');
    if (!tip) return;
    
    // 如果已配置服务器地址，不显示提示
    if (result.cloudBackupServer) {
        tip.style.display = 'none';
        return;
    }
    
    // 检查用户是否在7天内关闭过提示
    if (result.cloudBackupPopupDismissed) {
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - result.cloudBackupPopupDismissed < sevenDays) {
            tip.style.display = 'none';
            return;
        }
    }
    
    // 显示提示
    tip.style.display = 'block';
});

// 云备份提示 - 立即配置按钮
document.getElementById('btnSetupCloudBackup').addEventListener('click', function() {
    // 打开书签管理器并自动打开云备份设置
    chrome.tabs.create({ url: chrome.runtime.getURL('bookmarks.html?openCloudBackup=true') });
    window.close();
});

// 云备份提示 - 稍后按钮
document.getElementById('btnDismissCloudTip').addEventListener('click', function() {
    document.getElementById('cloudBackupTip').style.display = 'none';
    // 记住用户选择，7天内不再提示
    chrome.storage.local.set({ cloudBackupPopupDismissed: Date.now() });
});
