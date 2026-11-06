import ExpoModulesCore
import UIKit
import UserNotifications

/// Asks iOS for extra running time while a chat answer streams, so switching
/// apps for a moment does not cut the connection. iOS grants about 30 seconds
/// and calls the expiration handler before suspending; the JS side then picks
/// the finished answer up from the server when the app comes back.
///
/// It also posts "Your answer is ready" when an answer finishes in the
/// background (notify), once the user has allowed notifications.
public class KwalaBackgroundModule: Module {
  private let lock = NSLock()
  private var tasks: [Int: UIBackgroundTaskIdentifier] = [:]
  private var next = 0

  public func definition() -> ModuleDefinition {
    Name("KwalaBackground")

    // Returns a handle for end(); -1 when iOS refuses (no time left).
    Function("begin") { (name: String) -> Int in
      self.lock.lock()
      self.next += 1
      let handle = self.next
      self.lock.unlock()
      var task: UIBackgroundTaskIdentifier = .invalid
      task = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
        self?.end(handle)
      }
      if task == .invalid { return -1 }
      self.lock.lock()
      self.tasks[handle] = task
      self.lock.unlock()
      return handle
    }

    Function("end") { (handle: Int) in
      self.end(handle)
    }

    // Shows the system prompt the first time; afterwards resolves with the saved choice.
    AsyncFunction("requestNotifications") { (promise: Promise) in
      UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, _ in
        promise.resolve(granted)
      }
    }

    Function("notify") { (title: String, body: String) in
      let center = UNUserNotificationCenter.current()
      center.getNotificationSettings { settings in
        guard [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus) else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.threadIdentifier = "kwala-answers"
        center.add(UNNotificationRequest(identifier: "kwala-answer-\(UUID().uuidString)", content: content, trigger: nil))
      }
    }
  }

  private func end(_ handle: Int) {
    lock.lock()
    let task = tasks.removeValue(forKey: handle)
    lock.unlock()
    if let task = task, task != .invalid {
      UIApplication.shared.endBackgroundTask(task)
    }
  }
}
