import Foundation
import UserNotifications
import FirebaseMessaging

final class NotificationService: UNNotificationServiceExtension {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestAttemptContent: UNMutableNotificationContent?
    private var hasDeliveredContent = false

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler

        guard let mutableContent = request.content.mutableCopy() as? UNMutableNotificationContent else {
            NSLog("[NotificationService] Failed to copy notification content")
            contentHandler(request.content)
            return
        }

        bestAttemptContent = mutableContent

        // Сначала даем Firebase Messaging возможность автоматически прикрепить rich image.
        Messaging.serviceExtension().populateNotificationContent(mutableContent) { [weak self] content in
            guard let self else { return }

            let resolvedContent = (content.mutableCopy() as? UNMutableNotificationContent) ?? mutableContent
            self.bestAttemptContent = resolvedContent

            if !resolvedContent.attachments.isEmpty {
                self.deliver(content: resolvedContent, reason: "firebase_helper")
                return
            }

            self.attachImageFromFallbackIfNeeded(to: resolvedContent)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        if let content = bestAttemptContent {
            deliver(content: content, reason: "time_will_expire")
        }
    }

    private func attachImageFromFallbackIfNeeded(to content: UNMutableNotificationContent) {
        guard let imageURL = resolveFallbackImageURL(from: content.userInfo) else {
            deliver(content: content, reason: "no_fallback_url")
            return
        }

        downloadAttachment(from: imageURL) { [weak self] attachment in
            guard let self else { return }

            if let attachment {
                content.attachments = [attachment]
                self.deliver(content: content, reason: "fallback_attachment")
                return
            }

            self.deliver(content: content, reason: "fallback_download_failed")
        }
    }

    private func resolveFallbackImageURL(from userInfo: [AnyHashable: Any]) -> URL? {
        let keys = ["imageUrl", "image"]

        for key in keys {
            guard let rawValue = userInfo[key] as? String else { continue }
            let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, let url = URL(string: trimmed) else { continue }
            guard url.scheme?.lowercased() == "https" else { continue }
            return url
        }

        return nil
    }

    private func downloadAttachment(
        from url: URL,
        completion: @escaping (UNNotificationAttachment?) -> Void
    ) {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 8
        config.timeoutIntervalForResource = 12
        let session = URLSession(configuration: config)

        let task = session.downloadTask(with: url) { temporaryURL, response, error in
            if let error {
                NSLog("[NotificationService] Fallback image download error: \(error.localizedDescription)")
                completion(nil)
                return
            }

            guard let temporaryURL else {
                NSLog("[NotificationService] Fallback image temp URL is nil")
                completion(nil)
                return
            }

            let fileExtension = self.resolveFileExtension(for: response, from: url)
            let localURL = URL(fileURLWithPath: NSTemporaryDirectory())
                .appendingPathComponent(UUID().uuidString)
                .appendingPathExtension(fileExtension)

            do {
                let fileManager = FileManager.default
                if fileManager.fileExists(atPath: localURL.path) {
                    try fileManager.removeItem(at: localURL)
                }

                try fileManager.moveItem(at: temporaryURL, to: localURL)
                let attachment = try UNNotificationAttachment(
                    identifier: "mentala_fallback_image",
                    url: localURL,
                    options: nil
                )
                completion(attachment)
            } catch {
                NSLog("[NotificationService] Failed to build fallback attachment: \(error.localizedDescription)")
                completion(nil)
            }
        }

        task.resume()
    }

    private func resolveFileExtension(for response: URLResponse?, from url: URL) -> String {
        let urlExtension = url.pathExtension.lowercased()
        if !urlExtension.isEmpty {
            return urlExtension
        }

        if let mime = response?.mimeType?.lowercased() {
            if mime.contains("png") { return "png" }
            if mime.contains("jpeg") || mime.contains("jpg") { return "jpg" }
        }

        return "jpg"
    }

    private func deliver(content: UNNotificationContent, reason: String) {
        guard !hasDeliveredContent else { return }
        hasDeliveredContent = true
        NSLog("[NotificationService] Deliver content (\(reason))")
        contentHandler?(content)
    }
}
