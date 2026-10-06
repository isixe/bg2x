export interface RelatedProject {
  name: string;
  url: string;
  i18nKey: string;
  favicon: string;
}

export const RELATED_PROJECTS: RelatedProject[] = [
  {
    name: 'bgx',
    url: 'https://bgx.itea.dev/',
    i18nKey: 'bgx',
    favicon: 'https://bgx.itea.dev/favicon.ico',
  },
  {
    name: 'ImageDash',
    url: 'https://image-dash.itea.dev/',
    i18nKey: 'imageDash',
    favicon: 'https://image-dash.itea.dev/favicon.ico',
  },
];
