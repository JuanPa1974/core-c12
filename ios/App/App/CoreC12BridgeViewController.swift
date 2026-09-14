import Capacitor

// Registro productivo del plugin nativo StoreKit 2 (CoreC12PurchasesPlugin).
//
// Necesario porque el registro automático de plugins de Capacitor
// (`CapacitorBridge.registerPlugins()`) solo escanea archivos .swift
// que pertenecen a paquetes npm de Capacitor (ver
// @capacitor/cli/dist/util/iosplugin.js:getPluginFiles) — nunca los
// archivos nativos propios del target de la app. CoreC12PurchasesPlugin
// vive directamente en este target (no es un paquete npm), así que
// nunca aparece en `packageClassList` de capacitor.config.json y el
// bridge nunca lo registra por sí solo.
//
// `capacitorDidLoad()` es el punto de extensión que el propio Capacitor
// documenta para este caso exacto: se invoca justo después de crear el
// bridge, con `bridge` ya disponible, así que registrar aquí un plugin
// local no compite ni depende del autoregistro basado en paquetes.
class CoreC12BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(CoreC12PurchasesPlugin())
    }
}
