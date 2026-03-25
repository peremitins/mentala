import Foundation
import Capacitor
import StoreKit

// Плагин для получения Storefront (регион App Store аккаунта пользователя).
// Важно: мы определяем не геолокацию и не локаль устройства, а именно Storefront.
@objc(StorefrontPlugin)
public class StorefrontPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StorefrontPlugin"
    public let jsName = "Storefront"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(
            name: "getStorefrontCountryCode",
            returnType: CAPPluginReturnPromise
        )
    ]

    @objc func getStorefrontCountryCode(_ call: CAPPluginCall) {
        #if DEBUG
        // Dev-only override: позволяет тестировать RU/WW flow без смены Apple ID региона.
        // Использование: добавь env var в Xcode Scheme -> Run -> Arguments:
        // - MENTALA_STOREFRONT_OVERRIDE=RU|DE|...
        // - MENTALA_STOREFRONT_OVERRIDE=NONE (вернёт null)
        let overrideRaw = (ProcessInfo.processInfo.environment["MENTALA_STOREFRONT_OVERRIDE"] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
        if !overrideRaw.isEmpty {
            if overrideRaw == "NONE" || overrideRaw == "NULL" || overrideRaw == "UNKNOWN" {
                call.resolve(["countryCode": NSNull()])
                return
            }

            // StoreKit storefront = 2-буквенный country code (RU, DE, NL, ...).
            if overrideRaw.range(of: #"^[A-Z]{2}$"#, options: .regularExpression) != nil {
                call.resolve(["countryCode": overrideRaw])
                return
            }
        }
        #endif

        // Приоритет: StoreKit 2 storefront (iOS 15+), т.к. это основной стек проекта.
        if #available(iOS 15.0, *) {
            Task { [weak self] in
                guard let self else {
                    call.resolve(["countryCode": NSNull()])
                    return
                }

                if let storefront = await Storefront.current {
                    let normalized = self.normalizeCountryCode(storefront.countryCode)
                    if !normalized.isEmpty {
                        call.resolve(["countryCode": normalized])
                        return
                    }
                }

                // Fallback на StoreKit 1, если SK2 storefront не дал значения.
                let fallback = self.resolveStorefrontFromSkPaymentQueue()
                if fallback.isEmpty {
                    call.resolve(["countryCode": NSNull()])
                } else {
                    call.resolve(["countryCode": fallback])
                }
            }
            return
        }

        // Fallback для iOS 13-14.
        let fallback = resolveStorefrontFromSkPaymentQueue()
        if fallback.isEmpty {
            call.resolve(["countryCode": NSNull()])
            return
        }

        call.resolve(["countryCode": fallback])
    }

    private func resolveStorefrontFromSkPaymentQueue() -> String {
        guard #available(iOS 13.0, *) else {
            return ""
        }

        let countryCode = SKPaymentQueue.default().storefront?.countryCode
        return normalizeCountryCode(countryCode)
    }

    private func normalizeCountryCode(_ value: String?) -> String {
        let normalized = (value ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
        return normalized
    }
}
