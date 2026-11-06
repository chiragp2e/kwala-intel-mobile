import UIKit
import Expo
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?
  /// Kept for SceneDelegate, which starts React Native once iOS hands it a window scene.
  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)
    self.launchOptions = launchOptions

    // The window is made in SceneDelegate: apps built with the iOS 27 SDK must use the scene life cycle
    // (UIApplicationSceneManifest in Info.plist), or iOS 27 stops them at launch.
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}

/**
 * The app's one window scene. It owns the window React Native runs in, and passes the scene's life-cycle
 * events and opened URLs on to AppDelegate, because Expo's app delegate subscribers (SDK 54) only listen
 * on the application-level callbacks, which iOS no longer calls once an app uses scenes.
 */
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var app: AppDelegate? { UIApplication.shared.delegate as? AppDelegate }

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene, let app else { return }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    // Some libraries still look for the window on the app delegate.
    app.window = window
    app.reactNativeFactory?.startReactNative(withModuleName: "KwalaMobile", in: window, launchOptions: app.launchOptions)

    if !connectionOptions.urlContexts.isEmpty {
      self.scene(scene, openURLContexts: connectionOptions.urlContexts)
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let app else { return }
    for context in URLContexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
      if let source = context.options.sourceApplication {
        options[.sourceApplication] = source
      }
      if !app.application(UIApplication.shared, open: context.url, options: options) {
        RCTLinkingManager.application(UIApplication.shared, open: context.url, options: options)
      }
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = app?.application(UIApplication.shared, continue: userActivity) { _ in }
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    app?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    app?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    app?.applicationWillEnterForeground(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    app?.applicationDidEnterBackground(UIApplication.shared)
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
