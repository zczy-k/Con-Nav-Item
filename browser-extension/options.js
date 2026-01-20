function loadSettings() {
    chrome.storage.sync.get(['navUrl'], function(result) {
        if (result.navUrl) {
            document.getElementById('navUrl').value = result.navUrl;
            document.getElementById('currentUrlText').textContent = result.navUrl;
            document.getElementById('currentUrl').style.display = 'block';
            testConnection(true);
        }
    });
}

function showMessage(text, type = 'success') {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = text;
    messageDiv.className = 'message ' + type;
    messageDiv.style.display = 'block';
    
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 3000);
}

function updateConnectionStatus(status) {
    const el = document.getElementById('connectionStatus');
    el.className = 'connection-status ' + status;
    
    if (status === 'connected') {
        el.textContent = '✓ 已连接';
    } else if (status === 'disconnected') {
        el.textContent = '✗ 连接失败';
    } else {
        el.textContent = '未测试';
    }
}

async function testConnection(silent = false) {
    const url = document.getElementById('navUrl').value.trim();
    
    if (!url) {
        if (!silent) showMessage('请先输入导航站地址', 'error');
        return;
    }
    
    try {
        new URL(url);
    } catch (e) {
        if (!silent) showMessage('请输入有效的 URL 地址', 'error');
        updateConnectionStatus('disconnected');
        return;
    }
    
    const testBtn = document.getElementById('testBtn');
    testBtn.innerHTML = '<span class="loading"></span>';
    testBtn.disabled = true;
    
    try {
        const response = await fetch(`${url}/api/menus`);
        if (!response.ok) throw new Error('API 请求失败');
        
        updateConnectionStatus('connected');
        if (!silent) showMessage('连接成功！');
    } catch (error) {
        updateConnectionStatus('disconnected');
        if (!silent) showMessage('连接失败：' + error.message, 'error');
    } finally {
        testBtn.innerHTML = '测试连接';
        testBtn.disabled = false;
    }
}

document.getElementById('testBtn').addEventListener('click', () => testConnection(false));

document.getElementById('saveBtn').addEventListener('click', function() {
    const url = document.getElementById('navUrl').value.trim();
    
    if (!url) {
        showMessage('请输入导航站地址', 'error');
        return;
    }
    
    try {
        const urlObj = new URL(url);
        if (!urlObj.protocol.startsWith('http')) {
            throw new Error('Invalid protocol');
        }
    } catch (e) {
        showMessage('请输入有效的 URL 地址（需包含 http:// 或 https://）', 'error');
        return;
    }
    
    chrome.storage.sync.set({ navUrl: url }, function() {
        showMessage('设置已保存！');
        document.getElementById('currentUrlText').textContent = url;
        document.getElementById('currentUrl').style.display = 'block';
    });
});

document.getElementById('resetBtn').addEventListener('click', function() {
    if (confirm('确定要重置设置吗？')) {
        chrome.storage.sync.remove(['navUrl'], function() {
            document.getElementById('navUrl').value = '';
            document.getElementById('currentUrl').style.display = 'none';
            updateConnectionStatus('unknown');
            showMessage('设置已重置');
        });
    }
});

document.addEventListener('DOMContentLoaded', loadSettings);
