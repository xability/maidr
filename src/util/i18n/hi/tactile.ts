import type { MessageKey } from '../index';

export const tactile = {
  'tactile.viewWholePlot': 'पूरा प्लॉट',
  'tactile.viewZoomed': 'ज़ूम {zoom} गुना, केंद्र चौड़ाई में {x}% और ऊँचाई में {y}% पर',
  'tactile.viewEmpty': '{view}; दृश्य में कुछ नहीं है',
  'tactile.viewUnchanged': '{view}; पिन वैसे ही हैं',

  'tactile.noView': 'स्पर्श डिस्प्ले पर अभी कुछ नहीं है',
  'tactile.zoomAtClosest': 'पहले से ही सबसे नज़दीकी ज़ूम पर हैं',
  'tactile.zoomAtWholePlot': 'पहले से ही पूरा प्लॉट दिख रहा है',
  'tactile.panWholePlot': 'पूरा प्लॉट पहले से दिख रहा है; खिसकाने के लिए ज़ूम इन करें',
  'tactile.panEdgeUp': 'ऊपर दिखाने के लिए और कुछ नहीं',
  'tactile.panEdgeDown': 'नीचे दिखाने के लिए और कुछ नहीं',
  'tactile.panEdgeLeft': 'बाईं ओर दिखाने के लिए और कुछ नहीं',
  'tactile.panEdgeRight': 'दाईं ओर दिखाने के लिए और कुछ नहीं',
  'tactile.brailleOff': 'स्पर्श डिस्प्ले उपयोग करने के लिए ब्रेल चालू करें',
  'tactile.notConnected': 'कोई स्पर्श डिस्प्ले कनेक्ट नहीं है',

  'tactile.lineWholeShown': 'पूरी पंक्ति पहले से दिख रही है',
  'tactile.lineStart': 'पंक्ति की शुरुआत',
  'tactile.lineEnd': 'पंक्ति का अंत',
  'tactile.linePart': '{total} में से पंक्ति भाग {index}',
  'tactile.lineUncontracted': 'संक्षिप्त ब्रेल उपलब्ध नहीं है, इसलिए स्पर्श डिस्प्ले की टेक्स्ट पंक्ति असंक्षिप्त ब्रेल में है',

  'tactile.deviceDisconnected': 'DotPad डिस्कनेक्ट हुआ',
  'tactile.deviceNoBluetooth': 'यह पेज Bluetooth से DotPad तक नहीं पहुँच सकता। Web Bluetooth के लिए Chromium ब्राउज़र और उसके उपयोग की अनुमति वाला पेज या iframe चाहिए।',
  'tactile.deviceNoUsb': 'यह पेज USB से DotPad तक नहीं पहुँच सकता। Web Serial के लिए डेस्कटॉप पर Chromium ब्राउज़र और उसके उपयोग की अनुमति वाला पेज या iframe चाहिए।',
  'tactile.deviceNoSdk': 'इस पेज पर DotPad SDK नहीं मिला।',
  'tactile.deviceNoneSelected': 'कोई DotPad नहीं चुना गया।',
  'tactile.deviceConnectFailed': 'DotPad से कनेक्ट नहीं हो सका।',
  'tactile.deviceNotPermitted': 'इस पेज को DotPad तक पहुँचने की अनुमति नहीं है। इसे HTTPS पर होना चाहिए, और iframe में उपयुक्त allow विशेषता होनी चाहिए।',
} satisfies Partial<Record<MessageKey, string>>;
