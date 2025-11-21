<template>
  <div v-if="!isLoggedIn" class="login-container">
    <div class="login-card">
      <h2 class="login-title">后台管理登录</h2>
      <div class="login-form">
        <input v-model="username" type="text" placeholder="用户名" class="login-input" @keyup.enter="handleLogin" />
        <div class="password-input-wrapper">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="密码"
            class="login-input password-input"
            @keyup.enter="handleLogin"
          />
          <span class="toggle-password" @click="showPassword = !showPassword">
            <svg v-if="showPassword" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2566d8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
            <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2566d8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.77 21.77 0 0 1 5.06-6.06"/><path d="M1 1l22 22"/><path d="M9.53 9.53A3 3 0 0 0 12 15a3 3 0 0 0 2.47-5.47"/></svg>
          </span>
        </div>
        <div class="login-buttons">
          <button @click="goHome" class="back-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            返回首页
          </button>
          <button @click="handleLogin" class="login-btn" :disabled="loading">
            {{ loading ? '登录中...' : '登录' }}
          </button>
        </div>
        <p v-if="loginError" class="login-error">{{ loginError }}</p>
      </div>
    </div>
  </div>
  
  <div v-else class="admin-layout">
    <aside class="admin-sider" :class="{ open: siderOpen }" @click.self="closeSider">
      <div class="logo clickable" @click="page='welcome'; closeSider()">Admin</div>
      <ul class="menu-list">
        <li :class="{active: page==='menu'}" @click="page='menu'; closeSider()">栏目管理</li>
        <li :class="{active: page==='card'}" @click="page='card'; closeSider()">卡片管理</li>
        <li :class="{active: page==='duplicate'}" @click="page='duplicate'; closeSider()">去重管理</li>
        <li :class="{active: page==='tag'}" @click="page='tag'; closeSider()">标签管理</li>
        <li :class="{active: page==='ad'}" @click="page='ad'; closeSider()">广告管理</li>
        <li :class="{active: page==='friend'}" @click="page='friend'; closeSider()">友链管理</li>
        <li :class="{active: page==='user'}" @click="page='user'; closeSider()">用户管理</li>
        <li :class="{active: page==='backup'}" @click="page='backup'; closeSider()">备份管理</li>
      </ul>
    </aside>
    <main class="admin-main">
      <div class="admin-header">
        <button class="menu-toggle" @click="toggleSider">
          &#9776;
        </button>
        <div class="header-title">{{ pageTitle }}</div>
        <div class="header-actions">
          <span class="home-icon" @click="goHome" title="进入主页">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 10.5L12 4l9 6.5V20a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4h-4v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10.5z" stroke="#2566d8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <button class="btn logout-btn" @click="logout">退出登录</button>
        </div>
      </div>
      <div class="admin-content">
        <transition name="fade" mode="out-in">
          <component :is="currentComponent" :key="page" />
        </transition>
      </div>
      <footer class="admin-footer">
        <p class="admin-copyright">Copyright © 2025 Con-Nav-Item | <a href="https://github.com/zczy-k/Con-Nav-Item" target="_blank" class="footer-link">Powered by zczy-k</a></p>
      </footer>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, defineComponent } from 'vue';
import { login } from '../api';
import MenuManage from './admin/MenuManage.vue';
import CardManage from './admin/CardManage.vue';
import DuplicateManage from './admin/DuplicateManage.vue';
import TagManage from './admin/TagManage.vue';
import AdManage from './admin/AdManage.vue';
import FriendLinkManage from './admin/FriendLinkManage.vue';
import UserManage from './admin/UserManage.vue';
import BackupManage from './admin/BackupManage.vue';

// 欢迎页面组件
const WelcomePage = defineComponent({
  name: 'WelcomePage',
  props: {
    lastLoginTime: String,
    lastLoginIp: String,
    currentUsername: String
  },
  template: `
    <div class="welcome-page">
      <h2 class="welcome-title">欢迎您，{{ currentUsername || 'admin' }}！</h2>
      <div class="welcome-cards">
        <div class="welcome-card">
          <div class="welcome-icon time-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#1abc9c" stroke-width="2"/>
              <path d="M12 6v6l4 2" stroke="#1abc9c" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="welcome-label">上次登录时间</div>
          <div class="welcome-value">{{ lastLoginTime || '--' }}</div>
        </div>
        <div class="welcome-card">
          <div class="welcome-icon ip-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#1abc9c" stroke-width="2"/>
              <path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" stroke="#1abc9c" stroke-width="2"/>
              <circle cx="12" cy="12" r="2" fill="#1abc9c"/>
            </svg>
          </div>
          <div class="welcome-label">上次登录IP</div>
          <div class="welcome-value">{{ lastLoginIp || '--' }}</div>
        </div>
      </div>
    </div>
  `
});

const page = ref('welcome');

// 组件映射
const componentMap = {
  welcome: WelcomePage,
  menu: MenuManage,
  card: CardManage,
  duplicate: DuplicateManage,
  tag: TagManage,
  ad: AdManage,
  friend: FriendLinkManage,
  user: UserManage,
  backup: BackupManage
};

// 当前组件
const currentComponent = computed(() => {
  const component = componentMap[page.value];
  if (page.value === 'welcome') {
    return {
      ...component,
      props: {
        lastLoginTime: lastLoginTime.value,
        lastLoginIp: lastLoginIp.value,
        currentUsername: currentUsername.value
      }
    };
  }
  return component;
});
const lastLoginTime = ref('');
const lastLoginIp = ref('');
const currentUsername = ref('admin'); // 当前登录的用户名
const isLoggedIn = ref(false);
const username = ref('');
const password = ref('');
const loading = ref(false);
const loginError = ref('');
const showPassword = ref(false);
const siderOpen = ref(false);

const pageTitle = computed(() => {
  switch (page.value) {
    case 'menu': return '栏目管理';
    case 'card': return '卡片管理';
    case 'duplicate': return '去重管理';
    case 'tag': return '标签管理';
    case 'ad': return '广告管理';
    case 'friend': return '友链管理';
    case 'user': return '用户管理';
    case 'backup': return '备份管理';
    default: return '';
  }
});

onMounted(() => {
  const token = localStorage.getItem('token');
  isLoggedIn.value = !!token;
  if (isLoggedIn.value) {
    // 拉取用户信息
    fetchLastLoginInfo();
  }
});
async function fetchLastLoginInfo() {
  try {
    const res = await fetch('/api/users/me', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
    if (res.ok) {
      const data = await res.json();
      console.log('用户信息API返回:', data); // 调试日志
      lastLoginTime.value = data.last_login_time || '';
      lastLoginIp.value = data.last_login_ip || '';
      currentUsername.value = data.username || 'admin'; // 更新当前用户名
      console.log('当前用户名已更新为:', currentUsername.value); // 调试日志
    }
  } catch (error) {
    console.error('获取用户信息失败:', error);
  }
}

async function handleLogin() {
  if (!username.value || !password.value) {
    loginError.value = '请输入用户名和密码';
    return;
  }
  
  loading.value = true;
  loginError.value = '';
  
  try {
    const response = await login(username.value, password.value);
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
      isLoggedIn.value = true;
      lastLoginTime.value = response.data.lastLoginTime || '';
      lastLoginIp.value = response.data.lastLoginIp || '';
      // 登录成功后立即获取用户信息
      await fetchLastLoginInfo();
    }
  } catch (error) {
    loginError.value = error.response?.data?.message || '登录失败，请检查用户名和密码';
  } finally {
    loading.value = false;
  }
}

function logout() {
  localStorage.removeItem('token');
  isLoggedIn.value = false;
  username.value = '';
  password.value = '';
  loginError.value = '';
}

function goHome() {
  window.open('/', '_blank');
}
function toggleSider() {
  siderOpen.value = !siderOpen.value;
}
function closeSider() {
  siderOpen.value = false;
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg,#667eea,#764ba2);
  font-family: 'Segoe UI', Arial, sans-serif;
}

.login-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.1);
  padding: 0 40px 40px 40px;
  width: 400px;
  max-width: 90%;
}

.login-title {
  text-align: center;
  font-size: 2rem;
  font-weight: bold;
  color: #2164e1;
  margin-bottom: 32px;
  letter-spacing: 2px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.login-input {
  padding: 12px 16px;
  border: 1px solid #d0d7e2;
  border-radius: 8px;
  font-size: 16px;
  background: #fff;
  color: #222;
  height: 48px;
  line-height: 48px;
  box-sizing: border-box;
}

.login-input:focus {
  outline: 2px solid #2566d8;
  border-color: #2566d8;
}

.login-btn {
  background: #2566d8;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 12px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.login-btn:hover:not(:disabled) {
  background: #174ea6;
}

.login-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.login-buttons {
  display: flex;
  gap: 12px;
  align-items: center;
}

.back-btn {
  background: #f8f9fa;
  color: #2b2b2b;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  justify-content: center;
}

.back-btn:hover {
  background: #e9ecef;
  color: #7e42ff;
  border-color: #adb5bd;
}

.login-btn {
  flex: 2;
}

.login-error {
  color: #e74c3c;
  text-align: center;
  margin: 0;
  font-size: 14px;
}

.admin-layout {
  display: flex;
  min-height: 100vh;
  background: #f5f6fa;
  font-family: 'Segoe UI', Arial, sans-serif;
}
.admin-sider {
  width: 180px;
  background: #fff;
  color: #222;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding-top: 32px;
  box-shadow: 2px 0 8px rgba(0,0,0,0.06);
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  z-index: 100;
}
.logo {
  font-size: 2rem;
  font-weight: bold;
  text-align: center;
  margin-bottom: 32px;
  letter-spacing: 2px;
  color: #1349a6;
  cursor: pointer;
  user-select: none;
  transition: color 0.2s;
}
.logo.clickable:hover {
  color: #176efa;
}
.menu-list {
  list-style: none;
  padding: 0;
  margin: 0;
  flex: 1;
}
.menu-list li {
  padding: 16px 32px;
  cursor: pointer;
  font-size: 16px;
  border-left: 4px solid transparent;
  transition: background 0.2s, border-color 0.2s, color 0.2s;
  color: #222;
}
.menu-list li.active {
  background: #eaf1ff;
  border-left: 4px solid #2566d8;
  color: #2566d8;
  font-weight: bold;
}
.admin-main {
  flex: 1;
  background: #f5f6fa;
  padding: 64px 0 0 180px;
  min-width: 0;
  overflow-x: auto;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.admin-header {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 64px;
  padding: 0 48px 0 0;
  background: #f5f6fa;
  position: fixed;
  top: 0;
  left: 180px;
  right: 0;
  z-index: 101;
  border-bottom: 1px solid #e3e6ef;
}
.header-title {
  flex: 1;
  text-align: center;
  margin-left: 180px;
  font-size: 1.5rem;
  font-weight: 500;
  letter-spacing: 2px;
  color: #222;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.home-icon {
  display: flex;
  align-items: center;
  margin-right: 18px;
  cursor: pointer;
  border-radius: 50%;
  transition: background 0.2s;
  padding: 4px;
}
.home-icon:hover {
  background: #eaf1ff;
}
.btn.logout-btn {
  background: #f7caca;
  color: #e74c3c;
  border: 1px solid #f7caca;
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 15px;
  font-weight: 500;
  margin: 0;
  transition: background 0.2s, color 0.2s;
}
.btn.logout-btn:hover {
  background: #e74c3c;
  color: #fff;
}
.admin-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 0 0 0;
  margin-top: 0;
}
.admin-footer {
  margin-top: auto;
  text-align: center;
  padding: 2rem 0 1rem 0;
  background: transparent;
}
.admin-copyright {
  color: #1d70cc;
  font-size: 14px;
  margin: 0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
.footer-link {
  color: #1d70cc;
  text-decoration: none;
  transition: color 0.2s;
}
.footer-link:hover {
  color: #3218ed;
}
.password-input-wrapper {
  position: relative;
  width: 100%;
}
.password-input {
  width: 100%;
  padding-right: 48px;
  border-radius: 8px;
  box-sizing: border-box;
}
.toggle-password {
  position: absolute;
  top: 0;
  right: 0;
  height: 48px;
  width: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: #2566d8;
  margin: 0;
  padding: 0;
  z-index: 2;
  transition: color 0.2s;
}
.toggle-password:hover {
  color: #174ea6;
  background: none;
}
.toggle-password svg {
  display: block;
  width: 22px;
  height: 22px;
  pointer-events: none;
}
.welcome-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 48px;
}
.welcome-title {
  text-align: center;
  font-size: 2rem;
  font-weight: 600;
  color: #222;
  margin-bottom: 32px;
}
.welcome-cards {
  display: flex;
  gap: 32px;
}
.welcome-card {
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  padding: 32px 40px;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  border: 1.5px solid #e3e6ef;
}
.welcome-icon {
  width: 48px;
  height: 48px;
  background: #f5f6fa;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 18px;
}
.welcome-label {
  font-size: 1.1rem;
  color: #222;
  margin-bottom: 8px;
}
.welcome-value {
  font-size: 2rem;
  color: #1abc9c;
  font-weight: 600;
  letter-spacing: 1px;
}
@media (max-width: 900px) {
  .welcome-cards {
    flex-direction: column;
    gap: 18px;
    align-items: center;
  }
  .welcome-card {
    min-width: 220px;
    width: 90vw;
    padding: 24px 10px;
  }
}
@media (max-width: 768px) {
  .admin-sider {
    position: fixed;
    left: 0;
    top: 0;
    width: 70vw;
    max-width: 260px;
    height: 100vh;
    z-index: 200;
    transform: translateX(-100%);
    transition: transform 0.3s;
    box-shadow: 2px 0 8px rgba(0,0,0,0.12);
    background: #fff;
  }
  .admin-sider.open {
    transform: translateX(0);
  }
  .admin-main {
    padding: 64px 0 0 0 !important;
  }
  .admin-header {
    left: 0 !important;
    width: 100vw !important;
    min-width: 0 !important;
    padding: 0 8px 0 8px !important;
    box-sizing: border-box;
    flex-wrap: nowrap;
    height: 56px;
  }
  .header-title {
    font-size: 1.1rem !important;
    margin-left: 0 !important;
    text-align: left !important;
    width: auto !important;
    flex: 1 1 auto;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 1px;
  }
  .header-actions {
    gap: 4px;
    margin-left: 0;
  }
  .btn.logout-btn {
    padding: 4px 8px;
    font-size: 13px;
    border-radius: 8px;
  }
  .menu-toggle {
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    margin-right: 4px !important;
    background: none;
    border: none;
    font-size: 2rem;
    cursor: pointer;
    color: #2566d8;
    z-index: 300;
  }
  /* 表单和按钮间距优化 */
  .input, .btn {
    margin-bottom: 8px;
  }
}
.menu-toggle {
  display: none;
}
</style>

<style scoped>
/* 极速页面切换（几乎无动画） */
.fade-enter-active {
  transition: opacity 0.08s ease-out;
}

.fade-leave-active {
  transition: opacity 0.05s ease-in;
}

.fade-enter-from {
  opacity: 0;
}

.fade-leave-to {
  opacity: 0;
}

.fade-enter-to,
.fade-leave-from {
  opacity: 1;
}

/* 优化内容区域性能 */
.admin-content {
  will-change: contents;
  contain: layout style paint;
}
</style>
