import type { MessageKey } from '../index';

export const llm = {
  'llm.welcome': 'チャートアシスタントへようこそ。下のドロップダウンからAIモデルを選択したり切り替えたりできます。現在有効なモデル: {models}。',
  'llm.welcomeNoAgents': '有効なエージェントがありません。設定ページでエージェントを1つ以上有効にし、APIキーまたはローカルのOllamaサーバーを指定してください。',
  'llm.processing': 'リクエストを処理しています...',
  'llm.messageError': 'エラー: {error}',
  'llm.fallbackModelName': 'AIアシスタント',

  'llm.suggestionExplain': 'もう少し詳しく説明してもらえますか?',
  'llm.suggestionCurrentPoint': '現在のデータポイントについて何がわかりますか?',
  'llm.suggestionCompare': '他のデータポイントと比べるとどうですか?',
  'llm.suggestionStatistics': 'このデータを統計的に分析してもらえますか?',
  'llm.suggestionOutliers': 'このデータセットで外れ値になりそうな値はどれですか?',

  'llm.errorProcessing': 'リクエストの処理中にエラーが発生しました',
  'llm.errorUnknown': '不明なエラーが発生しました',
  'llm.errorResponseUnavailable': '応答を取得できません',
  'llm.errorAborted': 'チャットのリクエストが中止されました',
  'llm.errorInvalidFormat': '応答の形式が正しくありません',
  'llm.errorApi': 'APIエラー: {status} - {statusText}',

  'llm.errorGeminiKeyRequired': 'Gemini APIを使用するにはAPIキーが必要です',
  'llm.errorOllamaUrl': 'OllamaサーバーのURLが正しくありません。http:// または https:// で始まる必要があります',
  'llm.errorOllamaProxy': 'OllamaへのリクエストはMAIDRプロキシ経由では送信できません',
  'llm.errorOllamaUnreachable': 'Ollamaサーバーに接続できません。Ollamaが起動していること、また localhost 以外のページでは OLLAMA_ORIGINS がこのサイトを許可していることを確認してください。',
  'llm.errorInvalidModelKey': 'モデルキーが正しくありません',
  'llm.errorProviderTimeout': 'プロバイダーが時間内に応答しませんでした。ネットワーク接続を確認して、もう一度お試しください。',
  'llm.errorProviderUnreachable': 'プロバイダーに接続できませんでした。ネットワーク接続を確認してください。',
  'llm.errorInvalidApiKey': 'APIキーが正しくありません',
  'llm.errorProviderStatus': 'プロバイダーが {status} を返しました。キーの問題ではないため、しばらくしてからもう一度お試しください。',
} satisfies Partial<Record<MessageKey, string>>;
