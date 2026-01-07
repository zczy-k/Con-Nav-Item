import axios from 'axios';
const BASE = '/api';

export const login = (username, password) => axios.post(`${BASE}/login`, { username, password });
export const verifyPassword = (password) => axios.post(`${BASE}/verify-password`, { password });

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// 菜单相关API
export const getMenus = (noCache = false) => {
  const params = noCache ? { _t: Date.now() } : {};
  return axios.get(`${BASE}/menus`, { params });
};
export const addMenu = (data) => axios.post(`${BASE}/menus`, data, { headers: authHeaders() });
export const updateMenu = (id, data) => axios.put(`${BASE}/menus/${id}`, data, { headers: authHeaders() });
export const deleteMenu = (id) => axios.delete(`${BASE}/menus/${id}`, { headers: authHeaders() });

// 子菜单相关API
export const getSubMenus = (menuId) => axios.get(`${BASE}/menus/${menuId}/submenus`);
export const addSubMenu = (menuId, data) => axios.post(`${BASE}/menus/${menuId}/submenus`, data, { headers: authHeaders() });
export const updateSubMenu = (id, data) => axios.put(`${BASE}/menus/submenus/${id}`, data, { headers: authHeaders() });
export const deleteSubMenu = (id) => axios.delete(`${BASE}/menus/submenus/${id}`, { headers: authHeaders() });

// 卡片相关API
export const getCards = (menuId, subMenuId = null, noCache = false) => {
  const params = subMenuId ? { subMenuId } : {};
  if (noCache) params._t = Date.now(); // 添加时间戳绕过浏览器缓存
  return axios.get(`${BASE}/cards/${menuId}`, { params });
};
// 批量获取所有卡片（按分类分组）
export const getAllCards = (noCache = false) => {
  const params = noCache ? { _t: Date.now() } : {};
  return axios.get(`${BASE}/cards`, { params });
};
export const addCard = (data) => axios.post(`${BASE}/cards`, data, { headers: authHeaders() });
export const updateCard = (id, data) => axios.put(`${BASE}/cards/${id}`, data, { headers: authHeaders() });
export const deleteCard = (id) => axios.delete(`${BASE}/cards/${id}`, { headers: authHeaders() });
export const batchUpdateCards = (cards) => axios.patch(`${BASE}/cards/batch-update`, { cards }, { headers: authHeaders() });

export const uploadLogo = (file) => {
  const formData = new FormData();
  formData.append('logo', file);
  return axios.post(`${BASE}/upload`, formData, { headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' } });
};

// 宣传API
export const getPromos = () => axios.get(`${BASE}/promos`);
export const addPromo = (data) => axios.post(`${BASE}/promos`, data, { headers: authHeaders() });
export const updatePromo = (id, data) => axios.put(`${BASE}/promos/${id}`, data, { headers: authHeaders() });
export const deletePromo = (id) => axios.delete(`${BASE}/promos/${id}`, { headers: authHeaders() });

// 友链API
export const getFriends = () => axios.get(`${BASE}/friends`);
export const addFriend = (data) => axios.post(`${BASE}/friends`, data, { headers: authHeaders() });
export const updateFriend = (id, data) => axios.put(`${BASE}/friends/${id}`, data, { headers: authHeaders() });
export const deleteFriend = (id) => axios.delete(`${BASE}/friends/${id}`, { headers: authHeaders() });

// 用户API
export const getUserProfile = () => axios.get(`${BASE}/users/profile`, { headers: authHeaders() });
export const changeUsername = (newUsername) => axios.put(`${BASE}/users/username`, { newUsername }, { headers: authHeaders() });
export const changePassword = (oldPassword, newPassword) => axios.put(`${BASE}/users/password`, { oldPassword, newPassword }, { headers: authHeaders() });
export const getUsers = () => axios.get(`${BASE}/users`, { headers: authHeaders() });

// 批量添加API
export const batchParseUrls = (urls) => axios.post(`${BASE}/batch/parse`, { urls }, { headers: authHeaders() });
export const batchAddCards = (menuId, subMenuId, cards) => axios.post(`${BASE}/batch/add`, { menu_id: menuId, sub_menu_id: subMenuId, cards }, { headers: authHeaders() });
export const batchCheckUrls = (urls) => axios.post(`${BASE}/batch/check-urls`, { urls }, { headers: authHeaders() });

// 搜索引擎API
export const getSearchEngines = () => axios.get(`${BASE}/search-engines`);
export const parseSearchEngine = (url) => axios.post(`${BASE}/search-engines/parse`, { url }, { headers: authHeaders() });
export const addSearchEngine = (data) => axios.post(`${BASE}/search-engines`, data, { headers: authHeaders() });
export const updateSearchEngine = (id, data) => axios.put(`${BASE}/search-engines/${id}`, data, { headers: authHeaders() });
export const deleteSearchEngine = (id) => axios.delete(`${BASE}/search-engines/${id}`, { headers: authHeaders() });
export const reorderSearchEngines = (engines) => axios.post(`${BASE}/search-engines/reorder`, { engines }, { headers: authHeaders() });

// 标签API
export const getTags = () => axios.get(`${BASE}/tags`);
export const addTag = (data) => axios.post(`${BASE}/tags`, data, { headers: authHeaders() });
export const updateTag = (id, data) => axios.put(`${BASE}/tags/${id}`, data, { headers: authHeaders() });
export const deleteTag = (id) => axios.delete(`${BASE}/tags/${id}`, { headers: authHeaders() });
export const getTagCardCount = (id) => axios.get(`${BASE}/tags/${id}/cards/count`);

// 卡片去重API
export const detectDuplicates = () => axios.get(`${BASE}/cards/detect-duplicates/all?_t=${Date.now()}`, { headers: authHeaders() });
export const removeDuplicates = (cardIds) => axios.post(`${BASE}/cards/remove-duplicates`, { cardIds }, { headers: authHeaders() });

// 备份API
export const createBackup = (name, description) => axios.post(`${BASE}/backup/create`, { name, description }, { headers: authHeaders() });
export const getBackupList = () => axios.get(`${BASE}/backup/list`, { headers: authHeaders() });
export const downloadBackup = (filename) => {
  const token = localStorage.getItem('token');
  return `${BASE}/backup/download/${filename}?token=${token}`;
};
export const deleteBackup = (filename) => axios.delete(`${BASE}/backup/delete/${filename}`, { headers: authHeaders() });
export const renameBackup = (filename, newName) => axios.put(`${BASE}/backup/rename/${filename}`, { newName }, { headers: authHeaders() });
export const uploadBackup = (file) => {
  const formData = new FormData();
  formData.append('backup', file);
  return axios.post(`${BASE}/backup/upload`, formData, { headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' } });
};
export const restoreBackup = (filename) => axios.post(`${BASE}/backup/restore/${filename}`, {}, { headers: authHeaders() });

// 数据版本号API（用于缓存同步）
export const getDataVersion = () => axios.get(`${BASE}/data-version`);

// AI 批量生成 API
export const aiFilterCards = (filters) => axios.post(`${BASE}/ai/filter-cards`, filters, { headers: authHeaders() });
export const aiPreview = (data) => axios.post(`${BASE}/ai/preview`, data, { headers: authHeaders() });
export const aiStartBatchTask = (data) => axios.post(`${BASE}/ai/batch-task/start`, data, { headers: authHeaders() });
export const aiGetTaskStatus = () => axios.get(`${BASE}/ai/batch-task/status`, { headers: authHeaders() });
export const aiStopTask = () => axios.post(`${BASE}/ai/batch-task/stop`, {}, { headers: authHeaders() });
