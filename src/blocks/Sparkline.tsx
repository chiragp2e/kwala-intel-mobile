import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { colors } from '../theme/tokens';
import { ROLE_COLOR, role } from './roles';
import type { Role } from './types';

/** A trend with no axes and no numbers: shape only. Fills the width it is given. */
export function Sparkline({ values, role: r, height = 28 }: { values: number[]; role?: Role; height?: number }) {
  const [w, setW] = useState(0);
  const clean = values.filter(v => Number.isFinite(v));
  if (clean.length < 2) return null;

  const min = Math.min(...clean);
  const span = Math.max(...clean) - min;
  const pad = 4;
  const x = (i: number) => pad + (i / (clean.length - 1)) * Math.max(0, w - pad * 2);
  const y = (v: number) => (span === 0 ? height / 2 : pad + (1 - (v - min) / span) * (height - pad * 2));
  const color = ROLE_COLOR[role(r, 'info')];
  const last = clean.length - 1;

  return (
    <View style={{ height, width: '100%' }} onLayout={e => setW(e.nativeEvent.layout.width)}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          <Polyline
            points={clean.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <Circle cx={x(last)} cy={y(clean[last])} r={3} fill={color} stroke={colors.surface} strokeWidth={1.5} />
        </Svg>
      ) : null}
    </View>
  );
}
