import Foundation
import Capacitor

// Кастомный Bridge ViewController нужен, чтобы зарегистрировать локальные плагины,
// которые не поставляются как отдельные Capacitor-пакеты.
class MainViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()

        // Регистрируем StorefrontPlugin для JS-слоя.
        bridge?.registerPluginInstance(StorefrontPlugin())
        // Регистрируем AppleIapPlugin (StoreKit 2) для iOS purchase/restore flow.
        bridge?.registerPluginInstance(AppleIapPlugin())
    }
}
