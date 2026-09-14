import Foundation
import Capacitor
import StoreKit

// Bridge nativo StoreKit 2 para Core C12 Pro: compra unica (non-consumable)
// sin backend propio. JS -> Swift -> StoreKit 2 via Capacitor 8, consumido
// exclusivamente por src/platform/purchases.js. Ver
// docs/architecture/STOREKIT2_SPIKE.md para el contexto de diseño y las
// decisiones ya validadas (viabilidad on-device, seguridad verified-only).
@objc(CoreC12PurchasesPlugin)
public class CoreC12PurchasesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CoreC12PurchasesPlugin"
    public let jsName = "CoreC12Purchases"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getEntitlement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise)
    ]

    private let proProductID = "com.andaralab.corec12.pro"

    @objc func getProduct(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await Product.products(for: [proProductID])
                guard let product = products.first else {
                    call.reject("Producto no disponible", "PRODUCT_UNAVAILABLE")
                    return
                }
                call.resolve([
                    "id": product.id,
                    "displayName": product.displayName,
                    "description": product.description,
                    "displayPrice": product.displayPrice
                ])
            } catch {
                call.reject("Error obteniendo producto: \(error.localizedDescription)", "PRODUCT_FETCH_ERROR")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await Product.products(for: [proProductID])
                guard let product = products.first else {
                    call.reject("Producto no disponible", "PRODUCT_UNAVAILABLE")
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        await transaction.finish()
                        call.resolve([
                            "status": "verified",
                            "transactionId": String(transaction.id),
                            "isPro": true
                        ])
                    case .unverified(_, let error):
                        call.resolve([
                            "status": "unverified",
                            "isPro": false,
                            "error": error.localizedDescription
                        ])
                    }
                case .userCancelled:
                    call.resolve([
                        "status": "cancelled",
                        "isPro": false
                    ])
                case .pending:
                    call.resolve([
                        "status": "pending",
                        "isPro": false
                    ])
                @unknown default:
                    call.resolve([
                        "status": "unknown",
                        "isPro": false
                    ])
                }
            } catch {
                call.reject("Error de compra: \(error.localizedDescription)", "PURCHASE_ERROR")
            }
        }
    }

    @objc func getEntitlement(_ call: CAPPluginCall) {
        Task {
            for await result in Transaction.currentEntitlements {
                if case .verified(let transaction) = result, transaction.productID == proProductID {
                    call.resolve([
                        "isPro": true,
                        "transactionId": String(transaction.id)
                    ])
                    return
                }
            }
            call.resolve([
                "isPro": false
            ])
        }
    }

    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                for await result in Transaction.currentEntitlements {
                    if case .verified(let transaction) = result, transaction.productID == proProductID {
                        call.resolve([
                            "isPro": true,
                            "transactionId": String(transaction.id)
                        ])
                        return
                    }
                }
                call.resolve([
                    "isPro": false
                ])
            } catch {
                call.reject("Error al restaurar: \(error.localizedDescription)", "RESTORE_ERROR")
            }
        }
    }
}
