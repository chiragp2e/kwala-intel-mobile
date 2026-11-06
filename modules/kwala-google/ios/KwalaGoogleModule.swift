import ExpoModulesCore
import GoogleSignIn

/**
 * The Google account sheet, as @react-native-google-signin's signIn(), but with a nonce we choose.
 *
 * Without one, GoogleSignIn (through AppAuth) puts a random nonce of its own in the ID token, which the
 * app never sees, and Supabase then refuses the token: a token with a nonce must come with the matching
 * value. The JS side passes the SHA-256 of a fresh random string here and gives Supabase the string.
 *
 * GIDSignIn.sharedInstance must already be configured: GoogleSignin.configure() in JS does that.
 */
public class KwalaGoogleModule: Module {
  public func definition() -> ModuleDefinition {
    Name("KwalaGoogle")

    AsyncFunction("signIn") { (nonce: String, promise: Promise) in
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("NO_VIEW_CONTROLLER", "There is no screen to show the Google sheet on.")
        return
      }
      GIDSignIn.sharedInstance.signIn(withPresenting: presenter, hint: nil, additionalScopes: nil, nonce: nonce) { result, error in
        if let error = error as NSError? {
          if error.domain == kGIDSignInErrorDomain && error.code == GIDSignInError.Code.canceled.rawValue {
            promise.resolve(["type": "cancelled"])
          } else {
            promise.reject("SIGN_IN_FAILED", "\(error.domain) \(error.code): \(error.localizedDescription)")
          }
          return
        }
        guard let idToken = result?.user.idToken?.tokenString else {
          promise.reject("NO_ID_TOKEN", "Google returned no ID token.")
          return
        }
        promise.resolve(["type": "success", "idToken": idToken])
      }
    }.runOnQueue(.main)
  }
}
