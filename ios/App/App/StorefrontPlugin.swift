import Foundation
import Capacitor
import StoreKit

// Плагин для получения Storefront (регион App Store аккаунта пользователя).
// Приоритет: StoreKit 2 → StoreKit 1 → locale устройства (fallback для регионов,
// где Apple заблокировал in-app purchases и Storefront.current возвращает nil).
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

    @objc func getStorefrontCountryCode(_ call: CAPPluginCall) {
        #if DEBUG
        // Dev-only override: позволяет тестировать RU/WW flow без смены Apple ID региона.
        let overrideRaw = (ProcessInfo.processInfo.environment["MENTALA_STOREFRONT_OVERRIDE"] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
        if !overrideRaw.isEmpty {
            if overrideRaw == "NONE" || overrideRaw == "NULL" || overrideRaw == "UNKNOWN" {
                call.resolve(["countryCode": NSNull()])
                return
            }

            if overrideRaw.range(of: #"^[A-Z]{2,3}$"#, options: .regularExpression) != nil {
                call.resolve(["countryCode": normalizeCountryCode(overrideRaw)])
                return
            }
        }
        #endif

        if #available(iOS 15.0, *) {
            Task { [weak self] in
                guard let self else {
                    call.resolve(["countryCode": NSNull()])
                    return
                }

                // 1. StoreKit 2 storefront (основной источник).
                if let storefront = await Storefront.current {
                    let normalized = self.normalizeCountryCode(storefront.countryCode)
                    if !normalized.isEmpty {
                        call.resolve(["countryCode": normalized])
                        return
                    }
                }

                // 2. StoreKit 1 fallback.
                let sk1Fallback = self.resolveStorefrontFromSkPaymentQueue()
                if !sk1Fallback.isEmpty {
                    call.resolve(["countryCode": sk1Fallback])
                    return
                }

                // 3. Locale устройства — последний fallback.
                // Используется когда Apple заблокировал StoreKit для региона (например, Россия).
                // Не идеально (locale ≠ App Store регион), но лучше чем nil.
                let localeFallback = self.resolveRegionFromDeviceLocale()
                if !localeFallback.isEmpty {
                    call.resolve(["countryCode": localeFallback])
                    return
                }

                call.resolve(["countryCode": NSNull()])
            }
            return
        }

        // iOS 13-14 path.
        let fallback = resolveStorefrontFromSkPaymentQueue()
        if !fallback.isEmpty {
            call.resolve(["countryCode": fallback])
            return
        }

        let localeFallback = resolveRegionFromDeviceLocale()
        if !localeFallback.isEmpty {
            call.resolve(["countryCode": localeFallback])
            return
        }

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
