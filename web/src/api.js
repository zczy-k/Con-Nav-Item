import axios from 'axios';
const BASE = '/api';

export const login = (username, password) => axios.post(`${BASE}/login`, { username, password });
export const verifyPassword = (password) => axios.post(`${BASE}/verify-password`, { password });

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// 菜单相关API
export const getMenus = () => axios.get(`${BASE}/menus`);
export const addMenu = (data) => axios.post(`${BASE}/menus`, data, { headers: authHeaders() });
export const updateMenu = (id, data) => axios.put(`${BASE}/menus/${id}`, data, { headers: authHeaders() });
export const deleteMenu = (id) => axios.delete(`${BASE}/menus/${id}`, { headers: authHeaders() });

// 子菜单相关API
export const getSubMenus = (menuId) => axios.get(`${BASE}/menus/${menuId}/submenus`);
export const addSubMenu = (menuId, data) => axios.post(`${BASE}/menus/${menuId}/submenus`, data, { headers: authHeaders() });
export const updateSubMenu = (id, data) => axios.put(`${BASE}/menus/submenus/${id}`, data, { headers: authHeaders() });
export const deleteSubMenu = (id) => axios.delete(`${BASE}/menus/submenus/${id}`, { headers: authHeaders() });

// 卡片相关API
export const getCards = (menuId, subMenuId = null) => {
  const params = subMenuId ? { subMenuId } : {};
  return axios.get(`${BASE}/cards/${menuId}`, { params });
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

// 广告API
export const getAds = () => axios.get(`${BASE}/ads`);
export const addAd = (data) => axios.post(`${BASE}/ads`, data, { headers: authHeaders() });
export const updateAd = (id, data) => axios.put(`${BASE}/ads/${id}`, data, { headers: authHeaders() });
export const deleteAd = (id) => axios.delete(`${BASE}/ads/${id}`, { headers: authHeaders() });

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

// 壁纸API
export const getRandomWallpaper = () => axios.get(`${BASE}/wallpaper/random`);

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
export const detectDuplicates = () => axios.get(`${BASE}/cards/detect-duplicates/all`, { headers: authHeaders() });
export const removeDuplicates = (cardIds) => axios.post(`${BASE}/cards/remove-duplicates`, { cardIds }, { headers: authHeaders() });
