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
  | 'infinity';

/**
 * Lucide's drawings (the set the web app uses), on a 24 grid. Drawn with
 * react-native-svg so they stay crisp at any size and match the web icons.
 */
const LUCIDE: Partial<Record<IconName, (c: string) => React.ReactNode>> = {
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
  infinity: c => <Path d="M6 16c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8" stroke={c} />,
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
