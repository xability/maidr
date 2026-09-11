import type { MessageKey } from '../index';

export const llm = {
  'llm.welcome': '欢迎使用图表助手。您可以通过下方的下拉列表选择并切换不同的 AI 模型。当前已启用：{models}。',
  'llm.welcomeNoAgents': '尚未启用任何代理。请在设置页面中至少启用一个代理并提供 API 密钥，或指定本地 Ollama 服务器。',
  'llm.processing': '正在处理请求...',
  'llm.messageError': '错误：{error}',
  'llm.fallbackModelName': 'AI 助手',

  'llm.suggestionExplain': '能再详细解释一下吗？',
  'llm.suggestionCurrentPoint': '关于当前数据点，您能说些什么？',
  'llm.suggestionCompare': '这与其他数据点相比如何？',
  'llm.suggestionStatistics': '能对这些数据做统计分析吗？',
  'llm.suggestionOutliers': '这个数据集中可能的离群值有哪些？',

  'llm.errorProcessing': '处理请求时出错',
  'llm.errorUnknown': '发生未知错误',
  'llm.errorResponseUnavailable': '无法获取回复',
  'llm.errorAborted': '聊天请求已中止',
  'llm.errorInvalidFormat': '回复格式无效',
  'llm.errorApi': 'API 错误：{status} - {statusText}',

  'llm.errorGeminiKeyRequired': '使用 Gemini API 需要 API 密钥',
  'llm.errorOllamaUrl': 'Ollama 服务器地址无效：必须以 http:// 或 https:// 开头',
  'llm.errorOllamaProxy': 'Ollama 请求无法通过 MAIDR 代理转发',
  'llm.errorOllamaUnreachable': '无法连接到 Ollama 服务器。请确认 Ollama 正在运行；如果页面不在 localhost 上，请确认 OLLAMA_ORIGINS 允许本站点。',
  'llm.errorInvalidModelKey': '模型密钥无效',
  'llm.errorProviderTimeout': '提供方未在规定时间内响应。请检查网络连接后重试。',
  'llm.errorProviderUnreachable': '无法连接到提供方。请检查网络连接。',
  'llm.errorInvalidApiKey': 'API 密钥无效',
  'llm.errorProviderStatus': '提供方返回了 {status}。这不是密钥的问题，请稍后重试。',
} satisfies Partial<Record<MessageKey, string>>;
