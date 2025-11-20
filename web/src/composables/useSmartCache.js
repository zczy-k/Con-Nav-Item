import { ref, reactive, readonly } from 'vue';
import api from '../api';

// 全局智能缓存系统
const cache = reactive({
  menus: null,
  cards: new Map(), // menuId_subMenuId -> {data, timestamp}
  tags: null,
  searchEngines: null,
  friends: null,
  ads: null,
  lastUpdate: new Map()
});

// 缓存配置（更激进的缓存策略）
const CACHE_TTL = {
  menus: 10 * 60 * 1000,      // 10分钟
  cards: 5 * 60 * 1000,       // 5分钟
  tags: 15 * 60 * 1000,       // 15分钟
  searchEngines: 30 * 60 * 1000, // 30分钟
  friends: 15 * 60 * 1000,    // 15分钟
  ads: 15 * 60 * 1000         // 15分钟
};

// 检查缓存是否有效
const isCacheValid = (key, ttl) => {
  const lastUpdate = cache.lastUpdate.get(key);
  return lastUpdate && (Date.now() - lastUpdate < ttl);
};

// 设置缓存
const setCache = (key, data) => {
  if (key.startsWith('cards_')) {
    cache.cards.set(key.replace('cards_', ''), {
      data,
      timestamp: Date.now()
    });
  } else {
    cache[key] = data;
  }
  cache.lastUpdate.set(key, Date.now());
};

// 获取缓存
const getCache = (key) => {
  if (key.startsWith('cards_')) {
    const cacheKey = key.replace('cards_', '');
    const cached = cache.cards.get(cacheKey);
    return cached?.data;
  }
  return cache[key];
};

export function useSmartCache() {
  const loading = ref(false);
  const error = ref(null);

  // 加载菜单（带缓存）
  const loadMenus = async (force = false) => {
    const cacheKey = 'menus';
    
    if (!force && isCacheValid(cacheKey, CACHE_TTL.menus)) {
      return cache.menus;
    }

    try {
      loading.value = true;
      const response = await api.get('/api/menus');
      const menus = response.data;
      
      setCache(cacheKey, menus);
      return menus;
    } catch (err) {
      error.value = err;
      return cache.menus || [];
    } finally {
      loading.value = false;
    }
  };

  // 加载卡片（带智能缓存和预加载）
  const loadCards = async (menuId, subMenuId = null, force = false) => {
    const cacheKey = `cards_${menuId}_${subMenuId}`;
    
    if (!force && isCacheValid(cacheKey, CACHE_TTL.cards)) {
      return getCache(cacheKey);
    }

    try {
      loading.value = true;
      const response = await api.get(`/api/cards/${menuId}`, {
        params: subMenuId ? { subMenuId } : {}
      });
      const cards = response.data;
      
      setCache(cacheKey, cards);
      return cards;
    } catch (err) {
      error.value = err;
      return getCache(cacheKey) || [];
    } finally {
      loading.value = false;
    }
  };

  // 预加载相邻菜单的卡片
  const preloadAdjacentMenus = async (currentMenu, allMenus) => {
    if (!allMenus || allMenus.length === 0) return;
    
    const currentIndex = allMenus.findIndex(m => m.id === currentMenu.id);
    const toPreload = [];
    
    // 预加载前一个和后一个菜单
    if (currentIndex > 0) {
      toPreload.push(allMenus[currentIndex - 1]);
    }
    if (currentIndex < allMenus.length - 1) {
      toPreload.push(allMenus[currentIndex + 1]);
    }
    
    // 静默预加载（不阻塞UI）
    toPreload.forEach(menu => {
      const cacheKey = `cards_${menu.id}_null`;
      if (!isCacheValid(cacheKey, CACHE_TTL.cards)) {
        loadCards(menu.id, null).catch(() => {}); // 静默失败
      }
    });
  };

  // 加载标签
  const loadTags = async (force = false) => {
    const cacheKey = 'tags';
    
    if (!force && isCacheValid(cacheKey, CACHE_TTL.tags)) {
      return cache.tags;
    }

    try {
      const response = await api.get('/api/tags');
      const tags = response.data;
      
      setCache(cacheKey, tags);
      return tags;
    } catch (err) {
      error.value = err;
      return cache.tags || [];
    }
  };

  // 加载搜索引擎
  const loadSearchEngines = async (force = false) => {
    const cacheKey = 'searchEngines';
    
    if (!force && isCacheValid(cacheKey, CACHE_TTL.searchEngines)) {
      return cache.searchEngines;
    }

    try {
      const response = await api.get('/api/search-engines');
      const engines = response.data;
      
      setCache(cacheKey, engines);
      return engines;
    } catch (err) {
      error.value = err;
      return cache.searchEngines || [];
    }
  };

  // 加载友情链接
  const loadFriends = async (force = false) => {
    const cacheKey = 'friends';
    
    if (!force && isCacheValid(cacheKey, CACHE_TTL.friends)) {
      return cache.friends;
    }

    try {
      const response = await api.get('/api/friends');
      const friends = response.data;
      
      setCache(cacheKey, friends);
      return friends;
    } catch (err) {
      error.value = err;
      return cache.friends || [];
    }
  };

  // 加载广告
  const loadAds = async (force = false) => {
    const cacheKey = 'ads';
    
    if (!force && isCacheValid(cacheKey, CACHE_TTL.ads)) {
      return cache.ads;
    }

    try {
      const response = await api.get('/api/ads');
      const ads = response.data;
      
      setCache(cacheKey, ads);
      return ads;
    } catch (err) {
      error.value = err;
      return cache.ads || [];
    }
  };

  // 清除缓存
  const clearCache = (key = null) => {
    if (key) {
      if (key.startsWith('cards_')) {
        cache.cards.delete(key.replace('cards_', ''));
      } else {
        cache[key] = null;
      }
      cache.lastUpdate.delete(key);
    } else {
      // 清除所有缓存
      cache.menus = null;
      cache.cards.clear();
      cache.tags = null;
      cache.searchEngines = null;
      cache.friends = null;
      cache.ads = null;
      cache.lastUpdate.clear();
    }
  };

  // 预加载所有基础数据
  const preloadAll = async () => {
    try {
      await Promise.allSettled([
        loadMenus(),
        loadTags(),
        loadSearchEngines(),
        loadFriends(),
        loadAds()
      ]);
    } catch (error) {
      console.warn('预加载失败:', error);
    }
  };

  return {
    loading: readonly(loading),
    error: readonly(error),
    loadMenus,
    loadCards,
    loadTags,
    loadSearchEngines,
    loadFriends,
    loadAds,
    preloadAdjacentMenus,
    clearCache,
    preloadAll,
    cache: readonly(cache)
  };
}
