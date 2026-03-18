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
    return url.toLowerCase();
  }
}

export function extractHostname(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }

  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch (error) {
    return extractDomain(url);
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
  return !!getDuplicateMatch(card1, card2);
}

export function getDuplicateMatch(card1, card2) {
  if (!card1 || !card2) {
    return null;
  }

  // 1. URL 完全匹配（规范化后）
  const url1 = normalizeUrl(card1.url);
  const url2 = normalizeUrl(card2.url);
  
  if (url1 && url2 && url1 === url2) {
    return { type: 'exact', reason: 'URL 完全相同' };
  }

  // 2. 主机名相同视为疑似重复，仅提示不拦截
  const hostname1 = extractHostname(card1.url);
  const hostname2 = extractHostname(card2.url);
  
  if (hostname1 && hostname2 && hostname1 === hostname2) {
    return { type: 'similar', reason: '主机名相同' };
  }

  // 3. 标题完全相同也视为疑似重复，仅提示不拦截
  const title1 = (card1.title || '').trim().toLowerCase();
  const title2 = (card2.title || '').trim().toLowerCase();
  
  if (title1 && title2 && title1.length > 3 && title1 === title2) {
    return { type: 'similar', reason: '标题相同' };
  }

  return null;
}
