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
  const { provider, apiKey, baseUrl, model } = config;
  const providerConfig = AI_PROVIDERS[provider];
  
  if (!providerConfig) {
    throw new Error(`不支持的 AI 提供商: ${provider}`);
  }

  // 根据不同提供商调用对应的 API
  switch (provider) {
    case 'gemini':
      return callGemini(config, messages);
    case 'anthropic':
      return callAnthropic(config, messages);
    case 'ollama':
      return callOllama(config, messages);
    default:
      // OpenAI 兼容接口（大多数国内服务都兼容）
      return callOpenAICompatible(config, messages);
  }
}

  /**
   * OpenAI 兼容接口（适用于大多数服务）
   */
  async function callOpenAICompatible(config, messages) {
    const { provider, apiKey, baseUrl, model } = config;
    const providerConfig = AI_PROVIDERS[provider];
    
    let actualBaseUrl = (baseUrl || providerConfig.baseUrl || '').replace(/\/+$/, '');
    const actualModel = model || providerConfig.defaultModel;
    
    if (!actualBaseUrl) {
      throw new Error('请配置 Base URL');
    }
    
    if (!actualModel) {
      throw new Error('请配置模型名称');
    }
    
    // 智能处理路径：如果已经包含 /chat/completions，则不重复添加
    let url = actualBaseUrl;
    if (!url.includes('/chat/completions')) {
      // 如果不包含 /v1 且不是某些特殊的 base，则补全 /v1
      // 注意：有些 provider 的 baseUrl 已经包含了 /v1 或 /v3 等版本号
      if (!/\/v\d+(\/|$)/.test(url) && !url.includes('compatible-mode')) {
        url += '/v1';
      }
      url += '/chat/completions';
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

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
  
  // 转换消息格式
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
  
  // 提取 system 消息
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
   * @returns {Promise<{success: boolean, baseUrl?: string, responseTime?: string, error?: string}>}
   */
  async function probeBaseUrl(config) {
    const { provider, baseUrl } = config;
    const providerConfig = AI_PROVIDERS[provider];
    const originalBaseUrl = (baseUrl || providerConfig.baseUrl || '').replace(/\/+$/, '');
    
    if (!originalBaseUrl) {
      throw new Error('Base URL 不能为空');
    }

    // 构建待测试的几种变体
    // 优先级：原始地址 -> 加上版本号 -> 加上 API 后缀
    const variants = [
      originalBaseUrl,
    ];

    // 如果不包含版本号，尝试加上 common 版本号
    if (!/\/v\d+(\/|$)/.test(originalBaseUrl)) {
      variants.push(`${originalBaseUrl}/v1`);
      variants.push(`${originalBaseUrl}/v3`);
    }

    // 如果以 /v1 结尾，也尝试去掉它（以防万一）
    if (originalBaseUrl.endsWith('/v1')) {
      variants.push(originalBaseUrl.substring(0, originalBaseUrl.length - 3));
    }

    // 去重
    const uniqueVariants = [...new Set(variants)].filter(v => !!v);

    const messages = [
      { role: 'system', content: 'You are a helpful assistant. Reply with "OK" only.' }, 
      { role: 'user', content: 'test' }
    ];

    // 尝试测试
    const testVariant = async (url) => {
      const startTime = Date.now();
      try {
        // 使用 callAI 测试，它内部会处理具体的路径拼接
        const result = await callAI({ ...config, baseUrl: url }, messages);
        if (result) {
          return { success: true, baseUrl: url, responseTime: `${Date.now() - startTime}ms` };
        }
      } catch (e) {
        return { success: false, error: e.message };
      }
      return { success: false };
    };

    // 串行测试，找到第一个成功的
    let lastError = null;
    for (const url of uniqueVariants) {
      const res = await testVariant(url);
      if (res.success) return res;
      lastError = res.error;
    }

    return { success: false, error: lastError || '所有补全方式均无法连接' };
  }


module.exports = {
  AI_PROVIDERS,
  callAI,
  probeBaseUrl
};
