import type { MessageKey } from '../index';

export const notification = {
  'notification.speedUp': 'गति बढ़ी',
  'notification.maxSpeed': 'अधिकतम गति',
  'notification.speedDown': 'गति घटी',
  'notification.minSpeed': 'न्यूनतम गति',
  'notification.resetSpeed': 'गति रीसेट',

  'notification.soundIs': 'ध्वनि {mode} है',
  'notification.audioModeOff': 'बंद',
  'notification.audioModeOn': 'चालू',
  'notification.audioModeCombined': 'संयुक्त',
  'notification.audioModeSeparate': 'अलग-अलग',

  'notification.brailleIsOn': 'ब्रेल चालू है',
  'notification.brailleIsOff': 'ब्रेल बंद है',
  'notification.brailleNoInfo': 'ब्रेल के लिए कोई जानकारी नहीं',
  'notification.brailleNotSupported': 'इस प्लॉट प्रकार के लिए ब्रेल समर्थित नहीं है: {type}',
  'notification.brailleDisplay': 'ब्रेल डिस्प्ले',

  'notification.monitoringLiveOnly': 'मॉनिटरिंग केवल लाइव चार्ट के लिए उपलब्ध है',
  'notification.monitoringOn': 'मॉनिटरिंग चालू',
  'notification.monitoringOff': 'मॉनिटरिंग बंद',

  'notification.highContrastOn': 'उच्च कंट्रास्ट मोड चालू',
  'notification.highContrastOff': 'उच्च कंट्रास्ट मोड बंद',

  'notification.deltaCandlestickOnly': 'संदर्भ तुलना केवल कैंडलस्टिक चार्ट पर उपलब्ध है।',
  'notification.deltaNeedsLineLayer': 'संदर्भ तुलना केवल लाइन लेयर वाले कैंडलस्टिक चार्ट पर उपलब्ध है।',
  'notification.deltaReferenceUnavailable': 'चुनी गई संदर्भ रेखा उपलब्ध नहीं है।',
  'notification.deltaNoMatchingX': 'कैंडलस्टिक चार्ट और {reference} के बीच कोई मेल खाता x मान नहीं है।',
  'notification.deltaKeepingComparison': 'वर्तमान तुलना बनी रहेगी: {reference} {x} तक नहीं पहुँचती। किसी ऐसी कैंडल पर जाएँ जिसे यह कवर करती है, फिर इसे दोबारा चुनें।',
  'notification.deltaNoComparisonAtX': '{x} पर कोई संदर्भ तुलना नहीं: {reference} इस कैंडल तक नहीं पहुँचती। किसी ऐसी कैंडल पर जाएँ जिसे मूविंग एवरेज कवर करता है, फिर Alt L दबाएँ।',
  'notification.deltaActivationFailed': 'यहाँ संदर्भ तुलना सक्रिय नहीं की जा सकी।',
  'notification.deltaActivated': 'संदर्भ तुलना चालू: OHLC मूल्य में से {reference} घटाकर, {count} बिंदु, {field} से शुरू। धनात्मक मान रेखा के ऊपर हैं, ऋणात्मक नीचे। कैंडल बदलने के लिए बाएँ और दाएँ तीर दबाएँ, ओपन, हाई, लो और क्लोज़ के बीच बदलने के लिए ऊपर और नीचे तीर दबाएँ। तुलना बंद करने के लिए Alt L दबाएँ, चरम मान के लिए G दबाएँ, और रेखा के ऊपर, नीचे या रेखा पर स्थित बिंदुओं को देखने के लिए रोटर का उपयोग करें। चार्ट पर लौटने के लिए Escape दबाएँ।',
  'notification.deltaClosed': 'संदर्भ तुलना बंद हुई। चार्ट लेयर पर लौटे। दोबारा तुलना करने के लिए Alt L दबाएँ।',
  'notification.deltaClosedByUpdate': 'डेटा अपडेट के कारण संदर्भ तुलना बंद हुई।',
  'notification.deltaNoReferenceChosen': 'अभी तक कोई संदर्भ रेखा नहीं चुनी गई है। सूची से कोई मूविंग एवरेज रेखा चुनें और तुलना के लिए Enter दबाएँ। रद्द करने के लिए Escape दबाएँ।',
  'notification.deltaTraceTitle': 'OHLC मूल्य बनाम {reference}',
  'notification.deltaYAxisLabel': '{axis} अंतर',

  'notification.deltaPickerTitle': 'संदर्भ रेखा से तुलना करें',
  'notification.deltaPickerClose': 'संदर्भ रेखा चयनकर्ता बंद करें',
  'notification.deltaPickerDescription': 'हर कैंडल की तुलना के लिए एक संदर्भ रेखा चुनें। चलने के लिए ऊपर और नीचे तीर दबाएँ, फिर Enter दबाएँ। चुनने के बाद तुलना चालू या बंद करने के लिए Alt L दबाएँ।',
  'notification.deltaPickerListLabel': 'संदर्भ रेखाएँ',
} satisfies Partial<Record<MessageKey, string>>;
