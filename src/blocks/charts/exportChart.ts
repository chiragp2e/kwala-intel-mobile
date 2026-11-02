import { NativeModules, TurboModuleRegistry, type View } from 'react-native';

type Captured = { captureRef: (view: View, options: object) => Promise<string> };
type Sharing = { shareAsync: (uri: string, options?: object) => Promise<void>; isAvailableAsync: () => Promise<boolean> };

/**
 * The image export needs two native modules (`react-native-view-shot`,
 * `expo-sharing`). A build from before they were added can still receive this
 * code as an over-the-air update, so they are loaded lazily and the download
 * button simply stays hidden when they are missing.
 */
export function chartExportAvailable(): boolean {
  try {
    const viewShot = TurboModuleRegistry.get('RNViewShot') != null || NativeModules.RNViewShot != null;
    return viewShot && load().sharing != null;
  } catch {
    return false;
  }
}

function load(): { shot: Captured; sharing: Sharing } {
  return {
    shot: require('react-native-view-shot') as Captured,
    sharing: require('expo-sharing') as Sharing,
  };
}

export type ExportResult = 'shared' | 'unavailable' | 'failed';

/** Photographs `view` at screen resolution and opens the share sheet, where "Save image" or Files / Drive keeps it. */
export async function shareChartImage(view: View | null, title: string): Promise<ExportResult> {
  if (!view) return 'failed';
  try {
    const { shot, sharing } = load();
    if (!(await sharing.isAvailableAsync())) return 'unavailable';
    const name = title.trim().replace(/[^\w-]+/g, '_').slice(0, 60) || 'chart';
    const uri = await shot.captureRef(view, { format: 'png', quality: 1, result: 'tmpfile', fileName: name });
    try {
      await sharing.shareAsync(uri.startsWith('file://') ? uri : `file://${uri}`, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: 'Share chart',
      });
    } catch {
      // Closing the share sheet without choosing anything can reject on some devices; the image was made, so that's not an error.
    }
    return 'shared';
  } catch {
    return 'failed';
  }
}
