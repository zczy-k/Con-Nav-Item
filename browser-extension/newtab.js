// 检查配置
chrome.storage.sync.get(['navUrl', 'offlineHtml'], function(result) {
    const navFrame = document.getElementById('navFrame');
    const setupContainer = document.getElementById('setupContainer');
    const loadingScreen = document.getElementById('loadingScreen');
    
    if (result.navUrl) {
        loadingScreen.classList.add('show');
        
        navFrame.src = result.navUrl;
        
        navFrame.onload = function() {
            setTimeout(function() {
                loadingScreen.classList.remove('show');
                navFrame.style.display = 'block';
                setTimeout(function() {
                    navFrame.classList.add('loaded');
                }, 50);
            }, 300);
        };
        
        navFrame.onerror = function() {
            loadOfflineVersion(result.offlineHtml);
        };
        
        setTimeout(function() {
            if (loadingScreen.classList.contains('show')) {
                loadOfflineVersion(result.offlineHtml);
            }
        }, 10000);
        
    } else {
        setupContainer.style.display = 'flex';
    }
});

function loadOfflineVersion(offlineHtml) {
    const navFrame = document.getElementById('navFrame');
    const loadingScreen = document.getElementById('loadingScreen');
    
    loadingScreen.classList.remove('show');
    
    if (offlineHtml) {
        navFrame.srcdoc = offlineHtml;
        navFrame.style.display = 'block';
        setTimeout(function() {
            navFrame.classList.add('loaded');
        }, 50);
    } else {
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:white;font-size:18px;">网络连接失败,且未缓存离线版本</div>';
    }
}

document.getElementById('saveBtn').addEventListener('click', function() {
    const urlInput = document.getElementById('navUrl');
    const errorDiv = document.getElementById('error');
    const loadingDiv = document.getElementById('loading');
    const url = urlInput.value.trim();
    
    if (!url) {
        errorDiv.textContent = '请输入导航站地址';
        errorDiv.style.display = 'block';
        return;
    }
    
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
    
    errorDiv.style.display = 'none';
    loadingDiv.style.display = 'block';
    
    fetch(url)
        .then(response => response.text())
        .then(html => {
            chrome.storage.sync.set({ navUrl: url, offlineHtml: html }, function() {
                location.reload();
            });
        })
        .catch(() => {
            chrome.storage.sync.set({ navUrl: url }, function() {
                location.reload();
            });
        });
});

document.getElementById('navUrl').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('saveBtn').click();
    }
});
