import React from 'react';
import { Image, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import { SPARKLES_PNG } from './iconImages';

export type IconName =
  | 'menu'
  | 'plus'
  | 'close'
  | 'sparkles'
  | 'chevron'
  | 'arrow-up'
  | 'arrow-right'
  | 'panel-left'
  | 'square-pen'
  | 'download'
  | 'zoom-in'
  | 'zoom-out'
  | 'rotate-ccw'
  | 'clock'
  | 'gauge'
  | 'check'
  | 'infinity'
  | 'mail'
  | 'phone'
  | 'bell'
  | 'copy'
  | 'mic'
  | 'stop'
  | 'trash'
  | 'message-square'
  | 'log-out'
  | 'history'
  | 'tag'
  | 'alert-triangle'
  | 'info'
  | 'user'
  | 'microscope'
  | 'credit-card';

/**
 * Lucide's drawings (the set the web app uses), on a 24 grid. Drawn with
 * react-native-svg so they stay crisp at any size and match the web icons.
 */
const LUCIDE: Partial<Record<IconName, (c: string) => React.ReactNode>> = {
  'credit-card': c => (
    <>
      <Rect x={2} y={5} width={20} height={14} rx={2} stroke={c} />
      <Line x1={2} y1={10} x2={22} y2={10} stroke={c} />
    </>
  ),
  microscope: c => (
    <>
      <Path d="M6 18h8" stroke={c} />
      <Path d="M3 22h18" stroke={c} />
      <Path d="M14 22a7 7 0 1 0 0-14h-1" stroke={c} />
      <Path d="M9 14h2" stroke={c} />
      <Path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" stroke={c} />
      <Path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" stroke={c} />
    </>
  ),
  'panel-left': c => (
    <>
      <Rect x={3} y={3} width={18} height={18} rx={2} stroke={c} />
      <Path d="M9 3v18" stroke={c} />
    </>
  ),
  'square-pen': c => (
    <>
      <Path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={c} />
      <Path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" stroke={c} />
    </>
  ),
  download: c => (
    <>
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke={c} />
      <Polyline points="7 10 12 15 17 10" stroke={c} />
      <Line x1={12} y1={15} x2={12} y2={3} stroke={c} />
    </>
  ),
  'zoom-in': c => (
    <>
      <Circle cx={11} cy={11} r={8} stroke={c} />
      <Path d="m21 21-4.3-4.3M11 8v6M8 11h6" stroke={c} />
    </>
  ),
  'zoom-out': c => (
    <>
      <Circle cx={11} cy={11} r={8} stroke={c} />
      <Path d="m21 21-4.3-4.3M8 11h6" stroke={c} />
    </>
  ),
  'rotate-ccw': c => (
    <>
      <Path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke={c} />
      <Path d="M3 3v5h5" stroke={c} />
    </>
  ),
  clock: c => (
    <>
      <Circle cx={12} cy={12} r={10} stroke={c} />
      <Polyline points="12 6 12 12 16 14" stroke={c} />
    </>
  ),
  gauge: c => <Path d="m12 14 4-4M3.34 19a10 10 0 1 1 17.32 0" stroke={c} />,
  check: c => <Polyline points="20 6 9 17 4 12" stroke={c} />,
  mail: c => (
    <>
      <Rect x={2} y={4} width={20} height={16} rx={2} stroke={c} />
      <Path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" stroke={c} />
    </>
  ),
  phone: c => (
    <Path
      d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
      stroke={c}
    />
  ),
  infinity: c => <Path d="M6 16c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8" stroke={c} />,
  bell: c => (
    <>
      <Path d="M10.268 21a2 2 0 0 0 3.464 0" stroke={c} />
      <Path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" stroke={c} />
    </>
  ),
  copy: c => (
    <>
      <Rect x={8} y={8} width={14} height={14} rx={2} stroke={c} />
      <Path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" stroke={c} />
    </>
  ),
  mic: c => (
    <>
      <Path d="M12 19v3M19 10v2a7 7 0 0 1-14 0v-2" stroke={c} />
      <Rect x={9} y={2} width={6} height={13} rx={3} stroke={c} />
    </>
  ),
  stop: c => <Rect x={5} y={5} width={14} height={14} rx={2.5} stroke={c} fill={c} />,
  trash: c => <Path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6" stroke={c} />,
  'message-square': c => <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" stroke={c} />,
  'log-out': c => (
    <>
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M21 12H9" stroke={c} />
      <Polyline points="16 17 21 12 16 7" stroke={c} />
    </>
  ),
  history: c => (
    <>
      <Path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke={c} />
      <Path d="M3 3v5h5M12 7v5l4 2" stroke={c} />
    </>
  ),
  tag: c => (
    <>
      <Path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" stroke={c} />
      <Circle cx={7.5} cy={7.5} r={0.5} stroke={c} fill={c} />
    </>
  ),
  'alert-triangle': c => <Path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4M12 17h.01" stroke={c} />,
  info: c => (
    <>
      <Circle cx={12} cy={12} r={10} stroke={c} />
      <Path d="M12 16v-4M12 8h.01" stroke={c} />
    </>
  ),
  user: c => (
    <>
      <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" stroke={c} />
      <Circle cx={12} cy={7} r={4} stroke={c} />
    </>
  ),
};

interface Props {
  name: IconName;
  size?: number;
  color: string;
}

/**
 * Small line icons. The simple ones are drawn from Views; the richer ones are
 * lucide drawings (see LUCIDE). They replace text glyphs like "≡" and "↑",
 * which render at different weights and baselines on iOS and Android.
 */
export function Icon({ name, size = 22, color }: Props) {
  const lucide = LUCIDE[name];
  if (lucide) {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        accessibilityElementsHidden
        importantForAccessibility="no">
        {lucide(color)}
      </Svg>
    );
  }
  const stroke = Math.max(2, Math.round(size / 11));
  const box = { width: size, height: size, alignItems: 'center' as const, justifyContent: 'center' as const };
  const bar = { backgroundColor: color, borderRadius: stroke };

  switch (name) {
    case 'menu':
      return (
        <View style={[box, { gap: stroke * 1.6 }]} accessibilityElementsHidden importantForAccessibility="no">
          <View style={[bar, { width: size * 0.72, height: stroke }]} />
          <View style={[bar, { width: size * 0.5, height: stroke, alignSelf: 'flex-start', marginLeft: size * 0.14 }]} />
          <View style={[bar, { width: size * 0.72, height: stroke }]} />
        </View>
      );
    case 'plus':
      return (
        <View style={box} accessibilityElementsHidden importantForAccessibility="no">
          <View style={[bar, { position: 'absolute', width: size * 0.64, height: stroke }]} />
          <View style={[bar, { position: 'absolute', width: stroke, height: size * 0.64 }]} />
        </View>
      );
    case 'sparkles':
      // The web app's Ultra star (lucide "sparkles"), a white PNG tinted to `color`.
      return (
        <Image
          source={SPARKLES_PNG}
          style={{ width: size, height: size, tintColor: color }}
          accessibilityIgnoresInvertColors
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      );
    case 'close':
      return (
        <View style={box} accessibilityElementsHidden importantForAccessibility="no">
          <View style={[bar, { position: 'absolute', width: size * 0.62, height: stroke, transform: [{ rotate: '45deg' }] }]} />
          <View style={[bar, { position: 'absolute', width: size * 0.62, height: stroke, transform: [{ rotate: '-45deg' }] }]} />
        </View>
      );
    case 'chevron': {
      const s = size * 0.38;
      return (
        <View style={box} accessibilityElementsHidden importantForAccessibility="no">
          <View
            style={{
              width: s,
              height: s,
              borderTopWidth: stroke,
              borderRightWidth: stroke,
              borderColor: color,
              borderTopRightRadius: stroke / 2,
              transform: [{ rotate: '45deg' }, { translateX: -s * 0.12 }, { translateY: s * 0.12 }],
            }}
          />
        </View>
      );
    }
    case 'arrow-up':
    case 'arrow-right': {
      const s = size * 0.42;
      const rotate = name === 'arrow-up' ? '0deg' : '90deg';
      return (
        <View style={[box, { transform: [{ rotate }] }]} accessibilityElementsHidden importantForAccessibility="no">
          <View style={[bar, { position: 'absolute', width: stroke, height: size * 0.62, top: size * 0.2 }]} />
          <View
            style={{
              position: 'absolute',
              top: size * 0.2 + stroke * 0.2,
              width: s,
              height: s,
              borderTopWidth: stroke,
              borderLeftWidth: stroke,
              borderColor: color,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </View>
      );
    }
  }
}
