import CoreBluetooth

/**
 * BLE peripheral role — Capacitor plugin (iOS impl, CoreBluetooth).
 *
 * Status: STUB. Fill in the TODO blocks:
 *   1. CBPeripheralManager delegate lifecycle (powered on → build service, publish)
 *   2. Advertising: [CBAdvertisementDataServiceUUIDsKey: serviceUUID]
 *   3. didReceiveWrite → decode UTF-8 JSON IdClaim → notify claimReceived
 *   4. didReceiveRead → serve activeExchangeCode
 *
 * Info.plist needs:
 *   NSBluetoothAlwaysUsageDescription
 *   NSBluetoothPeripheralUsageDescription (pre-iOS 12)
 */
@objc(BlePeripheralPlugin)
class BlePeripheralPlugin: CAPPlugin, CBPeripheralManagerDelegate {

    private var peripheralManager: CBPeripheralManager?
    private var activeExchangeCode: String?

    private let serviceUUID = CBUUID(string: "B1E4D1A0-0F1E-46BA-8E29-9A4C1F7E0001")
    private let claimCharUUID = CBUUID(string: "B1E4D1A0-0F1E-46BA-8E29-9A4C1F7E0002")
    private let exchangeCharUUID = CBUUID(string: "B1E4D1A0-0F1E-46BA-8E29-9A4C1F7E0003")

    private var claimChar: CBMutableCharacteristic?
    private var exchangeChar: CBMutableCharacteristic?

    @objc func isSupported(_ call: CAPPluginCall) {
        let result = [
            "supported": peripheralManager != nil,
            "peripheralModeAvailable": peripheralManager != nil,
        ]
        call.resolve(result)
    }

    @objc func startAdvertising(_ call: CAPPluginCall) {
        if peripheralManager == nil {
            let pm = CBPeripheralManager(delegate: self, queue: nil)
            peripheralManager = pm
        }
        // TODO 1: on peripheralManagerDidUpdateState(.poweredOn) →
        //   build CBMutableService(serviceUUID, primary:true) with:
        //     claimChar    (.write, value: nil, props: [.write], perms: [.writeable])
        //     exchangeChar (.read,  value: code bytes, props: [.read], perms: [.readable])
        // TODO 2: publish service → on didAdd → pm.startAdvertising([
        //   CBAdvertisementDataServiceUUIDsKey: [serviceUUID],
        //   CBAdvertisementDataLocalNameKey: call.getString("localName") ?? device.name
        // ])
        // TODO 3: on didStartAdvertise success → notifyListeners("advertisingStarted")
        call.resolve()
    }

    @objc func stopAdvertising(_ call: CAPPluginCall) {
        peripheralManager?.stopAdvertising()
        // TODO: peripheralManager?.removeAllServices?() if you want a hard reset
        call.resolve()
    }

    @objc func getActiveExchange(_ call: CAPPluginCall) {
        call.resolve(["exchangeCode": activeExchangeCode ?? NSNull()])
    }

    @objc func setActiveExchange(_ call: CAPPluginCall) {
        guard let code = call.getString("exchangeCode") else {
            return call.reject("exchangeCode is required")
        }
        activeExchangeCode = code
        // TODO: update exchangeChar?.value = Data(code.utf8), then
        // peripheralManager.updateValue(Data(code.utf8), for: exchangeChar!,
        // onSubscribedCentrals: nil) — returns false if you must wait for
        // peripheralManagerIsReady(toUpdateSubscribers:)

        call.resolve()
    }

    // MARK: - CBPeripheralManagerDelegate stubs

    public func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        // TODO: .poweredOn → build + publish service (see TODO 1 in startAdvertising)
    }

    public func peripheralManager(
        _ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]
    ) {
        for request in requests where request.characteristic == claimChar {
            if let data = request.value,
               let json = String(data: data, encoding: .utf8) {
                notifyListeners("claimReceived", ["claim": json])
            }
            peripheral.respond(to: request, withResult: .success)
        }
    }

    public func peripheralManager(
        _ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest
    ) {
        if request.characteristic == exchangeChar {
            request.value = activeExchangeCode.flatMap { Data($0.utf8) }
            peripheral.respond(to: request, withResult: .success)
        } else {
            peripheral.respond(to: request, withResult: .readNotPermitted)
        }
    }

    public func peripheralManager(
        _ peripheral: CBPeripheralManager, didStartAdvertisingFor error: Error?
    ) {
        if let error {
            notifyListeners("advertisingError", ["message": error.localizedDescription])
        } else {
            notifyListeners("advertisingStarted", [:])
        }
    }
}
