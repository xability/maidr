import type { MessageKey } from '../index';

export const settings = {
  // Dialog chrome: title, tablist, and the badge on a tab holding a blocked edit.
  'settings.title': '设置',
  'settings.sections': '设置分区',
  'settings.tabGeneral': '常规',
  'settings.tabAudio': '音频',
  'settings.tabVisual': '视觉',
  'settings.tabBraille': '盲文与触觉',
  'settings.tabAi': 'AI',
  'settings.tabAbout': '关于',
  // Extends a tab's name rather than replacing it, so it leads with a space.
  'settings.needsAttention': ' 需要注意',

  // General tab.
  'settings.language': '语言',
  'settings.languageAuto': '浏览器默认',
  'settings.autoplayDurationRow': '自动播放时长（毫秒）',
  'settings.autoplayDuration': '自动播放时长',
  'settings.ariaMode': 'ARIA 模式',
  'settings.ariaAssertive': '主动',
  'settings.ariaPolite': '礼貌',
  'settings.hoverMode': '悬停模式',
  'settings.hoverOnHover': '悬停',
  'settings.hoverOnClick': '点击',

  // Audio tab.
  'settings.volume': '音量',
  'settings.minFrequencyRow': '最低频率（Hz）',
  'settings.minFrequency': '最低频率',
  'settings.maxFrequencyRow': '最高频率（Hz）',
  'settings.maxFrequency': '最高频率',
  'settings.echoCount': '3D 回声次数',
  'settings.echoVolume': '回声音量',
  'settings.echoDuration': '回声时长（秒）',

  // Visual tab.
  'settings.outlineColor': '轮廓颜色',
  'settings.highlightColor': '高亮颜色',
  'settings.highContrastMode': '高对比度模式',
  'settings.on': '开',
  'settings.off': '关',
  'settings.highContrastLevels': '高对比度级别',
  'settings.highContrastLightColor': '高对比度浅色',
  'settings.highContrastDarkColor': '高对比度深色',

  // Braille & Tactile tab.
  'settings.brailleDisplay': '盲文显示器',
  'settings.brailleSingleLine': '单行',
  'settings.brailleMultiLine': '多行',
  'settings.brailleManual': '手动配置',
  'settings.singleLineDisplay': '单行显示器',
  'settings.selectSingleLineDisplay': '选择单行显示器',
  'settings.multiLineDisplay': '多行显示器',
  'settings.selectMultiLineDisplay': '选择多行显示器',
  'settings.braillePresetHint': '没有找到您的显示器？请选择“手动配置”。',
  'settings.manualBrailleGroup': '手动配置盲文显示器',
  'settings.brailleDisplaySize': '盲文显示器尺寸',
  'settings.brailleDisplaySizeHelp': '实体盲文显示器每行的方数（1 到 {max}）。',
  'settings.brailleDisplayLines': '盲文显示器行数',
  'settings.brailleDisplayLinesHelp': '实体盲文显示器的行数（1 到 {max}）。设为大于 1 可启用多行输出。',
  'settings.tactileDisplay': '触觉图形显示器',
  'settings.selectTactileDisplay': '选择触觉显示器',
  'settings.connectBluetooth': '通过 Bluetooth 连接',
  'settings.connectUsb': '通过 USB 连接',
  'settings.disconnect': '断开连接',

  // How the tactile display's connection is announced.
  'settings.tactileConnectedBluetooth': '已通过 Bluetooth 连接到{device}。在图表上按 b 即可显示。',
  'settings.tactileConnectedUsb': '已通过 USB 连接到{device}。在图表上按 b 即可显示。',
  'settings.tactileGenericDevice': '触觉显示器',
  'settings.tactileConnecting': '正在连接…',
  'settings.tactileRetry': '{message} 请重新选择设备以重试。',
  'settings.tactileNotConnected': '未连接。',

  // Braille display presets, as the pickers list them.
  'settings.braillePresetSingle': '{label}，{manufacturer}，{cells} 方',
  'settings.braillePresetMulti': '{label}，{manufacturer}，{lines} 行 {cells} 方',

  // AI tab. `{name}` is the provider's own name and is never translated.
  'settings.enableProvider': '启用 {name}',
  'settings.providerApiKey': '{name} API 密钥',
  'settings.providerServerUrl': '{name} 服务器地址',
  'settings.providerModelVersion': '{name} 模型版本',
  'settings.apiKeyPlaceholder': '输入 {name} API 密钥',
  'settings.ollamaUrlPlaceholder': '输入 Ollama 服务器地址，例如 http://localhost:11434',
  'settings.checkingOllamaServerHelp': '正在检查 Ollama 服务器...',
  'settings.validatingApiKeyHelp': '正在验证 API 密钥...',
  'settings.ollamaUnreachableHelp': '无法连接到 Ollama 服务器。请确认 Ollama 正在运行；如果页面不在 localhost 上，请确认 OLLAMA_ORIGINS 允许本站点。',
  'settings.providerApiKeyInvalid': '{name} API 密钥无效',
  'settings.ollamaReachable': 'Ollama 服务器可以连接',
  'settings.providerApiKeyValid': '{name} API 密钥有效',
  'settings.checkingOllamaServer': '正在检查 Ollama 服务器',
  'settings.validatingApiKey': '正在验证 API 密钥',
  'settings.apiKeyValid': 'API 密钥有效',
  'settings.ollamaUnreachable': '无法连接到 Ollama 服务器',
  'settings.apiKeyInvalid': 'API 密钥无效',
  'settings.modelRetired': '“{version}”不在 {name} 当前的模型列表中，可能已停用。建议选择其他模型。',
  'settings.expertiseLevel': '专业程度',
  'settings.expertiseBasic': '入门',
  'settings.expertiseIntermediate': '中级',
  'settings.expertiseAdvanced': '高级',
  'settings.expertiseCustom': '自定义',
  'settings.customInstructions': '自定义指令',
  'settings.customInstructionPlaceholder': '输入自定义指令...',
  // Beside the field, where the tab holding it is not in question.
  'settings.customInstructionTooShort': '自定义指令至少需要 {min} 个字符',
  // Away from that field, where it has to name the tab as well.
  'settings.customInstructionTooShortOnAiTab': 'AI 标签页中的自定义指令至少需要 {min} 个字符',

  // About tab, including how `describeMaidrSource` names the bundle's origin.
  'settings.maidrVersion': 'maidr.js 版本',
  'settings.loadedFrom': '加载来源',
  'settings.browser': '浏览器',
  'settings.operatingSystem': '操作系统',
  'settings.diagnostics': '诊断信息',
  'settings.copyDiagnostics': '复制诊断信息',
  'settings.copyDiagnosticsAria': '将诊断信息复制到剪贴板',
  'settings.copiedToClipboard': '已复制到剪贴板',
  'settings.copyFailed': '无法复制，请选中上面的内容后手动复制',
  'settings.sourceLocal': '本地资源',
  'settings.sourceInline': '嵌入在页面中',
  'settings.sourceUnknown': '未知',

  // Footer. Each button's visible text and its longer accessible name.
  'settings.reset': '重置',
  'settings.resetAria': '重置设置',
  'settings.close': '关闭',
  'settings.closeAria': '关闭设置且不保存更改',
  'settings.save': '保存并关闭',
  'settings.saveAria': '保存并关闭设置',
} satisfies Partial<Record<MessageKey, string>>;
