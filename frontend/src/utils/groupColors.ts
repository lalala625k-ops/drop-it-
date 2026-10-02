// Default colors and continuous picker share the reference gradient's four stops.
export const GROUP_COLOR_FAMILIES = [
  { name: 'A', color: '#FACB0E' },
  { name: 'B', color: '#F06BA8' },
  { name: 'C', color: '#78BAE6' },
  { name: 'D', color: '#FFFFFF' },
] as const;

export const groupBaseColor = (name: string) =>
  GROUP_COLOR_FAMILIES.find((family) => family.name === name)?.color ?? '#FFFFFF';

const GRADIENT_STOPS = [
  { at: 0, color: '#FACB0E' },
  { at: 0.3, color: '#F06BA8' },
  { at: 0.65, color: '#78BAE6' },
  { at: 1, color: '#FFFFFF' },
] as const;

export const groupGradientColor = (position: number) => {
  const t = Math.max(0, Math.min(1, position));
  const upperIndex = GRADIENT_STOPS.findIndex((stop) => stop.at >= t);
  if (upperIndex <= 0) return GRADIENT_STOPS[0].color;
  const lower = GRADIENT_STOPS[upperIndex - 1];
  const upper = GRADIENT_STOPS[upperIndex];
  const ratio = (t - lower.at) / (upper.at - lower.at);
  const channel = (offset: number) => {
    const from = parseInt(lower.color.slice(offset, offset + 2), 16);
    const to = parseInt(upper.color.slice(offset, offset + 2), 16);
    return Math.round(from + (to - from) * ratio).toString(16).padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`.toUpperCase();
};

export const groupColorText = (color: string) => {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  let channels: number[];
  if (hex) {
    channels = [0, 2, 4].map((offset) => parseInt(hex[1].slice(offset, offset + 2), 16) / 255);
  } else {
    const hsl = color.match(/^hsl\((\d+)\s+(\d+)%\s+(\d+)%\)/);
    if (!hsl) return '#ffffff';
    const hue = Number(hsl[1]);
    const saturation = Number(hsl[2]) / 100;
    const lightness = Number(hsl[3]) / 100;
    const amplitude = saturation * Math.min(lightness, 1 - lightness);
    channels = [0, 8, 4].map((shift) => {
      const segment = (shift + hue / 30) % 12;
      return lightness - amplitude * Math.max(-1, Math.min(segment - 3, 9 - segment, 1));
    });
  }
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return luminance > 0.205 ? '#1d1d1d' : '#ffffff';
};
