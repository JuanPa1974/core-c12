import Foundation
import Capacitor
import StoreKit
#if DEBUG
import StoreKitTest
#endif

// SPIKE — StoreKit 2 technical spike (rama feature/core-c12-pro-iap).
// Bridge nativo mínimo entre JavaScript y StoreKit 2 para demostrar
// viabilidad de compras non-consumable sin backend. NO es la
// arquitectura definitiva de monetización — Core C12 Pro completo se
// diseñará en src/platform/purchases.js + src/state/entitlement-state.js
// solo si este spike confirma que StoreKit 2 on-device es suficiente.
//
// En Debug, activa una SKTestSession apuntando a Configuration.storekit
// para poder ejercitar todo el flujo (compra, restore, reembolso
// simulado) sin Apple Developer Program ni App Store Connect, tanto
// desde Xcode como desde `xcrun simctl launch` (SKTestSession no
// depende de que el esquema de Xcode tenga seleccionado un StoreKit
// Configuration file — se activa por código).
@objc(CoreC12PurchasesPlugin)
public class CoreC12PurchasesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CoreC12PurchasesPlugin"
    public let jsName = "CoreC12Purchases"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getEntitlement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "simulateRefund", returnType: CAPPluginReturnPromise)
    ]

    private let proProductID = "com.andaralab.corec12.pro"
    private var lastTransactionID: UInt64?

    #if DEBUG
    private var testSession: SKTestSession?
    #endif

    @objc override public func load() {
        #if DEBUG
        do {
            let session = try SKTestSession(configurationFileNamed: "Configuration")
            session.disableDialogs = false
            self.testSession = session
        } catch {
            print("CoreC12Purchases SPIKE: no se pudo iniciar SKTestSession — \(error)")
        }
        #endif
    }

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
                        self.lastTransactionID = transaction.id
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
                    self.lastTransactionID = transaction.id
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
                        self.lastTransactionID = transaction.id
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

    // SOLO SPIKE / DEBUG — simula un reembolso de la última transacción
    // conocida usando StoreKit Testing. No existe equivalente en
    // producción: en la app real, un reembolso lo procesa Apple y
    // StoreKit 2 lo refleja automáticamente en Transaction.currentEntitlements.
    @objc func simulateRefund(_ call: CAPPluginCall) {
        #if DEBUG
        guard let session = self.testSession else {
            call.reject("Sesión de StoreKit Testing no disponible", "NO_TEST_SESSION")
            return
        }
        guard let transactionId = self.lastTransactionID else {
            call.reject("No hay transacción reciente para reembolsar", "NO_TRANSACTION")
            return
        }
        do {
            try session.refundTransaction(identifier: Int(transactionId))
            call.resolve(["status": "refunded"])
        } catch {
            call.reject("Error simulando reembolso: \(error.localizedDescription)", "REFUND_ERROR")
        }
        #else
        call.reject("simulateRefund solo disponible en builds Debug", "NOT_AVAILABLE")
        #endif
    }
}
