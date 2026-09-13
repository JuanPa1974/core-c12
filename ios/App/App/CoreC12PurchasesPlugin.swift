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
// IMPORTANTE (hallazgo confirmado con crash real, no una suposición):
// SKTestSession(configurationFileNamed:) provoca un SIGABRT si se llama
// fuera de un proceso anfitrión de XCTest — su inicializador depende
// internamente de __getXCTestConfigurationClass, y NO es un error Swift
// capturable con do/catch (el abort ocurre a nivel Objective-C, por
// debajo del manejo de errores de Swift). Por eso NO se crea aquí en
// load(): hacerlo bloquearía CUALQUIER arranque normal de la app
// (`xcrun simctl launch`, o incluso Xcode Run sin un target de test).
// simulateRefund() la crea de forma perezosa solo si se invoca
// explícitamente — ver su propio comentario para el alcance exacto de
// esta limitación.
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

    // load() deliberadamente no hace nada — ver el comentario de
    // cabecera sobre por qué SKTestSession no puede crearse aquí sin
    // abortar el proceso.

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
        // Guarda obligatoria: SKTestSession aborta el proceso (SIGABRT,
        // no capturable) si no hay un anfitrión XCTest activo. Esta
        // variable de entorno es la señal estándar y segura de que sí
        // lo hay — comprobarla ANTES de instanciar la sesión es la única
        // forma de evitar el crash en un lanzamiento normal (Xcode Run
        // sin target de test, o `xcrun simctl launch`).
        guard ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil else {
            call.reject(
                "simulateRefund requiere ejecutar la app desde un target XCTest (SKTestSession aborta el proceso fuera de ese contexto). No disponible desde un lanzamiento normal.",
                "NO_XCTEST_HOST"
            )
            return
        }
        guard let transactionId = self.lastTransactionID else {
            call.reject("No hay transacción reciente para reembolsar", "NO_TRANSACTION")
            return
        }
        do {
            let session = try SKTestSession(configurationFileNamed: "Configuration")
            try session.refundTransaction(identifier: UInt(transactionId))
            call.resolve(["status": "refunded"])
        } catch {
            call.reject("Error simulando reembolso: \(error.localizedDescription)", "REFUND_ERROR")
        }
        #else
        call.reject("simulateRefund solo disponible en builds Debug", "NOT_AVAILABLE")
        #endif
    }
}
