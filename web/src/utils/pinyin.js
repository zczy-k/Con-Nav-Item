import { pinyin } from 'pinyin-pro';

/**
 * 拼音搜索匹配工具
 * 支持：中文直接匹配、完整拼音匹配、拼音首字母匹配
 */

/**
 * 获取文本的拼音和拼音首字母
 * @param {string} text - 要转换的文本
 * @returns {object} { full: 完整拼音, first: 拼音首字母 }
 */
export function getPinyinInfo(text) {
  if (!text || typeof text !== 'string') {
    return { full: '', first: '' };
  }
  
  try {
    // 获取完整拼音（无分隔符，小写）
    const fullPinyin = pinyin(text, { 
      pattern: 'pinyin',
      toneType: 'none',
      type: 'array'
    }).join('').toLowerCase();
    
    // 获取拼音首字母（移除空格）
    const firstLetters = pinyin(text, { 
      pattern: 'first',
      toneType: 'none'
    }).replace(/\s+/g, '').toLowerCase();
    
    return {
      full: fullPinyin,
      first: firstLetters
    };
  } catch (error) {
    console.error('拼音转换错误:', error);
    return { full: '', first: '' };
  }
}

/**
 * 检查文本是否匹配搜索关键词
 * 支持中文、拼音、拼音首字母匹配
 * @param {string} text - 要搜索的文本
 * @param {string} searchQuery - 搜索关键词
 * @returns {boolean} 是否匹配
 */
export function matchWithPinyin(text, searchQuery) {
  if (!text || !searchQuery) {
    return false;
  }
  
  const textLower = text.toLowerCase();
  const queryLower = searchQuery.toLowerCase().trim();
  
  // 1. 直接匹配（中文或英文）
  if (textLower.includes(queryLower)) {
    return true;
  }
  
  // 2. 拼音匹配
  const pinyinInfo = getPinyinInfo(text);
  
  // 完整拼音匹配
  if (pinyinInfo.full.includes(queryLower)) {
    return true;
  }
  
  // 拼音首字母匹配
  if (pinyinInfo.first.includes(queryLower)) {
    return true;
  }
  
  return false;
}

/**
 * 对卡片进行拼音搜索过滤
 * @param {Array} cards - 卡片数组
 * @param {string} searchQuery - 搜索关键词
 * @returns {Array} 过滤后的卡片数组
 */
export function filterCardsWithPinyin(cards, searchQuery) {
  if (!searchQuery || !searchQuery.trim()) {
    return cards;
  }
  
  const queryLower = searchQuery.toLowerCase().trim();
  
  return cards.filter(card => {
    // 匹配标题
    if (matchWithPinyin(card.title, queryLower)) {
      return true;
    }
    
    // 匹配 URL
    if (card.url && card.url.toLowerCase().includes(queryLower)) {
      return true;
    }
    
    // 匹配描述
    if (card.desc && matchWithPinyin(card.desc, queryLower)) {
      return true;
    }
    
    // 匹配标签名称
    if (card.tags && card.tags.length > 0) {
      return card.tags.some(tag => matchWithPinyin(tag.name, queryLower));
    }
    
    return false;
  });
}
