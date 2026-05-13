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

export function extractRootDomain(url) {
  const hostname = extractHostname(url);
  if (!hostname) {
    return '';
  }

  const parts = hostname.split('.').filter(Boolean);
  if (parts.length <= 2) {
    return hostname;
  }

  const secondLevelSuffixes = new Set([
    'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
    'com.hk', 'com.tw', 'co.uk', 'org.uk', 'gov.uk',
    'ac.uk', 'co.jp', 'com.au', 'net.au', 'org.au'
  ]);
  const lastTwo = parts.slice(-2).join('.');
  const lastThree = parts.slice(-3).join('.');

  if (secondLevelSuffixes.has(lastTwo) && parts.length >= 3) {
    return lastThree;
  }

  return lastTwo;
}

export function extractPathname(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }

  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return pathname || '/';
  } catch (error) {
    const normalized = url.trim();
    const pathPart = normalized.replace(/^(https?:\/\/)?[^/]+/i, '').split('?')[0].split('#')[0];
    return pathPart.replace(/\/+$/, '') || '/';
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

  // 2. 同主域名但路径不同，视为同站不同页面，仅提示不拦截
  const rootDomain1 = extractRootDomain(card1.url);
  const rootDomain2 = extractRootDomain(card2.url);
  const path1 = extractPathname(card1.url);
  const path2 = extractPathname(card2.url);

  if (rootDomain1 && rootDomain2 && rootDomain1 === rootDomain2 && path1 !== path2) {
    return { type: 'similar', reason: '主域名相同但路径不同' };
  }

  // 3. 主机名完全相同但路径一致之外的变体，仍提示为疑似重复
  const hostname1 = extractHostname(card1.url);
  const hostname2 = extractHostname(card2.url);

  if (hostname1 && hostname2 && hostname1 === hostname2) {
    return { type: 'similar', reason: '主机名相同' };
  }

  // 4. 标题完全相同也视为疑似重复，仅提示不拦截
  const title1 = (card1.title || '').trim().toLowerCase();
  const title2 = (card2.title || '').trim().toLowerCase();
  
  if (title1 && title2 && title1.length > 3 && title1 === title2) {
    return { type: 'similar', reason: '标题相同' };
  }

  return null;
}
