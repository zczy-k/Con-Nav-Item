// popup.js - 扩展弹窗脚本

// 每次打开弹窗时刷新右键菜单分类（确保与后台管理同步）
chrome.runtime.sendMessage({ action: 'refreshMenus' }).catch(() => {});

// 加载当前设置
chrome.storage.sync.get(['navUrl', 'floatBtnEnabled'], function(result) {
    const urlElement = document.getElementById('currentUrl');
    const openNavBtn = document.getElementById('openNav');

    // 浮动按钮开关
    const floatBtnCheckbox = document.getElementById('floatBtnEnabled');
    if (floatBtnCheckbox) {
        floatBtnCheckbox.checked = result.floatBtnEnabled !== false;
        floatBtnCheckbox.addEventListener('change', function() {
            chrome.storage.sync.set({ floatBtnEnabled: this.checked });
        });
    }

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

// 检查云备份配置状态，显示提示
async function checkCloudBackupStatus() {
    const tip = document.getElementById('cloudBackupTip');
    if (!tip) return;
    
    try {
        const result = await chrome.storage.local.get(['cloudBackupServer', 'cloudBackupToken', 'cloudBackupPopupDismissed']);
        
        if (result.cloudBackupPopupDismissed) {
            const sevenDays = 7 * 24 * 60 * 60 * 1000;
            if (Date.now() - result.cloudBackupPopupDismissed < sevenDays) {
                tip.style.display = 'none';
                return;
            }
        }
        
        if (!result.cloudBackupServer) {
            tip.style.display = 'block';
            return;
        }
        
        if (!result.cloudBackupToken) {
            tip.style.display = 'block';
            return;
        }
        
        const serverUrl = result.cloudBackupServer.replace(/\/+$/, '');
        const timestamp = Date.now();
        const response = await fetch(`${serverUrl}/api/extension/verify?_t=${timestamp}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${result.cloudBackupToken}`,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            },
            cache: 'no-store'
        });
        
        const data = await response.json();
        
        if (!data.success || !data.valid) {
            tip.style.display = 'block';
            return;
        }
        
        tip.style.display = 'none';
    } catch (e) {
        console.error('[云备份检查] 验证失败:', e);
        tip.style.display = 'block';
    }
}

checkCloudBackupStatus();

// 云备份提示 - 立即配置按钮
document.getElementById('btnSetupCloudBackup').addEventListener('click', function() {
    chrome.tabs.create({ url: chrome.runtime.getURL('bookmarks.html?openCloudBackup=true') });
    window.close();
});

// 云备份提示 - 稍后按钮
document.getElementById('btnDismissCloudTip').addEventListener('click', function() {
    document.getElementById('cloudBackupTip').style.display = 'none';
    chrome.storage.local.set({ cloudBackupPopupDismissed: Date.now() });
});

// 提示框折叠/展开功能
document.getElementById('tipToggle').addEventListener('click', function() {
    const tipBox = document.getElementById('tipBox');
    const tipArrow = document.getElementById('tipArrow');
    if (tipBox.classList.contains('show')) {
        tipBox.classList.remove('show');
        tipArrow.textContent = '▶';
    } else {
        tipBox.classList.add('show');
        tipArrow.textContent = '▼';
    }
});
