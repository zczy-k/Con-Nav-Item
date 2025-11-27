// 检查是否已保存导航站地址
chrome.storage.sync.get(['navUrl', 'offlineHtml'], function(result) {
    const navFrame = document.getElementById('navFrame');
    const setupContainer = document.getElementById('setupContainer');
    
    if (result.navUrl) {
        // 已配置导航站地址,尝试加载
        navFrame.src = result.navUrl;
        navFrame.style.display = 'block';
        
        // 监听加载错误,如果网络失败则使用离线版本
        navFrame.onerror = function() {
            console.log('在线加载失败,尝试使用离线版本');
            loadOfflineVersion(result.offlineHtml);
        };
        
        // 设置超时检测
        setTimeout(function() {
            // 检查是否成功加载
            try {
                if (!navFrame.contentWindow) {
                    loadOfflineVersion(result.offlineHtml);
                }
            } catch (e) {
                // 跨域时无法访问 contentWindow,说明在线版本正在加载
            }
        }, 5000);
        
    } else {
        // 未配置,显示设置页面
        setupContainer.style.display = 'flex';
    }
});

// 加载离线版本
function loadOfflineVersion(offlineHtml) {
    const navFrame = document.getElementById('navFrame');
    if (offlineHtml) {
        // 使用保存的离线 HTML
        navFrame.srcdoc = offlineHtml;
        navFrame.style.display = 'block';
    } else {
        // 没有离线版本,显示提示
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:white;font-size:18px;">网络连接失败,且未缓存离线版本</div>';
    }
}

// 保存按钮点击事件
document.getElementById('saveBtn').addEventListener('click', function() {
    const urlInput = document.getElementById('navUrl');
    const errorDiv = document.getElementById('error');
    const loadingDiv = document.getElementById('loading');
    const url = urlInput.value.trim();
    
    // 验证 URL
    if (!url) {
        errorDiv.textContent = '请输入导航站地址';
        errorDiv.style.display = 'block';
        return;
    }
    
    // 简单的 URL 验证
    try {
        const urlObj = new URL(url);
        if (!urlObj.protocol.startsWith('http')) {
            throw new Error('Invalid protocol');
        }
    } catch (e) {
        errorDiv.textContent = '请输入有效的 URL 地址(需包含 http:// 或 https://)';
        errorDiv.style.display = 'block';
        return;
    }
    
    // 隐藏错误信息
    errorDiv.style.display = 'none';
    
    // 显示加载状态
    loadingDiv.style.display = 'block';
    
    // 尝试获取导航页内容用于离线缓存
    fetch(url)
        .then(response => response.text())
        .then(html => {
            // 保存在线地址和离线HTML
            chrome.storage.sync.set({ navUrl: url, offlineHtml: html }, function() {
                location.reload();
            });
        })
        .catch(err => {
            // 即使获取失败也保存URL
            chrome.storage.sync.set({ navUrl: url }, function() {
                location.reload();
            });
        });
});

// 回车键保存
document.getElementById('navUrl').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('saveBtn').click();
    }
});
