import { Image, type ImageSourcePropType } from 'react-native';
import { GOOGLE_PNG } from '../components/iconImages';

const logo = require('../../assets/kwala-logo-white.png');
const icon = require('../../assets/kwala-icon-white.png');

/** Images the first screens draw. Warmed while the splash plays so they never pop in. */
const SOURCES: ImageSourcePropType[] = [logo, icon, GOOGLE_PNG];

/** Ask the image cache for each source. Never rejects: a miss just means a normal lazy load. */
export function preloadAssets(): Promise<void> {
  const jobs = SOURCES.map(src => {
    const uri = Image.resolveAssetSource(src)?.uri;
    return uri ? Image.prefetch(uri).catch(() => false) : Promise.resolve(false);
  });
  return Promise.all(jobs).then(() => undefined);
}
