export interface RelatedProject {
  name: string;
  url: string;
  i18nKey: string;
  /** Bundled locally: cross-origin favicons are blocked by COEP (require-corp). */
  favicon: string;
}

export const RELATED_PROJECTS: RelatedProject[] = [
  {
    name: 'bgx',
    url: 'https://bgx.itea.dev/',
    i18nKey: 'bgx',
    favicon: '/projects/bgx.ico',
  },
  {
    name: 'ImageDash',
    url: 'https://image-dash.itea.dev/',
    i18nKey: 'imageDash',
    favicon: '/projects/imagedash.ico',
  },
];
