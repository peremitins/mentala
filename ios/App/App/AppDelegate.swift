import UIKit
import AVFoundation
import Capacitor
#if canImport(GoogleSignIn)
import GoogleSignIn
#endif

// Some Capacitor versions do not expose a typed Notification.Name for remote notifications.
// Define it locally to keep the integration compiling and consistent.
extension Notification.Name {
    static let capacitorDidReceiveRemoteNotification = Notification.Name("CapacitorDidReceiveRemoteNotification")
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    private var audioSessionObserversInstalled = false
    // Preferences на iOS хранит ключи с префиксом "CapacitorStorage."
    // (см. @capacitor/preferences). Без этого JS-слой не прочитает payload.
    private let pushLaunchPayloadKey = "CapacitorStorage.mentai.push.launchPayload"
    private let pushSignalKeys: Set<String> = [
        "google.message_id",
        "deepLink",
        "navigation",
        "navType",
        "navId",
        "action",
        "trackId",
        "practiceId",
        "slotId"
    ]

    private func persistPushLaunchPayload(_ userInfo: [AnyHashable: Any], reason: String) {
        var payload: [String: Any] = [:]
        for (key, value) in userInfo {
            let normalizedKey = String(describing: key)
            payload[normalizedKey] = String(describing: value)
        }

        let hasPushSignal = payload.keys.contains { pushSignalKeys.contains($0) }
        if !hasPushSignal { return }

        payload["createdAt"] = Int(Date().timeIntervalSince1970 * 1000)

        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
              let raw = String(data: data, encoding: .utf8) else {
            return
        }

        UserDefaults.standard.set(raw, forKey: pushLaunchPayloadKey)
        #if DEBUG
        print("[PushLaunch] persisted payload (\(reason))")
        #endif
    }

    /**
     * Фиксируем iOS audio session в playback-режиме, чтобы WebAudio
     * не уходил в mute при hardware silent switch и чтобы фон работал стабильно.
     */
    private func configurePlaybackAudioSession(reason: String) {
        do {
            let session = AVAudioSession.sharedInstance()

            // Не перезаписываем категорию, если сейчас активна запись (speech recognition, микрофон).
            // Иначе при закрытии системного диалога разрешений (didBecomeActive) сбрасываем .playAndRecord
            // обратно в .playback — микрофон пропадает, и пользователь получает ошибку «режим недоступен».
            let currentCategory = session.category
            if currentCategory == .playAndRecord || currentCategory == .record {
                #if DEBUG
                print("[AudioSession] skipped (\(reason)): recording is active (category=\(currentCategory.rawValue))")
                #endif
                return
            }

            // Playback: играет даже при hardware silent switch.
            // Добавляем bluetooth/airplay, чтобы не ломать маршруты вывода.
            try session.setCategory(.playback, mode: .default, options: [.allowBluetoothA2DP, .allowAirPlay])

            // Предпочитаемые параметры. Это снижает шанс «первый старт тихий/молчание»
            // в WKWebView/WebAudio на некоторых iPhone.
            try session.setPreferredSampleRate(48_000)
            try session.setPreferredIOBufferDuration(0.005)

            // Делаем сессию активной. Если она уже активна, iOS просто подтвердит состояние.
            try session.setActive(true, options: [])

            #if DEBUG
            print("[AudioSession] configured (\(reason)) category=playback active=true sampleRate=\(session.sampleRate)")
            #endif
        } catch {
            #if DEBUG
            print("[AudioSession] failed to configure (\(reason)): \(error.localizedDescription)")
            #endif
        }
    }

    private func installAudioSessionObserversIfNeeded() {
        if audioSessionObserversInstalled { return }
        audioSessionObserversInstalled = true

        let center = NotificationCenter.default

        // Interruption: звонок, Siri, AirPods подключение, и прочие системные события.
        center.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self = self else { return }
            guard
                let userInfo = notification.userInfo,
                let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
                let type = AVAudioSession.InterruptionType(rawValue: typeValue)
            else {
                return
            }

            switch type {
            case .began:
                #if DEBUG
                print("[AudioSession] interruption began")
                #endif

            case .ended:
                let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt
                let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue ?? 0)
                #if DEBUG
                print("[AudioSession] interruption ended, shouldResume=\(options.contains(.shouldResume))")
                #endif

                // После interruption часто нужно повторно активировать.
                self.configurePlaybackAudioSession(reason: "interruptionEnded")
            @unknown default:
                self.configurePlaybackAudioSession(reason: "interruptionUnknown")
            }
        }

        // Route change: смена вывода (динамик/наушники/bluetooth).
        center.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self = self else { return }
            let reasonValue = (notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) ?? 0
            #if DEBUG
            print("[AudioSession] route changed: \(reasonValue)")
            #endif

            // Не переопределяем на playback при categoryChange (rawValue 3) — speech recognition ставит playAndRecord,
            // иначе получаем конфликт: 0 Hz, error -50, IsFormatSampleRateAndChannelCountValid.
            if reasonValue == AVAudioSession.RouteChangeReason.categoryChange.rawValue {
                return
            }

            // После смены маршрута (наушники, bluetooth и т.д.) иногда «падает» WebAudio звук в фоне.
            self.configurePlaybackAudioSession(reason: "routeChange")
        }
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Настраиваем аудиосессию сразу при запуске приложения.
        configurePlaybackAudioSession(reason: "didFinishLaunching")
        installAudioSessionObserversIfNeeded()
        if let remotePayload = launchOptions?[.remoteNotification] as? [AnyHashable: Any] {
            persistPushLaunchPayload(remotePayload, reason: "launchOptions")
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Перед уходом из active iOS иногда «перекидывает» аудиосессию.
        // Подстрахуемся, чтобы фон продолжал играть стабильно.
        configurePlaybackAudioSession(reason: "willResignActive")
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // В фоне гарантируем активную playback-сессию.
        configurePlaybackAudioSession(reason: "didEnterBackground")
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Перед возвратом в foreground поднимаем сессию заранее.
        configurePlaybackAudioSession(reason: "willEnterForeground")
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // После возврата в foreground повторно активируем playback-сессию.
        configurePlaybackAudioSession(reason: "didBecomeActive")
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    /**
     * Пробрасываем APNs device token в Capacitor NotificationCenter.
     * Без этого Capacitor PushNotifications и FCM-плагин на iOS не получат токен.
     */
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    /**
     * Пробрасываем ошибку регистрации remote notifications в Capacitor.
     */
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Debug/TestFlight: mentala://debug/storefront?code=RU  → force RU flow
        //                   mentala://debug/storefront?reset    → clear override
        if handleStorefrontDebugURL(url) {
            return true
        }

        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        #if canImport(GoogleSignIn)
        // Обязательно для возврата из Safari/Google app в приложение после OAuth.
        if GIDSignIn.sharedInstance.handle(url) {
            return true
        }
        #endif
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    /// Обрабатывает URL-scheme override для storefront (TestFlight + DEBUG only).
    /// mentala://debug/storefront?code=RU  — установить код страны
    /// mentala://debug/storefront?reset    — сбросить override
    @discardableResult
    private func handleStorefrontDebugURL(_ url: URL) -> Bool {
        // Только DEBUG и TestFlight сборки.
        #if !DEBUG
        let isTestFlight = Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt"
        guard isTestFlight else { return false }
        #endif

        guard url.scheme?.lowercased() == "mentala",
              url.host?.lowercased() == "debug",
              url.path.lowercased() == "/storefront" else {
            return false
        }

        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let queryItems = components?.queryItems ?? []

        if queryItems.contains(where: { $0.name == "reset" }) {
            UserDefaults.standard.removeObject(forKey: StorefrontPlugin.storefrontOverrideKey)
            showStorefrontOverrideAlert(message: "Storefront override сброшен. Будет использован реальный StoreKit.")
            return true
        }

        if let codeItem = queryItems.first(where: { $0.name == "code" }),
           let code = codeItem.value, !code.isEmpty {
            let normalized = code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
            UserDefaults.standard.set(normalized, forKey: StorefrontPlugin.storefrontOverrideKey)
            showStorefrontOverrideAlert(message: "Storefront override установлен: \(normalized)")
            return true
        }

        return false
    }

    private func showStorefrontOverrideAlert(message: String) {
        DispatchQueue.main.async {
            guard let rootVC = self.window?.rootViewController else { return }
            let alert = UIAlertController(title: "Storefront Debug", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default))
            rootVC.present(alert, animated: true)
        }
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func application(_ application: UIApplication,
                     didReceiveRemoteNotification userInfo: [AnyHashable: Any],
                     fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        persistPushLaunchPayload(userInfo, reason: "didReceiveRemoteNotification")

        // Forward to Capacitor. This proxy method does not accept a fetchCompletionHandler.
        NotificationCenter.default.post(name: .capacitorDidReceiveRemoteNotification, object: userInfo)

        // Always finish the background fetch callback.
        completionHandler(.newData)
    }

}
