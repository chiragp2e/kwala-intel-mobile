import React from 'react';
import { Image, StyleSheet } from 'react-native';

// Brand asset from the Kwala web app (kwala-logo-white.svg), rasterised.
const source = require('../../assets/kwala-logo-white.png');
const RATIO = 300 / 1112;

export function Logo({ width = 104 }: { width?: number }) {
  return (
    <Image
      source={source}
      style={[styles.img, { width, height: width * RATIO }]}
      accessibilityLabel="Kwala"
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({ img: { tintColor: undefined } });
