/**
 * URL 规范化工具
 * 用于判断两个 URL 是否指向同一个网站
 */

/**
 * 规范化 URL，用于重复检测
 * @param {string} url - 原始 URL
 * @returns {string} 规范化后的 URL
 */
function normalizeUrl(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }

  try {
    let normalized = url.trim().toLowerCase();
    
    // 移除协议
    normalized = normalized.replace(/^(https?:\/\/)?(www\.)?/, '');
    
    // 移除尾部斜杠
    normalized = normalized.replace(/\/+$/, '');
    
    // 移除 URL 参数和锚点（可选，根据需求调整）
    // normalized = normalized.replace(/[?#].*$/, '');
    
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
function extractDomain(url) {
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
function isDuplicateCard(card1, card2) {
  if (!card1 || !card2) {
    return false;
  }

  // 1. URL 完全匹配（规范化后）
  const url1 = normalizeUrl(card1.url);
  const url2 = normalizeUrl(card2.url);
  
  if (url1 && url2 && url1 === url2) {
    return true;
  }

  // 2. 域名相同即视为重复（防止同一网站不同页面重复添加）
  const domain1 = extractDomain(card1.url);
  const domain2 = extractDomain(card2.url);
  
  if (domain1 && domain2 && domain1 === domain2) {
    return true;
  }

  // 3. 标题完全相同也视为重复
  const title1 = (card1.title || '').trim().toLowerCase();
  const title2 = (card2.title || '').trim().toLowerCase();
  
  if (title1 && title2 && title1.length > 3 && title1 === title2) {
    return true;
  }

  return false;
}

/**
 * 从卡片列表中检测重复项
 * @param {Array} cards - 卡片列表
 * @returns {Array} 重复卡片分组 [{original: card, duplicates: [card1, card2]}]
 */
function detectDuplicates(cards) {
  if (!Array.isArray(cards) || cards.length === 0) {
    return [];
  }

  const duplicateGroups = [];
  const processedIds = new Set();

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    
    // 跳过已处理的卡片
    if (processedIds.has(card.id)) {
      continue;
    }

    const duplicates = [];
    
    // 查找与当前卡片重复的所有卡片
    for (let j = i + 1; j < cards.length; j++) {
      const otherCard = cards[j];
      
      if (processedIds.has(otherCard.id)) {
        continue;
      }
      
      if (isDuplicateCard(card, otherCard)) {
        duplicates.push(otherCard);
        processedIds.add(otherCard.id);
      }
    }

    // 如果找到重复项，记录
    if (duplicates.length > 0) {
      duplicateGroups.push({
        original: card,
        duplicates: duplicates,
        totalCount: duplicates.length + 1
      });
      processedIds.add(card.id);
    }
  }

  return duplicateGroups;
}

module.exports = {
  normalizeUrl,
  extractDomain,
  isDuplicateCard,
  detectDuplicates
};
