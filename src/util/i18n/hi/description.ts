import type { MessageKey } from '../index';

export const description = {
  'description.statOrientation': 'दिशा',
  'description.statSubtitle': 'उपशीर्षक',
  'description.statCaption': 'कैप्शन',
  'description.statCurrentlyOn': 'वर्तमान स्थान',
  'description.statChartTypes': 'चार्ट प्रकार',
  'description.multiPanelFigure': 'बहु-पैनल फ़िगर',
  'description.valueInfinity': 'अनंत',
  'description.valueNegativeInfinity': 'ऋणात्मक अनंत',
  'description.subplotPosition': '{total} में से सबप्लॉट {index}',
  'description.chartTypeCount': '{kind} ({count})',

  'description.title': 'चार्ट विवरण',
  'description.close': 'बंद करें',
  'description.chartTypePrefix': 'चार्ट प्रकार: ',
  'description.titleLabel': 'शीर्षक',
  'description.titleLabelSubplot': 'सबप्लॉट शीर्षक',
  'description.titleLabelFigure': 'फ़िगर शीर्षक',
  'description.axesHeading': 'अक्ष',
  'description.axisEntry': '{axis} अक्ष: {label}',
  'description.summaryHeading': 'सारांश',
  'description.subplotsHeading': 'सबप्लॉट ({count})',
  'description.subplotUnknown': 'अज्ञात',
  'description.subplotCurrent': ' (वर्तमान)',

  'description.layersHeading': 'लेयर ({count})',
  'description.showingLayer': '{total} में से लेयर {index} दिखाई जा रही है',
  'description.layerHint': 'लेयर बदलने के लिए बाएँ और दाएँ तीर कुंजियाँ दबाएँ और लेयर खोलने के लिए Space दबाएँ।',
  'description.layerUpdated': '{total} में से लेयर {index} का विवरण अपडेट हुआ',

  'description.rowOne': 'पंक्ति',
  'description.rowMany': 'पंक्तियाँ',
  'description.tableCaption': 'डेटा: {total} {rows}',
  'description.tableCaptionTruncated': 'डेटा: {total} {rows} में से {shown} दिखाई जा रही हैं',
  'description.tableShowMore': '{total} {rows} में से {count} और दिखाएँ',
  'description.tableColumn': 'कॉलम {index}',
} satisfies Partial<Record<MessageKey, string>>;
