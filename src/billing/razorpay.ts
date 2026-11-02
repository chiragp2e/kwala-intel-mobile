import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import { readCheckoutError, readCheckoutSuccess, type NativeCheckoutOptions, type NativeCheckoutOutcome } from './checkout';

/**
 * Whether this binary has Razorpay's native checkout. An over-the-air JS
 * update can reach a build made before the module was added, so this is
 * checked at runtime and react-native-razorpay is only required on use:
 * importing it eagerly would crash that older build at startup.
 */
export function nativeCheckoutAvailable(): boolean {
  try {
    return TurboModuleRegistry.get('RNRazorpayCheckout') != null || NativeModules.RNRazorpayCheckout != null;
  } catch {
    return false;
  }
}

/** Opens the native checkout sheet and resolves once the customer pays, closes it, or it fails. */
export async function openNativeCheckout(options: NativeCheckoutOptions): Promise<NativeCheckoutOutcome> {
  const RazorpayCheckout = require('react-native-razorpay').default as { open: (o: object) => Promise<unknown> };
  try {
    return readCheckoutSuccess(await RazorpayCheckout.open(options), options.subscription_id);
  } catch (e) {
    return readCheckoutError(e, Platform.OS);
  }
}
