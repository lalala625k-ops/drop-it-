// Six evenly spaced hue sectors; refinements remain inside the selected sector.
export const GROUP_COLOR_FAMILIES = [
  { name: '红', hue: 0 }, { name: '黄', hue: 60 }, { name: '绿', hue: 120 },
  { name: '青', hue: 180 }, { name: '蓝', hue: 240 }, { name: '紫', hue: 300 },
] as const;

export const groupBaseColor = (hue: number) => `hsl(${hue} 68% 48%)`;

export const groupShadeColors = (hue: number) => [
  `hsl(${(hue + 342) % 360} 68% 48%)`,
  `hsl(${(hue + 354) % 360} 68% 48%)`,
  `hsl(${hue} 68% 48%)`,
  `hsl(${(hue + 6) % 360} 68% 48%)`,
  `hsl(${(hue + 18) % 360} 68% 48%)`,
  `hsl(${hue} 55% 65%)`,
];

export const groupColorText = (color: string) => {
  const hue = Number(color.match(/^hsl\((\d+)/)?.[1]);
  return hue >= 40 && hue <= 200 ? '#1d1d1d' : '#ffffff';
};
