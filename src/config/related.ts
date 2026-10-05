export interface RelatedProject {
  name: string;
  url: string;
  i18nKey: string;
}

export const RELATED_PROJECTS: RelatedProject[] = [
  { name: 'LinkChecker', url: 'https://link-checker.itea.dev/', i18nKey: 'linkChecker' },
  { name: 'MetaThief', url: 'https://meta-thief.itea.dev/', i18nKey: 'metaThief' },
  { name: 'ColorConverter', url: 'https://color-converter.itea.dev/', i18nKey: 'colorConverter' },
  { name: 'ColorPalette', url: 'https://color-palette.itea.dev/', i18nKey: 'colorPalette' },
  {
    name: 'CookieInspector',
    url: 'https://cookie-inspector.itea.dev',
    i18nKey: 'cookieInspector',
  },
  {
    name: 'AdSenseDetective',
    url: 'https://github.com/isixe/AdSenseDetective',
    i18nKey: 'adSenseDetective',
  },
];
