import ExpoModulesCore
import UIKit

/// Asks iOS for extra running time while a chat answer streams, so switching
/// apps for a moment does not cut the connection. iOS grants about 30 seconds
/// and calls the expiration handler before suspending; the JS side then picks
/// the finished answer up from the server when the app comes back.
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
