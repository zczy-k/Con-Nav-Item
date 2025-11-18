/**
 * URL 规范化工具（前端版本）
 * 用于在前端进行重复检测
 */

/**
 * 规范化 URL，用于重复检测
 * @param {string} url - 原始 URL
 * @returns {string} 规范化后的 URL
 */
export function normalizeUrl(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }

  try {
    let normalized = url.trim().toLowerCase();
    
    // 移除协议
    normalized = normalized.replace(/^(https?:\/\/)?(www\.)?/, '');
    
    // 移除尾部斜杠
    normalized = normalized.replace(/\/+$/, '');
    
    return normalized;
  } catch (error) {
    console.error('URL 规范化失败:', error);
    return url.toLowerCase();
  }
}

/**
 * 提取 URL 的域名
 * @param {string} url - 原始 URL
 * @returns {string} 域名
 */
export function extractDomain(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }

  try {
    let normalized = url.trim().toLowerCase();
    normalized = normalized.replace(/^(https?:\/\/)?(www\.)?/, '');
    
    // 提取域名部分（第一个 / 之前）
    const domain = normalized.split('/')[0].split('?')[0].split('#')[0];
    return domain;
  } catch (error) {
    console.error('域名提取失败:', error);
    return '';
  }
}

/**
 * 判断两个卡片是否重复
 * @param {object} card1 - 卡片1
 * @param {object} card2 - 卡片2
 * @returns {boolean} 是否重复
 */
export function isDuplicateCard(card1, card2) {
  if (!card1 || !card2) {
    return false;
  }

  // 1. URL 完全匹配（规范化后）
  const url1 = normalizeUrl(card1.url);
  const url2 = normalizeUrl(card2.url);
  
  if (url1 && url2 && url1 === url2) {
    return true;
  }

  // 2. 标题相同且域名相同
  const title1 = (card1.title || '').trim().toLowerCase();
  const title2 = (card2.title || '').trim().toLowerCase();
  const domain1 = extractDomain(card1.url);
  const domain2 = extractDomain(card2.url);
  
  if (title1 && title2 && title1 === title2 && 
      domain1 && domain2 && domain1 === domain2) {
    return true;
  }

  return false;
}
