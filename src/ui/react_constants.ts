export const HELP_GROUPS = [
  'Navigation',
  'Modes',
  'Autoplay Controls',
  'Label Announcements',
  'General Controls',
] as const;

export const HELP_GROUP_FILTERS = {
  'Navigation': (item: { description: string }) =>
    item.description.toLowerCase().includes('navigate')
    || item.description.toLowerCase().includes('move')
    || item.description.toLowerCase().includes('go to')
    || item.description.toLowerCase().includes('replay'),

  'Modes': (item: { description: string }) =>
    item.description.toLowerCase().includes('toggle')
    && !item.description.toLowerCase().includes('autoplay'),

  'Autoplay Controls': (item: { description: string }) =>
    item.description.toLowerCase().includes('autoplay')
    || item.description.toLowerCase().includes('speed'),

  'Label Announcements': (item: { description: string }) =>
    item.description.toLowerCase().includes('announce'),

  'General Controls': (item: { description: string; key: string }, otherGroups: any[]) =>
    !otherGroups.some(group =>
      group.some((otherItem: { description: string; key: string }) =>
        otherItem.description === item.description && otherItem.key === item.key,
      ),
    ),
};
