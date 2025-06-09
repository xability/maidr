interface HelpMenuItem {
  description: string;
  key: string;
}

export const HELP_GROUPS = [
  'Navigation',
  'Modes',
  'Autoplay Controls',
  'Label Announcements',
  'General Controls',
] as const;

export const HELP_GROUP_FILTERS = {
  'Navigation': (item: HelpMenuItem) => {
    const normalizedDesc = item.description.toLowerCase();
    return normalizedDesc.includes('navigate')
      || normalizedDesc.includes('move')
      || normalizedDesc.includes('go to')
      || normalizedDesc.includes('replay');
  },

  'Modes': (item: HelpMenuItem) => {
    const normalizedDesc = item.description.toLowerCase();
    return normalizedDesc.includes('toggle')
      && !normalizedDesc.includes('autoplay');
  },

  'Autoplay Controls': (item: HelpMenuItem) => {
    const normalizedDesc = item.description.toLowerCase();
    return normalizedDesc.includes('autoplay')
      || normalizedDesc.includes('speed');
  },

  'Label Announcements': (item: HelpMenuItem) => {
    const normalizedDesc = item.description.toLowerCase();
    return normalizedDesc.includes('announce');
  },

  'General Controls': (item: HelpMenuItem, otherGroups: HelpMenuItem[][]) =>
    !otherGroups.some(group =>
      group.some((otherItem: HelpMenuItem) =>
        otherItem.description === item.description && otherItem.key === item.key,
      ),
    ),
};
