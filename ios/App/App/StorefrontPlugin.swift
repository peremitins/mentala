import Foundation
import Capacitor
import StoreKit
import os.log

// Плагин для получения Storefront (регион App Store аккаунта пользователя).
// Приоритет: UserDefaults override → StoreKit 2 → StoreKit 1 → locale устройства.
// UserDefaults override доступен в TestFlight и DEBUG — устанавливается через URL scheme
// mentala://debug/storefront?code=RU (сбросить: mentala://debug/storefront?reset)
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

    // Alpha-3 → Alpha-2 маппинг для StoreKit storefront кодов.
    // StoreKit 2 Storefront.countryCode возвращает ISO 3166-1 alpha-3 (RUS, USA, DEU, ...).
    private static let alpha3ToAlpha2: [String: String] = [
        "RUS": "RU", "USA": "US", "GBR": "GB", "DEU": "DE", "FRA": "FR",
        "JPN": "JP", "CHN": "CN", "KOR": "KR", "BRA": "BR", "IND": "IN",
        "CAN": "CA", "AUS": "AU", "ITA": "IT", "ESP": "ES", "NLD": "NL",
        "TUR": "TR", "MEX": "MX", "IDN": "ID", "POL": "PL", "SWE": "SE",
        "NOR": "NO", "DNK": "DK", "FIN": "FI", "AUT": "AT", "CHE": "CH",
        "BEL": "BE", "PRT": "PT", "CZE": "CZ", "GRC": "GR", "ISR": "IL",
        "SGP": "SG", "HKG": "HK", "TWN": "TW", "THA": "TH", "MYS": "MY",
        "PHL": "PH", "VNM": "VN", "ARE": "AE", "SAU": "SA", "EGY": "EG",
        "ZAF": "ZA", "NGA": "NG", "COL": "CO", "ARG": "AR", "CHL": "CL",
        "PER": "PE", "UKR": "UA", "ROU": "RO", "HUN": "HU", "KAZ": "KZ",
    ]

    // Ключ UserDefaults для override storefront (доступен в TestFlight и DEBUG).
    // Устанавливается через URL scheme: mentala://debug/storefront?code=RU
    // Сбрасывается через: mentala://debug/storefront?reset
    static let storefrontOverrideKey = "mentala.debug.storefront_override"

    // Определяем TestFlight: sandboxReceipt присутствует только в TestFlight-сборках.
    private var isTestFlightBuild: Bool {
        Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt"
    }

    @objc func getStorefrontCountryCode(_ call: CAPPluginCall) {
        let log = OSLog(subsystem: Bundle.main.bundleIdentifier ?? "mentala", category: "Storefront")

        // Override через UserDefaults — доступен в DEBUG и TestFlight (не в App Store production).
        // Приоритет выше StoreKit, чтобы можно было тестировать RU/WW flow на любом устройстве.
        #if DEBUG
        let allowOverride = true
        #else
        let allowOverride = isTestFlightBuild
        #endif

        if allowOverride {
            let overrideRaw = (UserDefaults.standard.string(forKey: StorefrontPlugin.storefrontOverrideKey) ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .uppercased()
            if !overrideRaw.isEmpty {
                if overrideRaw == "NONE" || overrideRaw == "NULL" || overrideRaw == "UNKNOWN" {
                    os_log("[Storefront] UserDefaults override → null", log: log, type: .debug)
                    call.resolve(["countryCode": NSNull()])
                    return
                }
                if overrideRaw.range(of: #"^[A-Z]{2,3}$"#, options: .regularExpression) != nil {
                    let normalized = normalizeCountryCode(overrideRaw)
                    os_log("[Storefront] UserDefaults override → %{public}@", log: log, type: .debug, normalized)
                    call.resolve(["countryCode": normalized])
                    return
                }
            }
        }

        if #available(iOS 15.0, *) {
            Task { [weak self] in
                guard let self else {
                    call.resolve(["countryCode": NSNull()])
                    return
                }

                // 1. StoreKit 2 storefront (основной источник).
                if let storefront = await Storefront.current {
                    let normalized = self.normalizeCountryCode(storefront.countryCode)
                    os_log("[Storefront] SK2 countryCode=%{public}@ normalized=%{public}@", log: log, type: .info, storefront.countryCode, normalized)
                    if !normalized.isEmpty {
                        call.resolve(["countryCode": normalized])
                        return
                    }
                } else {
                    os_log("[Storefront] SK2 Storefront.current=nil", log: log, type: .info)
                }

                // 2. StoreKit 1 fallback.
                let sk1Fallback = self.resolveStorefrontFromSkPaymentQueue()
                os_log("[Storefront] SK1 fallback=%{public}@", log: log, type: .info, sk1Fallback.isEmpty ? "nil" : sk1Fallback)
                if !sk1Fallback.isEmpty {
                    call.resolve(["countryCode": sk1Fallback])
                    return
                }

                // 3. Locale устройства — последний fallback.
                // Используется когда Apple заблокировал StoreKit для региона (например, Россия).
                // Не идеально (locale ≠ App Store регион), но лучше чем nil.
                let localeFallback = self.resolveRegionFromDeviceLocale()
                os_log("[Storefront] locale fallback=%{public}@", log: log, type: .info, localeFallback.isEmpty ? "nil" : localeFallback)
                if !localeFallback.isEmpty {
                    call.resolve(["countryCode": localeFallback])
                    return
                }

                os_log("[Storefront] all sources returned nil", log: log, type: .error)
                call.resolve(["countryCode": NSNull()])
            }
            return
        }

        // iOS 13-14 path.
        let fallback = resolveStorefrontFromSkPaymentQueue()
        os_log("[Storefront] iOS13 SK1=%{public}@", log: log, type: .info, fallback.isEmpty ? "nil" : fallback)
        if !fallback.isEmpty {
            call.resolve(["countryCode": fallback])
            return
        }

        let localeFallback = resolveRegionFromDeviceLocale()
        os_log("[Storefront] iOS13 locale=%{public}@", log: log, type: .info, localeFallback.isEmpty ? "nil" : localeFallback)
        if !localeFallback.isEmpty {
            call.resolve(["countryCode": localeFallback])
            return
        }

        os_log("[Storefront] iOS13 all sources nil", log: log, type: .error)
        call.resolve(["countryCode": NSNull()])
    }

    private func resolveStorefrontFromSkPaymentQueue() -> String {
        guard #available(iOS 13.0, *) else {
            return ""
        }

        let countryCode = SKPaymentQueue.default().storefront?.countryCode
        return normalizeCountryCode(countryCode)
    }

    /// Возвращает alpha-2 код региона из Locale устройства.
    private func resolveRegionFromDeviceLocale() -> String {
        let regionCode: String?
        if #available(iOS 16.0, *) {
            regionCode = Locale.current.region?.identifier
        } else {
            regionCode = Locale.current.regionCode
        }

        let normalized = (regionCode ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()

        guard !normalized.isEmpty else { return "" }

        // Locale регион обычно alpha-2, но на всякий случай нормализуем.
        if normalized.count == 2 {
            return normalized
        }
        if normalized.count == 3, let alpha2 = StorefrontPlugin.alpha3ToAlpha2[normalized] {
            return alpha2
        }
        return ""
    }

    /// Нормализует country code: alpha-3 → alpha-2, uppercase.
    private func normalizeCountryCode(_ value: String?) -> String {
        let normalized = (value ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()

        guard !normalized.isEmpty else { return "" }

        // Если уже alpha-2 — возвращаем как есть.
        if normalized.count == 2 {
            return normalized
        }

        // Alpha-3 → alpha-2.
        if normalized.count == 3, let alpha2 = StorefrontPlugin.alpha3ToAlpha2[normalized] {
            return alpha2
        }

        // Неизвестный формат — возвращаем как есть (лучше что-то, чем ничего).
        return normalized
    }
}
