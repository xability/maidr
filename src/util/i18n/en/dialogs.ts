/**
 * The chrome of the dialogs: what names a dialog, its regions and its
 * controls, and what its live regions announce.
 */
export const dialogs = {
  // Chat dialog.
  'dialogs.chatTitle': 'Chart Assistant',
  'dialogs.chatClose': 'Close chat dialog',
  'dialogs.chatMessagesRegion': 'Chat messages',
  'dialogs.chatInputRegion': 'Message input',
  'dialogs.chatPlaceholder': 'What can I help you with?',
  'dialogs.chatInputLabel': 'Type your message to the AI assistant',
  'dialogs.chatSend': 'Send message to AI assistant',
  'dialogs.chatSuggestionsRegion': 'Suggested responses',
  'dialogs.chatSuggestion': 'Suggestion: {text}',

  // One message in the transcript.
  'dialogs.chatUserMessage': 'Your message',
  'dialogs.chatAssistantMessage': 'AI Assistant message',
  'dialogs.chatMessageFrom': ' from {model}',
  'dialogs.chatMessageTyping': ' (typing)',
  'dialogs.chatModelName': 'Model: {model}',
  'dialogs.chatOpenSettings': 'Open Settings',
  'dialogs.chatOpenSettingsLabel': 'Open settings',
  'dialogs.chatSentAt': 'Sent at {time}',
  'dialogs.chatSentImageAlt': 'Plot image sent to the AI',
  'dialogs.chatTyping': 'AI is typing',
  'dialogs.chatCodeBlock': 'Code block',
  'dialogs.chatImageAlt': 'Image in message',
  'dialogs.chatSelectVersion': 'Select {name} version',

  // Go To (extrema) dialog.
  'dialogs.extremaTitle': 'Go To',
  'dialogs.extremaClose': 'Close dialog',
  'dialogs.extremaDescription': 'Navigate to points of interest within the current {traceType}',
  'dialogs.extremaDescriptionFallback': 'Navigate to points of interest',
  'dialogs.extremaTargets': 'Navigation targets',
  'dialogs.extremaXValues': 'Available X values',
  'dialogs.extremaSearchOption': 'Search and navigate to specific X value',
  'dialogs.extremaSearchCombobox': 'Search and select X value',
  'dialogs.extremaSearchLabel': 'Search X values',
  'dialogs.extremaSearchPlaceholder': 'Type to search {count} values',
  'dialogs.extremaOpenDropdown': 'Open dropdown',
  'dialogs.extremaCloseDropdown': 'Close dropdown',

  // Extrema target labels.
  'dialogs.extremaPointIntersection': 'Point intersection',
  'dialogs.extremaSlopeIntersection': 'Slope intersection',
  'dialogs.extremaIntersection': 'Intersection',
  'dialogs.extremaIntersectionAt': '{prefix} with {otherLines} at {coords}',
  'dialogs.extremaValueAt': '{label} Value: {value} at {x}',
  'dialogs.extremaValue': '{label} Value: {value}',

  'dialogs.extremaCell': '{x}, {y}',

  // What focus does not announce on its own.
  'dialogs.extremaMovedToSearch': 'Moved to search. Type to filter X values.',
  'dialogs.extremaFirstOption': 'At first extrema option',
  'dialogs.extremaLastOption': 'At last extrema option',
  'dialogs.extremaNoResults': 'No search results',
  'dialogs.extremaLastResult': 'At last search result',
  'dialogs.extremaSelectedResult': 'Selected: {label}',
  'dialogs.extremaReturningTo': 'Returning to extrema options: {label}',
  'dialogs.extremaReturning': 'Returning to extrema options',

  // Object list dialog.
  'dialogs.objectListTitle': 'Object list',
  'dialogs.objectListClose': 'Close object list',
  'dialogs.objectListKeys': 'Up and Down arrows choose, Enter goes there, Escape closes.',
  'dialogs.objectListKeysSort': 'S changes the order.',
  'dialogs.objectListKeysFilter': 'F changes the filter.',
  'dialogs.objectListSummaryAll': '{count}, {sort}',
  'dialogs.objectListSummaryFiltered': '{filter}: {shown} of {total}, {sort}',
  'dialogs.objectListChanged': '{summary}: {object}',
  'dialogs.objectListOrder': 'Order: {sort}',
  'dialogs.objectListShowing': 'Showing: {filter}',
  'dialogs.objectListShowingAll': 'All',
  'dialogs.objectListTop': 'Top of the list',
  'dialogs.objectListEnd': 'End of the list',
  'dialogs.objectListOneOrder': 'This list has one order',
  'dialogs.objectListNoFilters': 'This list has no filters',
  'dialogs.objectListCurrent': 'current',
  'dialogs.objectListSeparator': ', ',
  'dialogs.objectDetail': '{label}: {value}',
  'dialogs.objectSortChart': 'Chart order',
  'dialogs.objectSortNameAscending': 'Name, A to Z',
  'dialogs.objectSortHighest': '{measure}, highest first',
  'dialogs.objectSortLowest': '{measure}, lowest first',
} as const;
