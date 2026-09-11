import type { MessageKey } from '../index';

export const rotor = {
  'rotor.higherValueMode': 'उच्च मान नेविगेशन',
  'rotor.lowerValueMode': 'निम्न मान नेविगेशन',
  'rotor.dataMode': 'डेटा बिंदु नेविगेशन',
  'rotor.rowColMode': 'पंक्ति और कॉलम नेविगेशन',
  'rotor.gridMode': 'ग्रिड नेविगेशन',
  'rotor.intersectionMode': 'प्रतिच्छेदन बिंदु नेविगेशन',
  'rotor.pointMode': 'बिंदु नेविगेशन',
  'rotor.gridModeDimensions': 'ग्रिड नेविगेशन: {rows} गुणा {cols} ग्रिड',

  'rotor.directionAbove': 'ऊपर',
  'rotor.directionBelow': 'नीचे',
  'rotor.directionLeft': 'बाएँ',
  'rotor.directionRight': 'दाएँ',
  'rotor.lowerValueNoun': 'निम्न मान',
  'rotor.higherValueNoun': 'उच्च मान',
  'rotor.pointNoun': 'बिंदु',
  'rotor.gridValueNoun': 'ग्रिड मान',

  'rotor.noneFoundVerticalTerse': '{direction} कोई {noun} नहीं मिला',
  'rotor.noneFoundVerticalVerbose': 'वर्तमान मान के {direction} कोई {noun} नहीं मिला।',
  'rotor.noneFoundHorizontalTerse': '{direction} कोई {noun} नहीं मिला',
  'rotor.noneFoundHorizontalVerbose': 'वर्तमान मान के {direction} कोई {noun} नहीं मिला।',

  'rotor.filterVerticalUnavailableTerse': '{noun} मोड में ऊपर-नीचे उपलब्ध नहीं',
  'rotor.filterVerticalUnavailableVerbose': '{noun} मोड में ऊपर और नीचे नेविगेशन उपलब्ध नहीं है।',
  'rotor.intersectionVerticalUnavailableTerse': 'प्रतिच्छेदन मोड में ऊपर-नीचे उपलब्ध नहीं',
  'rotor.intersectionVerticalUnavailableVerbose': 'प्रतिच्छेदन बिंदु मोड में ऊपर और नीचे नेविगेशन उपलब्ध नहीं है।',

  'rotor.intersectionUnavailableTerse': 'प्रतिच्छेदन मोड उपलब्ध नहीं',
  'rotor.intersectionUnavailableVerbose': 'वर्तमान संदर्भ में प्रतिच्छेदन नेविगेशन उपलब्ध नहीं है।',
  'rotor.noIntersectionTerse': '{direction} कोई प्रतिच्छेदन नहीं',
  'rotor.noIntersectionVerbose': 'वर्तमान बिंदु के {direction} कोई प्रतिच्छेदन नहीं मिला।',
} satisfies Partial<Record<MessageKey, string>>;
