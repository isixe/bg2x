export interface RelatedProject {
  name: string;
  url: string;
  i18nKey: string;
  /**
   * Remote logo URL. Must be CORS-enabled because COEP (require-corp) blocks
   * opaque cross-origin image responses.
   */
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
  {
    name: 'PicNook',
    url: 'https://picnook.itea.dev/',
    i18nKey: 'picnook',
    favicon: 'https://picnook.itea.dev/favicon.png',
  },
];
