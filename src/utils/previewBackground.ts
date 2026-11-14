import type { PreviewBackground } from '../type';

const SURFACE_LIGHT = '#f3f4f6';
const SURFACE_DARK = '#1e293b';
const FALLBACK_CUSTOM_COLOR = '#808080';

export interface PreviewBackgroundStyle {
  backgroundColor: string;
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
  backgroundRepeat: string;
}

function solid(color: string): PreviewBackgroundStyle {
  return {
    backgroundColor: color,
    backgroundImage: 'none',
    backgroundSize: 'auto',
    backgroundPosition: '0 0',
    backgroundRepeat: 'repeat',
  };
}

export function getPreviewBackgroundStyle(
  mode: PreviewBackground,
  customColor: string,
  isDarkMode: boolean,
  imageUrl: string | null,
): PreviewBackgroundStyle {
  if (mode === 'black') return solid('#000');
  if (mode === 'white') return solid('#fff');
  if (mode === 'custom') return solid(customColor || FALLBACK_CUSTOM_COLOR);

  const surfaceColor = isDarkMode ? SURFACE_DARK : SURFACE_LIGHT;

  if (mode === 'image' && imageUrl) {
    return {
      backgroundColor: surfaceColor,
      backgroundImage: `url("${imageUrl}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }

  // mask: transparent so the dialog's dark overlay shows through, not a checkerboard
  return solid('transparent');
}

function parseHex(hex: string): [number, number, number] | null {
  const value = hex.trim().replace('#', '');
  const expanded =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return null;
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ];
}

export function getRelativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isLightPreviewBackground(
  mode: PreviewBackground,
  customColor: string,
  isDarkMode: boolean,
): boolean {
  if (mode === 'white') return true;
  if (mode === 'black') return false;
  if (mode === 'custom') {
    const luminance = getRelativeLuminance(customColor);
    return luminance === null ? true : luminance > 0.35;
  }
  if (mode === 'image') return !isDarkMode;
  // mask is always dark, regardless of the app theme
  return false;
}
