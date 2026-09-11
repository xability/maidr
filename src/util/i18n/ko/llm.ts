import type { MessageKey } from '../index';

export const llm = {
  'llm.welcome': '차트 도우미에 오신 것을 환영합니다. 아래 드롭다운에서 원하는 AI 모델을 선택하고 바꿀 수 있습니다. 현재 사용 설정된 모델: {models}.',
  'llm.welcomeNoAgents': '사용 설정된 에이전트가 없습니다. 설정 페이지에서 에이전트를 하나 이상 사용 설정하고 API 키를 입력하거나 로컬 Ollama 서버를 지정하세요.',
  'llm.processing': '요청을 처리하고 있습니다...',
  'llm.messageError': '오류: {error}',
  'llm.fallbackModelName': 'AI 도우미',

  'llm.suggestionExplain': '조금 더 자세히 설명해 주시겠어요?',
  'llm.suggestionCurrentPoint': '현재 데이터 점에 대해 무엇을 알 수 있나요?',
  'llm.suggestionCompare': '다른 데이터 점과 비교하면 어떤가요?',
  'llm.suggestionStatistics': '이 데이터를 통계적으로 분석해 주시겠어요?',
  'llm.suggestionOutliers': '이 데이터에서 이상치가 될 만한 값은 무엇인가요?',

  'llm.errorProcessing': '요청을 처리하는 중 오류가 발생했습니다',
  'llm.errorUnknown': '알 수 없는 오류가 발생했습니다',
  'llm.errorResponseUnavailable': '응답을 받을 수 없습니다',
  'llm.errorAborted': '채팅 요청이 취소되었습니다',
  'llm.errorInvalidFormat': '응답 형식이 올바르지 않습니다',
  'llm.errorApi': 'API 오류: {status} - {statusText}',

  'llm.errorGeminiKeyRequired': 'Gemini API를 사용하려면 API 키가 필요합니다',
  'llm.errorOllamaUrl': 'Ollama 서버 주소가 올바르지 않습니다. http:// 또는 https://로 시작해야 합니다',
  'llm.errorOllamaProxy': 'Ollama 요청은 MAIDR 프록시를 거쳐 보낼 수 없습니다',
  'llm.errorOllamaUnreachable': 'Ollama 서버에 연결할 수 없습니다. Ollama가 실행 중인지, localhost가 아닌 페이지라면 OLLAMA_ORIGINS가 이 사이트를 허용하는지 확인하세요.',
  'llm.errorInvalidModelKey': '모델 키가 올바르지 않습니다',
  'llm.errorProviderTimeout': '제공자가 제한 시간 안에 응답하지 않았습니다. 네트워크 연결을 확인한 뒤 다시 시도하세요.',
  'llm.errorProviderUnreachable': '제공자에 연결할 수 없습니다. 네트워크 연결을 확인하세요.',
  'llm.errorInvalidApiKey': 'API 키가 올바르지 않습니다',
  'llm.errorProviderStatus': '제공자가 {status} 상태를 반환했습니다. 키의 문제가 아니므로 잠시 후 다시 시도하세요.',
} satisfies Partial<Record<MessageKey, string>>;
