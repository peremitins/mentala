import Foundation
import Capacitor
import UIKit

@objc(ExternalBrowserPlugin)
public class ExternalBrowserPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ExternalBrowserPlugin"
    public let jsName = "ExternalBrowser"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    @objc func open(_ call: CAPPluginCall) {
        let rawUrl = call.getString("url")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        guard !rawUrl.isEmpty, let url = URL(string: rawUrl) else {
            call.reject("URL is required", "INVALID_URL")
            return
        }

        guard let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http" else {
            call.reject("Only http/https URLs are supported", "INVALID_URL_SCHEME")
            return
        }

        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { success in
                if success {
                    call.resolve()
                } else {
                    call.reject("Failed to open URL in external browser", "OPEN_FAILED")
                }
            }
        }
    }
}

// Кастомный Bridge ViewController нужен, чтобы зарегистрировать локальные плагины,
// которые не поставляются как отдельные Capacitor-пакеты.
class MainViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()

        // Регистрируем StorefrontPlugin для JS-слоя.
        bridge?.registerPluginInstance(StorefrontPlugin())
        // Регистрируем AppleIapPlugin (StoreKit 2) для iOS purchase/restore flow.
        bridge?.registerPluginInstance(AppleIapPlugin())
        // Регистрируем iOS-only bridge для гарантированного открытия ссылок в Safari.
        bridge?.registerPluginInstance(ExternalBrowserPlugin())
        // Регистрируем realtime voice audio bridge для duplex AVAudioSession.
        bridge?.registerPluginInstance(MentalaRealtimeVoiceAudioPlugin())
    }
}
