import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Tasarım dosyasındaki ince çizgili ikonlar (24×24 viewBox). */
interface IconProps {
  size?: number;
  color: string;
  strokeWidth?: number;
}

const base = (size: number, color: string, strokeWidth: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: color,
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const TodayIcon = ({ size = 22, color, strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size, color, strokeWidth)}>
    <Circle cx="12" cy="12" r="4" />
    <Path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" />
  </Svg>
);
export const WeekIcon = ({ size = 22, color, strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size, color, strokeWidth)}>
    <Rect x="3" y="5" width="18" height="16" rx="2" />
    <Path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);
export const FocusIcon = ({ size = 22, color, strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size, color, strokeWidth)}>
    <Circle cx="12" cy="13" r="8" />
    <Path d="M12 9v4l2.5 2.5M9 2h6" />
  </Svg>
);
export const GoalsIcon = ({ size = 22, color, strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size, color, strokeWidth)}>
    <Path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Svg>
);
export const PenaltyIcon = ({ size = 22, color, strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size, color, strokeWidth)}>
    <Path d="M13 2L4 14h7l-1 8 9-12h-7z" />
  </Svg>
);
export const JournalIcon = ({ size = 22, color, strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size, color, strokeWidth)}>
    <Path d="M5 3h11l3 3v15H5z" />
    <Path d="M9 9h6M9 13h6M9 17h3" />
  </Svg>
);
export const MoneyIcon = ({ size = 22, color, strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size, color, strokeWidth)}>
    <Path d="M4 7h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1z" />
    <Path d="M4 7l11-3v3M16 13h4v3h-4a1.5 1.5 0 0 1 0-3z" />
  </Svg>
);
export const BellIcon = ({ size = 18, color, strokeWidth = 2 }: IconProps) => (
  <Svg {...base(size, color, strokeWidth)}>
    <Path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" />
  </Svg>
);
export const GearIcon = ({ size = 18, color, strokeWidth = 2 }: IconProps) => (
  <Svg {...base(size, color, strokeWidth)}>
    <Circle cx="12" cy="12" r="3" />
    <Path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
  </Svg>
);
export const BackIcon = ({ size = 22, color, strokeWidth = 2 }: IconProps) => (
  <Svg {...base(size, color, strokeWidth)}>
    <Path d="M15 5l-7 7 7 7" />
  </Svg>
);
export const PlusIcon = ({ size = 16, color, strokeWidth = 2.4 }: IconProps) => (
  <Svg {...base(size, color, strokeWidth)}>
    <Path d="M12 5v14M5 12h14" />
  </Svg>
);
export const CheckIcon = ({ size = 16, color, strokeWidth = 3 }: IconProps) => (
  <Svg {...base(size, color, strokeWidth)}>
    <Path d="M5 12l5 5 9-10" />
  </Svg>
);
export const CrossIcon = ({ size = 16, color, strokeWidth = 2.6 }: IconProps) => (
  <Svg {...base(size, color, strokeWidth)}>
    <Path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const ResetIcon = ({ size = 20, color, strokeWidth = 2 }: IconProps) => (
  <Svg {...base(size, color, strokeWidth)}>
    <Path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4" />
  </Svg>
);
export const CalendarIcon = ({ size = 16, color, strokeWidth = 2 }: IconProps) => (
  <Svg {...base(size, color, strokeWidth)}>
    <Rect x="3" y="5" width="18" height="16" rx="2" />
    <Path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);
export const ForwardIcon = ({ size = 22, color, strokeWidth = 2 }: IconProps) => (
  <Svg {...base(size, color, strokeWidth)}>
    <Path d="M9 5l7 7-7 7" />
  </Svg>
);
export const CopyIcon = ({ size = 18, color, strokeWidth = 2 }: IconProps) => (
  <Svg {...base(size, color, strokeWidth)}>
    <Rect x="8" y="8" width="12" height="12" rx="2" />
    <Path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Svg>
);
