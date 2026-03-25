import Foundation
@preconcurrency import Capacitor
import StoreKit
import UIKit

@objc(AppleIapPlugin)
public class AppleIapPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleIapPlugin"
    public let jsName = "AppleIap"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCurrentEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showManageSubscriptions", returnType: CAPPluginReturnPromise)
    ]

    private var updatesTask: Task<Void, Never>?
    private let iso8601Formatter = ISO8601DateFormatter()

    override public func load() {
        super.load()
        if #available(iOS 15.0, *) {
            startTransactionUpdatesListener()
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            reject(call, code: "STOREKIT_UNAVAILABLE", message: "StoreKit 2 requires iOS 15+")
            return
        }

        let productIds = (call.getArray("productIds") ?? [])
            .compactMap { item -> String? in
                guard let text = item as? String else {
                    return nil
                }

                return text.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            .filter { !$0.isEmpty }

        guard !productIds.isEmpty else {
            reject(call, code: "PRODUCTS_LOAD_FAILED", message: "productIds are required")
            return
        }

        Task {
            do {
                let products = try await Product.products(for: productIds)
                let mappedProducts = products.map { product in
                    serializeProduct(product)
                }

                call.resolve([
                    "products": mappedProducts
                ])
            } catch {
                reject(call, code: "PRODUCTS_LOAD_FAILED", message: "Failed to load App Store products", error: error)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            reject(call, code: "STOREKIT_UNAVAILABLE", message: "StoreKit 2 requires iOS 15+")
            return
        }

        let productId = call.getString("productId")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !productId.isEmpty else {
            reject(call, code: "PRODUCT_NOT_FOUND", message: "productId is required")
            return
        }

        let appAccountTokenRaw = call.getString("appAccountToken")?.trimmingCharacters(in: .whitespacesAndNewlines)

        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    reject(call, code: "PRODUCT_NOT_FOUND", message: "Product is not found in App Store")
                    return
                }

                var purchaseOptions = Set<Product.PurchaseOption>()
                if let tokenRaw = appAccountTokenRaw,
                   !tokenRaw.isEmpty,
                   let token = UUID(uuidString: tokenRaw) {
                    purchaseOptions.insert(.appAccountToken(token))
                }

                let purchaseResult = try await product.purchase(options: purchaseOptions)
                switch purchaseResult {
                case .success(let verificationResult):
                    switch verificationResult {
                    case .verified(let transaction):
                        let signedTransactionInfo = verificationResult.jwsRepresentation
                        let transactionPayload = serializeTransaction(
                            transaction: transaction,
                            signedTransactionInfo: signedTransactionInfo
                        )

                        call.resolve([
                            "transaction": transactionPayload
                        ])
                    case .unverified(_, let error):
                        reject(call, code: "PURCHASE_UNVERIFIED", message: "Unverified transaction", error: error)
                    }
                case .pending:
                    reject(call, code: "PURCHASE_PENDING", message: "Purchase is pending")
                case .userCancelled:
                    reject(call, code: "PURCHASE_CANCELLED", message: "Purchase cancelled by user")
                @unknown default:
                    reject(call, code: "UNKNOWN", message: "Unknown purchase state")
                }
            } catch {
                reject(call, code: "UNKNOWN", message: "Failed to purchase product", error: error)
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            reject(call, code: "STOREKIT_UNAVAILABLE", message: "StoreKit 2 requires iOS 15+")
            return
        }

        Task {
            do {
                try await AppStore.sync()
                let transactions = await collectCurrentEntitlements()

                call.resolve([
                    "transactions": transactions
                ])
            } catch {
                reject(call, code: "SYNC_FAILED", message: "Failed to sync App Store purchases", error: error)
            }
        }
    }

    @objc func getCurrentEntitlements(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            reject(call, code: "STOREKIT_UNAVAILABLE", message: "StoreKit 2 requires iOS 15+")
            return
        }

        Task {
            let transactions = await collectCurrentEntitlements()
            call.resolve([
                "transactions": transactions
            ])
        }
    }

    @objc func finishTransaction(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            reject(call, code: "STOREKIT_UNAVAILABLE", message: "StoreKit 2 requires iOS 15+")
            return
        }

        let transactionId = call.getString("transactionId")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !transactionId.isEmpty else {
            call.resolve()
            return
        }

        Task {
            for await verificationResult in Transaction.unfinished {
                guard case .verified(let transaction) = verificationResult else {
                    continue
                }

                if String(transaction.id) == transactionId {
                    await transaction.finish()
                    call.resolve()
                    return
                }
            }

            // Идемпотентное поведение: если транзакция уже finish() или не найдена — считаем успешным no-op.
            call.resolve()
        }
    }

    @objc func showManageSubscriptions(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            reject(call, code: "STOREKIT_UNAVAILABLE", message: "StoreKit 2 requires iOS 15+")
            return
        }

        Task {
            if #available(iOS 16.0, *) {
                let scene = await MainActor.run { () -> UIWindowScene? in
                    self.bridge?.viewController?.view.window?.windowScene
                }

                if let scene {
                    do {
                        try await AppStore.showManageSubscriptions(in: scene)
                        call.resolve()
                        return
                    } catch {
                        // Fallback ниже на URL-вариант.
                    }
                }
            }

            guard let url = URL(string: "https://apps.apple.com/account/subscriptions") else {
                reject(call, code: "UNKNOWN", message: "Failed to open subscriptions management URL")
                return
            }

            let opened = await openOnMainActor(url: url)
            if opened {
                call.resolve()
            } else {
                self.reject(call, code: "UNKNOWN", message: "Failed to open subscriptions management URL")
            }
        }
    }

    @available(iOS 15.0, *)
    private func startTransactionUpdatesListener() {
        updatesTask?.cancel()

        updatesTask = Task(priority: .background) { [weak self] in
            guard let self else {
                return
            }

            for await verificationResult in Transaction.updates {
                if Task.isCancelled {
                    return
                }

                guard case .verified(let transaction) = verificationResult else {
                    continue
                }

                let signedTransactionInfo = verificationResult.jwsRepresentation
                let payload = self.serializeTransaction(
                    transaction: transaction,
                    signedTransactionInfo: signedTransactionInfo
                )

                await MainActor.run {
                    self.notifyListeners("transactionUpdated", data: [
                        "transaction": payload
                    ])
                }
            }
        }
    }

    @available(iOS 15.0, *)
    private func collectCurrentEntitlements() async -> [[String: Any]] {
        var transactions: [[String: Any]] = []

        for await verificationResult in Transaction.currentEntitlements {
            guard case .verified(let transaction) = verificationResult else {
                continue
            }

            let signedTransactionInfo = verificationResult.jwsRepresentation
            transactions.append(
                serializeTransaction(
                    transaction: transaction,
                    signedTransactionInfo: signedTransactionInfo
                )
            )
        }

        return transactions
    }

    @available(iOS 15.0, *)
    private func serializeProduct(_ product: Product) -> [String: Any] {
        var billingPeriod: String?

        if let subscription = product.subscription {
            switch subscription.subscriptionPeriod.unit {
            case .month:
                billingPeriod = "month"
            case .year:
                billingPeriod = "year"
            default:
                billingPeriod = nil
            }
        }

        var currencyCode: Any = NSNull()
        if #available(iOS 16.0, *) {
            let code = product.priceFormatStyle.currencyCode
            if !code.isEmpty {
                currencyCode = code
            }
        }

        return [
            "productId": product.id,
            "title": product.displayName,
            "description": product.description,
            "displayPrice": product.displayPrice,
            "currencyCode": currencyCode,
            "billingPeriod": billingPeriod ?? NSNull()
        ]
    }

    @available(iOS 15.0, *)
    private func serializeTransaction(
        transaction: Transaction,
        signedTransactionInfo: String
    ) -> [String: Any] {
        let payload = decodeJwsPayload(signedTransactionInfo)

        let environmentRaw = payloadString(payload["environment"])?.lowercased()
        let environment = environmentRaw?.contains("sandbox") == true ? "sandbox" : "production"

        let storefrontRaw = payloadString(payload["storefront"])?.uppercased()
        let storefront: Any = {
            guard let storefrontRaw,
                  storefrontRaw.range(of: "^[A-Z]{2}$", options: .regularExpression) != nil else {
                return NSNull()
            }
            return storefrontRaw
        }()

        let appAccountTokenFromPayload = payloadString(payload["appAccountToken"])?.lowercased()
        let appAccountTokenFromTransaction = transaction.appAccountToken?.uuidString.lowercased()
        let appAccountToken: Any
        if let token = appAccountTokenFromTransaction ?? appAccountTokenFromPayload {
            appAccountToken = token
        } else {
            appAccountToken = NSNull()
        }

        let isUpgraded = (payload["isUpgraded"] as? Bool) ?? false

        return [
            "transactionId": String(transaction.id),
            "originalTransactionId": String(transaction.originalID),
            "productId": transaction.productID,
            "signedTransactionInfo": signedTransactionInfo,
            "environment": environment,
            "purchaseDate": isoString(transaction.purchaseDate),
            "expiresDate": transaction.expirationDate != nil ? isoString(transaction.expirationDate!) : NSNull(),
            "storefront": storefront,
            "isUpgraded": isUpgraded,
            "appAccountToken": appAccountToken
        ]
    }

    private func decodeJwsPayload(_ jws: String) -> [String: Any] {
        let parts = jws.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3 else {
            return [:]
        }

        let payloadPart = String(parts[1])
        guard let payloadData = base64UrlDecode(payloadPart) else {
            return [:]
        }

        do {
            let object = try JSONSerialization.jsonObject(with: payloadData)
            return object as? [String: Any] ?? [:]
        } catch {
            return [:]
        }
    }

    private func base64UrlDecode(_ value: String) -> Data? {
        var base64 = value
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")

        let remainder = base64.count % 4
        if remainder != 0 {
            base64 += String(repeating: "=", count: 4 - remainder)
        }

        return Data(base64Encoded: base64)
    }

    @MainActor
    private func openOnMainActor(url: URL) async -> Bool {
        return await withCheckedContinuation { continuation in
            UIApplication.shared.open(url) { success in
                continuation.resume(returning: success)
            }
        }
    }

    private func payloadString(_ value: Any?) -> String? {
        guard let text = value as? String else {
            return nil
        }

        let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized.isEmpty ? nil : normalized
    }

    private func isoString(_ date: Date) -> String {
        return iso8601Formatter.string(from: date)
    }

    private func reject(
        _ call: CAPPluginCall,
        code: String,
        message: String,
        error: Error? = nil
    ) {
        if let error {
            call.reject(message, code, error)
            return
        }

        call.reject(message, code)
    }
}
