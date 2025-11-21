<template>
  <div class="user-manage">
    <div class="user-header">
    </div>
    
    <div class="user-card">
      <div class="username-section">
        <h3 class="section-title">修改用户名</h3>
        <div class="username-form">
          <div class="current-username">
            <label>当前用户名：</label>
            <span class="username-display">{{ userInfo.username || 'admin' }}</span>
          </div>
          <div class="form-group">
            <label>新用户名：</label>
            <input v-model="newUsername" type="text" placeholder="请输入新用户名（3-20位）" class="input" />
          </div>
          <div class="form-actions">
            <button @click="handleChangeUsername" class="btn" :disabled="loadingUsername">
              {{ loadingUsername ? '修改中...' : '修改用户名' }}
            </button>
          </div>
          <p v-if="messageUsername" :class="['message', messageTypeUsername]">{{ messageUsername }}</p>
        </div>
      </div>

      <div class="password-section">
        <h3 class="section-title">修改密码</h3>
        <div class="password-form">
          <div class="form-group">
            <label>当前密码：</label>
            <input v-model="oldPassword" type="password" placeholder="请输入当前密码" class="input" />
          </div>
          <div class="form-group">
            <label>新密码：</label>
            <input v-model="newPassword" type="password" placeholder="请输入新密码" class="input" />
          </div>
          <div class="form-group">
            <label>确认新密码：</label>
            <input v-model="confirmPassword" type="password" placeholder="请再次输入新密码" class="input" />
          </div>
          <div class="form-actions">
            <button @click="handleChangePassword" class="btn" :disabled="loading">
              {{ loading ? '修改中...' : '修改密码' }}
            </button>
          </div>
          <p v-if="message" :class="['message', messageType]">{{ message }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getUserProfile, changeUsername, changePassword } from '../../api';

const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const loading = ref(false);
const message = ref('');
const messageType = ref('success');
const userInfo = ref({});

const newUsername = ref('');
const loadingUsername = ref(false);
const messageUsername = ref('');
const messageTypeUsername = ref('success');

onMounted(async () => {
  await loadUserProfile();
});

async function loadUserProfile() {
  try {
    const response = await getUserProfile();
    userInfo.value = response.data.data || response.data;
  } catch (error) {
    console.error('获取用户信息失败:', error);
  }
}

async function handleChangeUsername() {
  if (!newUsername.value) {
    showUsernameMessage('请输入新用户名', 'error');
    return;
  }
  
  if (newUsername.value.length < 3 || newUsername.value.length > 20) {
    showUsernameMessage('用户名长度应为3-20位', 'error');
    return;
  }
  
  if (newUsername.value === userInfo.value.username) {
    showUsernameMessage('新用户名不能与当前用户名相同', 'error');
    return;
  }
  
  loadingUsername.value = true;
  messageUsername.value = '';
  
  try {
    await changeUsername(newUsername.value);
    showUsernameMessage('用户名修改成功！2秒后自动退出，请使用新用户名重新登录...', 'success');
    newUsername.value = '';
    // 修改用户名后强制退出登录
    setTimeout(() => {
      localStorage.removeItem('token');
      window.location.href = '/admin';
    }, 2000);
  } catch (error) {
    showUsernameMessage(error.response?.data?.message || '用户名修改失败', 'error');
  } finally {
    loadingUsername.value = false;
  }
}

function showUsernameMessage(text, type) {
  messageUsername.value = text;
  messageTypeUsername.value = type;
  setTimeout(() => {
    messageUsername.value = '';
  }, 3000);
}

async function handleChangePassword() {
  if (!oldPassword.value || !newPassword.value || !confirmPassword.value) {
    showMessage('请填写所有密码字段', 'error');
    return;
  }
  
  if (newPassword.value !== confirmPassword.value) {
    showMessage('两次输入的新密码不一致', 'error');
    return;
  }
  
  if (newPassword.value.length < 6) {
    showMessage('新密码长度至少6位', 'error');
    return;
  }
  
  loading.value = true;
  message.value = '';
  
  try {
    await changePassword(oldPassword.value, newPassword.value);
    showMessage('密码修改成功', 'success');
    oldPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
  } catch (error) {
    showMessage(error.response?.data?.message || '密码修改失败', 'error');
  } finally {
    loading.value = false;
  }
}

function showMessage(text, type) {
  message.value = text;
  messageType.value = type;
  if (text === '密码修改成功' && type === 'success') {
    setTimeout(() => {
      message.value = '2秒后自动退出登录,请使用新密码重新登录...';
      setTimeout(() => {
        localStorage.removeItem('token');
        window.location.reload();
      }, 2000);
    }, 500);
  } else {
    setTimeout(() => {
      message.value = '';
    }, 3000);
  }
}
</script>

<style scoped>
.user-manage {
  max-width: 1400px;
  width: 90%;
  margin: 0 auto;
}

.page-title {
  text-align: center;
  font-size: 1.6rem;
  font-weight: 500;
  margin: 32px 0 32px 0;
  letter-spacing: 2px;
  color: #222;
}

.user-card {
  width: 50%;
  margin: 0 auto;
  background: linear-gradient(135deg,#667eea,#764ba2);
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  padding: 10px 24px;
}

.section-title {
  text-align: center;
  font-size: 1.5rem;
  font-weight: 500;
  color: #222;
  margin-bottom: 20px;
  border-bottom: 2px solid #eaf1ff;
  padding-bottom: 8px;
}

.username-section {
  margin-bottom: 40px;
  padding-bottom: 40px;
  border-bottom: 2px solid #e3e6ef;
}

.password-section {
  margin-bottom: 40px;
}

.current-username {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
}

.current-username label {
  font-weight: 500;
  color: #666;
}

.username-display {
  font-weight: 600;
  color: #2566d8;
  font-size: 1.1rem;
}

.username-form {
  max-width: 500px;
}

.password-form {
  max-width: 500px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  color: #222;
}

.input {
  width: 100%;
  padding: 12px 12px;
  border-radius: 8px;
  border: 1px solid #d0d7e2;
  background: #fff;
  color: #222;
  font-size: 1rem;
  box-sizing: border-box;
}

.input:focus {
  outline: 2px solid #2566d8;
  border-color: #2566d8;
}

.form-actions {
  text-align: center;
  margin-top: 24px;
}

.btn {
  background: #2566d8;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 12px 24px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  transition: background 0.2s;
}

.btn:hover:not(:disabled) {
  background: #174ea6;
}

.btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.message {
  margin-top: 16px;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
}

.message.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.message.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

@media (max-width: 768px) {
  .user-manage {
    padding: 0 2vw;
  }
  .user-card {
    width: 80%;
    padding: 12px 2vw;
  }
  .password-form {
    max-width: 100%;
  }
  .input {
    width: 100%;
    min-width: 0;
    font-size: 14px;
    padding: 8px 8px;
  }
  .btn {
    width: 100%;
    padding: 10px 0;
    font-size: 14px;
  }
}
</style> 