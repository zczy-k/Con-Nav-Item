import axios from 'axios';
const BASE = '/api';

// 生成并持久化客户端唯一标识，用于SSE同步优化
const CLIENT_ID_KEY = 'nav_client_id';
let clientId = localStorage.getItem(CLIENT_ID_KEY);
if (!clientId) {
  clientId = 'client_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
  localStorage.setItem(CLIENT_ID_KEY, clientId);
}

export const getClientId = () => clientId;

// 默认头信息
function authHeaders() {
  const token = localStorage.getItem('token');
  const headers = {
    'X-Client-Id': clientId
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// 创建 axios 实例
const instance = axios.create({
  baseURL: BASE
});

// 添加请求拦截器，自动添加 clientId 和 Authorization
instance.interceptors.request.use(config => {
  const headers = authHeaders();
  config.headers = { ...config.headers, ...headers };
  return config;
});

export const login = (username, password) => instance.post(`/login`, { username, password });
export const verifyPassword = (password) => instance.post(`/verify-password`, { password });
export const verifyToken = () => instance.get(`/verify-token`);

// 菜单相关API
export const getMenus = (noCache = false) => {
  const params = noCache ? { _t: Date.now() } : {};
  return instance.get(`/menus`, { params });
};
export const addMenu = (data) => instance.post(`/menus`, data);
export const updateMenu = (id, data) => instance.put(`/menus/${id}`, data);
export const deleteMenu = (id) => instance.delete(`/menus/${id}`);

// 子菜单相关API
export const getSubMenus = (menuId) => instance.get(`/menus/${menuId}/submenus`);
export const addSubMenu = (menuId, data) => instance.post(`/menus/${menuId}/submenus`, data);
export const updateSubMenu = (id, data) => instance.put(`/menus/submenus/${id}`, data);
export const deleteSubMenu = (id) => instance.delete(`/menus/submenus/${id}`);

// 卡片相关API
export const getCards = (menuId, subMenuId = null, noCache = false) => {
  const params = subMenuId ? { subMenuId } : {};
  if (noCache) params._t = Date.now(); // 添加时间戳绕过浏览器缓存
  return instance.get(`/cards/${menuId}`, { params });
};
// 批量获取所有卡片（按分类分组）
export const getAllCards = (noCache = false) => {
  const params = noCache ? { _t: Date.now() } : {};
  return instance.get(`/cards`, { params });
};
export const addCard = (data) => instance.post(`/cards`, data);
export const updateCard = (id, data) => instance.put(`/cards/${id}`, data);
export const deleteCard = (id) => instance.delete(`/cards/${id}`);
export const batchUpdateCards = (cards) => instance.patch(`/cards/batch-update`, { cards });

export const uploadLogo = (file) => {
  const formData = new FormData();
  formData.append('logo', file);
  return instance.post(`/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
};

// 宣传API
export const getPromos = () => instance.get(`/promos`);
export const addPromo = (data) => instance.post(`/promos`, data);
export const updatePromo = (id, data) => instance.put(`/promos/${id}`, data);
export const deletePromo = (id) => instance.delete(`/promos/${id}`);

// 友链API
export const getFriends = () => instance.get(`/friends`);
export const addFriend = (data) => instance.post(`/friends`, data);
export const updateFriend = (id, data) => instance.put(`/friends/${id}`, data);
export const deleteFriend = (id) => instance.delete(`/friends/${id}`);

// 用户API
export const getUserProfile = () => instance.get(`/users/profile`);
export const changeUsername = (newUsername) => instance.put(`/users/username`, { newUsername });
export const changePassword = (oldPassword, newPassword) => instance.put(`/users/password`, { oldPassword, newPassword });
export const getUsers = () => instance.get(`/users`);

// 批量添加API
export const batchParseUrls = (urls) => instance.post(`/batch/parse`, { urls });
export const batchAddCards = (menuId, subMenuId, cards) => instance.post(`/batch/add`, { menu_id: menuId, sub_menu_id: subMenuId, cards });
export const batchCheckUrls = (urls) => instance.post(`/batch/check-urls`, { urls });

// 搜索引擎API
export const getSearchEngines = () => instance.get(`/search-engines`);
export const parseSearchEngine = (url) => instance.post(`/search-engines/parse`, { url });
export const addSearchEngine = (data) => instance.post(`/search-engines`, data);
export const updateSearchEngine = (id, data) => instance.put(`/search-engines/${id}`, data);
export const deleteSearchEngine = (id) => instance.delete(`/search-engines/${id}`);
export const reorderSearchEngines = (engines) => instance.post(`/search-engines/reorder`, { engines });

// 标签API
export const getTags = () => instance.get(`/tags`);
export const addTag = (data) => instance.post(`/tags`, data);
export const updateTag = (id, data) => instance.put(`/tags/${id}`, data);
export const deleteTag = (id) => instance.delete(`/tags/${id}`);
export const getTagCardCount = (id) => instance.get(`/tags/${id}/cards/count`);

// 卡片去重API
export const detectDuplicates = () => instance.get(`/cards/detect-duplicates/all?_t=${Date.now()}`);
export const removeDuplicates = (cardIds) => instance.post(`/cards/remove-duplicates`, { cardIds });

// 备份API
export const createBackup = (name, description) => instance.post(`/backup/create`, { name, description });
export const getBackupList = () => instance.get(`/backup/list`);
export const downloadBackup = (filename) => {
  const token = localStorage.getItem('token');
  return `${BASE}/backup/download/${filename}?token=${token}`;
};
export const deleteBackup = (filename) => instance.delete(`/backup/delete/${filename}`);
export const renameBackup = (filename, newName) => instance.put(`/backup/rename/${filename}`, { newName });
export const uploadBackup = (file) => {
  const formData = new FormData();
  formData.append('backup', file);
  return instance.post(`/backup/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const restoreBackup = (filename) => instance.post(`/backup/restore/${filename}`);

// 数据版本号API（用于缓存同步）
export const getDataVersion = () => instance.get(`/data-version`);

// AI 批量生成 API
export const aiGetStatus = () => instance.get(`/ai/status`);
export const aiGetConfig = () => instance.get(`/ai/config`);
export const aiUpdateConfig = (data) => instance.post(`/ai/config`, data);
export const aiClearConfig = () => instance.delete(`/ai/config`);
export const aiTestConnection = (config = {}) => instance.post(`/ai/test`, config);
export const aiGetStats = () => instance.get(`/ai/stats`);
export const aiFilterCards = (filters) => instance.post(`/ai/filter-cards`, filters);
export const aiPreview = (data) => instance.post(`/ai/preview`, data);
export const aiStartBatchTask = (data) => instance.post(`/ai/batch-task/start`, data);
export const aiGetTaskStatus = () => instance.get(`/ai/batch-task/status`);
export const aiStopTask = () => instance.post(`/ai/batch-task/stop`, {});
