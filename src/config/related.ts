export interface RelatedProject {
  name: string;
  url: string;
  i18nKey: string;
}

export const RELATED_PROJECTS: RelatedProject[] = [
  { name: 'bgx', url: 'https://bgx.itea.dev/', i18nKey: 'bgx' },
  { name: 'ImageDash', url: 'https://image-dash.itea.dev/', i18nKey: 'imageDash' },
];
