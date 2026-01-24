/**
 * AI 提供商适配器
 * 支持多种 AI 服务的统一接口
 */

// 支持的 AI 提供商列表
const AI_PROVIDERS = {
  // 国内服务
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    needsApiKey: true,
    needsBaseUrl: false
  },
  siliconflow: {
    name: 'SiliconFlow (硅基流动)',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    needsApiKey: true,
    needsBaseUrl: false
  },
  zhipu: {
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    needsApiKey: true,
    needsBaseUrl: false
  },
  qwen: {
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    needsApiKey: true,
    needsBaseUrl: false
  },
  volcengine: {
    name: '火山引擎 (豆包)',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: '',
    needsApiKey: true,
    needsBaseUrl: false
  },
  moonshot: {
    name: 'Moonshot (Kimi)',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    needsApiKey: true,
    needsBaseUrl: false
  },
  baichuan: {
    name: '百川智能',
    baseUrl: 'https://api.baichuan-ai.com/v1',
    defaultModel: 'Baichuan4',
    needsApiKey: true,
    needsBaseUrl: false
  },
  minimax: {
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1',
    defaultModel: 'abab6.5s-chat',
    needsApiKey: true,
    needsBaseUrl: false
  },
  yi: {
    name: '零一万物 (Yi)',
    baseUrl: 'https://api.lingyiwanwu.com/v1',
    defaultModel: 'yi-lightning',
    needsApiKey: true,
    needsBaseUrl: false
  },
  // 国外服务
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    needsApiKey: true,
    needsBaseUrl: false
  },
  anthropic: {
    name: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-3-5-sonnet-20240620',
    needsApiKey: true,
    needsBaseUrl: false
  },
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-1.5-flash',
    needsApiKey: true,
    needsBaseUrl: false
  },
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.1-8b-instant',
    needsApiKey: true,
    needsBaseUrl: false
  },
  perplexity: {
    name: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    defaultModel: 'llama-3.1-sonar-small-128k-online',
    needsApiKey: true,
    needsBaseUrl: false
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-flash-1.5',
    needsApiKey: true,
    needsBaseUrl: false
  },
  // 本地/自定义
  ollama: {
    name: 'Ollama (本地)',
    baseUrl: 'http://localhost:11434',
    defaultModel: 'llama3.2',
    needsApiKey: false,
    needsBaseUrl: true
  },
  custom: {
    name: '自定义 OpenAI 兼容',
    baseUrl: '',
    defaultModel: '',
    needsApiKey: true,
    needsBaseUrl: true
  }
};

/**
 * 调用 AI 服务
 */
async function callAI(config, messages) {
  const { provider } = config;
  const providerConfig = AI_PROVIDERS[provider];
  
  if (!providerConfig) {
    throw new Error(`不支持的 AI 提供商: ${provider}`);
  }

  switch (provider) {
    case 'gemini':
      return callGemini(config, messages);
    case 'anthropic':
      return callAnthropic(config, messages);
    case 'ollama':
      return callOllama(config, messages);
    default:
      return callOpenAICompatible(config, messages);
  }
}

/**
 * OpenAI 兼容接口
 */
async function callOpenAICompatible(config, messages) {
  const { provider, apiKey, baseUrl, model } = config;
  const providerConfig = AI_PROVIDERS[provider];
  
  let rawBaseUrl = (baseUrl || providerConfig.baseUrl || '').trim();
  if (rawBaseUrl && !rawBaseUrl.startsWith('http')) {
    rawBaseUrl = 'https://' + rawBaseUrl;
  }

  const actualModel = model || providerConfig.defaultModel;
  if (!rawBaseUrl) throw new Error('请配置 Base URL');
  if (!actualModel) throw new Error('请配置模型名称');
  
  let url;
  try {
    const normalizedBase = rawBaseUrl.replace(/\/+$/, '');
    if (normalizedBase.includes('/chat/completions')) {
      url = normalizedBase;
    } else {
      const hasVersion = /\/v\d+/.test(normalizedBase);
      const isSpecialPath = normalizedBase.includes('compatible-mode') || normalizedBase.includes('api/paas/v4');
      let pathSuffix = (!hasVersion && !isSpecialPath) ? '/v1' : '';
      url = `${normalizedBase}${pathSuffix}/chat/completions`;
    }
  } catch (e) {
    throw new Error(`无效的 Base URL: ${e.message}`);
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: actualModel,
        messages: messages,
        temperature: 0.7,
        max_tokens: 500
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      let errorMessage = `API 请求失败 (${response.status})`;
      try {
        const errJson = JSON.parse(errText);
        errorMessage += `: ${errJson.error?.message || errJson.message || errText}`;
      } catch {
        errorMessage += `: ${errText}`;
      }
      const error = new Error(errorMessage);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('请求超时 (30s)，请检查网络或提供商状态');
    }
    throw error;
  }
}

/**
 * Google Gemini API
 */
async function callGemini(config, messages) {
  const { apiKey, model } = config;
  const actualModel = model || AI_PROVIDERS.gemini.defaultModel;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${actualModel}:generateContent?key=${apiKey}`;
  
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }));
  
  const systemMsg = messages.find(m => m.role === 'system');
  const payload = {
    contents: contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
  };
  
  if (systemMsg) {
    payload.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      let errorMessage = `Gemini API 错误 (${response.status})`;
      try {
        const errJson = JSON.parse(errText);
        errorMessage += `: ${errJson.error?.message || errText}`;
      } catch {
        errorMessage += `: ${errText}`;
      }
      const error = new Error(errorMessage);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Gemini 请求超时 (30s)');
    }
    throw error;
  }
}

/**
 * Anthropic Claude API
 */
async function callAnthropic(config, messages) {
  const { apiKey, model } = config;
  const actualModel = model || AI_PROVIDERS.anthropic.defaultModel;
  const url = 'https://api.anthropic.com/v1/messages';
  
  const systemMsg = messages.find(m => m.role === 'system');
  const otherMessages = messages.filter(m => m.role !== 'system');
  
  const payload = {
    model: actualModel,
    max_tokens: 500,
    messages: otherMessages
  };
  
  if (systemMsg) {
    payload.system = systemMsg.content;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      let errorMessage = `Claude API 错误 (${response.status})`;
      try {
        const errJson = JSON.parse(errText);
        errorMessage += `: ${errJson.error?.message || errText}`;
      } catch {
        errorMessage += `: ${errText}`;
      }
      const error = new Error(errorMessage);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    return data.content?.[0]?.text || '';
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Claude 请求超时 (30s)');
    }
    throw error;
  }
}

/**
 * Ollama 本地 API
 */
async function callOllama(config, messages) {
  const { baseUrl, model } = config;
  const actualBaseUrl = baseUrl || AI_PROVIDERS.ollama.baseUrl;
  const actualModel = model || AI_PROVIDERS.ollama.defaultModel;
  
  const url = `${actualBaseUrl.replace(/\/+$/, '')}/api/chat`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: actualModel,
        messages: messages,
        stream: false,
        options: { temperature: 0.7 }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      const error = new Error(`Ollama API 错误 (${response.status}): ${errText}`);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    return data.message?.content || '';
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Ollama 请求超时 (30s)');
    }
    throw error;
  }
}

/**
 * 智能探测 Base URL 的正确补全方式
 */
async function probeBaseUrl(config) {
  const { provider, baseUrl, apiKey } = config;
  const providerConfig = AI_PROVIDERS[provider];
  let rawInput = (baseUrl || providerConfig.baseUrl || '').trim();
  
  if (!rawInput) throw new Error('Base URL 不能为空');
  if (!rawInput.startsWith('http')) {
    rawInput = 'https://' + rawInput;
  }

  const base = rawInput.replace(/\/+$/, '');
  const variants = [base];

  // 启发式添加变体
  if (!/\/v\d+/.test(base)) {
    if (base.includes('volces.com')) {
      variants.push(`${base}/v3`, `${base}/v1`);
    } else {
      variants.push(`${base}/v1`, `${base}/v3`);
    }
  }
  if (base.endsWith('/v1')) {
    variants.push(base.substring(0, base.length - 3));
  }

  const uniqueVariants = [...new Set(variants)].filter(v => !!v);

  const testVariant = async (url) => {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      // 1. 轻量级验证：/models
      const modelsUrl = `${url.replace(/\/+$/, '')}/models`;
      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: controller.signal
      });

      if ([200, 401, 403].includes(response.status)) {
        return { 
          success: true, 
          baseUrl: url, 
          responseTime: `${Date.now() - startTime}ms`,
          status: response.status 
        };
      }

      // 2. 兜底验证：/chat/completions
      const chatUrl = `${url.replace(/\/+$/, '')}/chat/completions`;
      const chatResponse = await fetch(chatUrl, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: config.model || providerConfig.defaultModel || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1
        }),
        signal: controller.signal
      });

      if ([200, 401, 403].includes(chatResponse.status)) {
        return { 
          success: true, 
          baseUrl: url, 
          responseTime: `${Date.now() - startTime}ms`,
          status: chatResponse.status
        };
      }
      throw new Error(`Status ${chatResponse.status}`);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    const results = await Promise.allSettled(uniqueVariants.map(v => testVariant(v)));
    const successful = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .sort((a, b) => a.responseTime - b.responseTime);

    if (successful.length > 0) {
      const perfect = successful.find(s => s.status === 200);
      return perfect || successful[0];
    }

    const errors = results.filter(r => r.status === 'rejected').map(r => r.reason.message);
    return { success: false, error: errors[0] || '无法连接，请检查网络或路径' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testAndActivateAIConfig() {
  const db = require('../db');
  const { decrypt } = require('./crypto');
  
  try {
    const aiConfig = await db.getAIConfig();
    
    if (!aiConfig.provider || !aiConfig.apiKey) {
      return { success: false, reason: 'no_config', message: 'AI 未配置' };
    }
    
    let decryptedApiKey;
    try {
      const encrypted = JSON.parse(aiConfig.apiKey);
      decryptedApiKey = decrypt(encrypted.encrypted, encrypted.iv, encrypted.authTag);
    } catch (e) {
      return { success: false, reason: 'decrypt_failed', message: 'API Key 解密失败，请重新配置' };
    }
    
    if (!decryptedApiKey) {
      return { success: false, reason: 'decrypt_failed', message: 'API Key 解密失败，请重新配置' };
    }
    
    const config = {
      provider: aiConfig.provider,
      apiKey: decryptedApiKey,
      baseUrl: aiConfig.baseUrl || '',
      model: aiConfig.model || ''
    };
    
    const probeResult = await probeBaseUrl(config);
    
    if (probeResult.success) {
      await db.saveAIConfig({ provider: aiConfig.provider, lastTestedOk: 'true' });
      return { 
        success: true, 
        provider: aiConfig.provider,
        responseTime: probeResult.responseTime,
        message: `AI 服务 (${AI_PROVIDERS[aiConfig.provider]?.name || aiConfig.provider}) 已自动激活`
      };
    } else {
      await db.saveAIConfig({ provider: aiConfig.provider, lastTestedOk: 'false' });
      return { 
        success: false, 
        reason: 'connection_failed',
        provider: aiConfig.provider,
        message: `AI 连接测试失败: ${probeResult.error}`
      };
    }
  } catch (error) {
    console.error('testAndActivateAIConfig error:', error);
    return { success: false, reason: 'error', message: error.message };
  }
}

module.exports = {
  AI_PROVIDERS,
  callAI,
  probeBaseUrl,
  testAndActivateAIConfig
};
