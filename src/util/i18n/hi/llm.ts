import type { MessageKey } from '../index';

export const llm = {
  'llm.welcome': 'चार्ट सहायक में आपका स्वागत है। नीचे दिए गए ड्रॉपडाउन से आप अलग-अलग AI मॉडल चुन सकते हैं और बदल सकते हैं। अभी सक्षम: {models}।',
  'llm.welcomeNoAgents': 'कोई एजेंट सक्षम नहीं है। कृपया सेटिंग्स पेज में कम से कम एक एजेंट सक्षम करें और API कुंजी या स्थानीय Ollama सर्वर दें।',
  'llm.processing': 'अनुरोध पर काम हो रहा है...',
  'llm.messageError': 'त्रुटि: {error}',
  'llm.fallbackModelName': 'AI सहायक',

  'llm.suggestionExplain': 'क्या आप इसे और विस्तार से समझा सकते हैं?',
  'llm.suggestionCurrentPoint': 'वर्तमान डेटा बिंदु के बारे में आप क्या बता सकते हैं?',
  'llm.suggestionCompare': 'अन्य डेटा बिंदुओं की तुलना में यह कैसा है?',
  'llm.suggestionStatistics': 'क्या आप इस डेटा का सांख्यिकीय विश्लेषण कर सकते हैं?',
  'llm.suggestionOutliers': 'इस डेटासेट में संभावित आउटलायर कौन से हैं?',

  'llm.errorProcessing': 'अनुरोध पर काम करते समय त्रुटि हुई',
  'llm.errorUnknown': 'अज्ञात त्रुटि हुई',
  'llm.errorResponseUnavailable': 'उत्तर उपलब्ध नहीं है',
  'llm.errorAborted': 'चैट अनुरोध रद्द किया गया',
  'llm.errorInvalidFormat': 'उत्तर का प्रारूप अमान्य है',
  'llm.errorApi': 'API त्रुटि: {status} - {statusText}',

  'llm.errorGeminiKeyRequired': 'Gemini API के लिए API कुंजी ज़रूरी है',
  'llm.errorOllamaUrl': 'Ollama सर्वर URL अमान्य है। यह http:// या https:// से शुरू होना चाहिए',
  'llm.errorOllamaProxy': 'Ollama अनुरोध MAIDR प्रॉक्सी के ज़रिए नहीं भेजे जा सकते',
  'llm.errorOllamaUnreachable': 'Ollama सर्वर से संपर्क नहीं हो पा रहा है। सुनिश्चित करें कि Ollama चल रहा है और, localhost के अलावा किसी और पेज के लिए, OLLAMA_ORIGINS इस साइट को अनुमति देता है।',
  'llm.errorInvalidModelKey': 'मॉडल कुंजी अमान्य है',
  'llm.errorProviderTimeout': 'प्रदाता ने समय पर उत्तर नहीं दिया। अपना नेटवर्क कनेक्शन जाँचें और फिर से कोशिश करें।',
  'llm.errorProviderUnreachable': 'प्रदाता से संपर्क नहीं हो सका। अपना नेटवर्क कनेक्शन जाँचें।',
  'llm.errorInvalidApiKey': 'API कुंजी अमान्य है',
  'llm.errorProviderStatus': 'प्रदाता ने {status} लौटाया। यह आपकी कुंजी की समस्या नहीं है, बाद में फिर से कोशिश करें।',
} satisfies Partial<Record<MessageKey, string>>;
