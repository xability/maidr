export const HELP_GROUPS = [
  'Navigation',
  'Modes',
  'Autoplay Controls',
  'Label Announcements',
  'General Controls',
] as const;

export const HELP_GROUP_FILTERS = {
  'Navigation': (item: { description: string }) => {
    const normalizedDesc = item.description.toLowerCase();
    return normalizedDesc.includes('navigate')
      || normalizedDesc.includes('move')
      || normalizedDesc.includes('go to')
      || normalizedDesc.includes('replay');
  },

  'Modes': (item: { description: string }) => {
    const normalizedDesc = item.description.toLowerCase();
    return normalizedDesc.includes('toggle')
      && !normalizedDesc.includes('autoplay');
  },

  'Autoplay Controls': (item: { description: string }) => {
    const normalizedDesc = item.description.toLowerCase();
    return normalizedDesc.includes('autoplay')
      || normalizedDesc.includes('speed');
  },

  'Label Announcements': (item: { description: string }) => {
    const normalizedDesc = item.description.toLowerCase();
    return normalizedDesc.includes('announce');
  },

  'General Controls': (item: { description: string; key: string }, otherGroups: any[]) =>
    !otherGroups.some(group =>
      group.some((otherItem: { description: string; key: string }) =>
        otherItem.description === item.description && otherItem.key === item.key,
      ),
    ),
};
