package com.bleid.bleplugin

import android.Manifest
import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.content.pm.PackageManager
import android.os.ParcelUuid
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.Permission
import com.getcapacitor.PermissionState
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import java.nio.charset.StandardCharsets
import java.util.UUID

/**
 * BLE peripheral role — Capacitor plugin (Android impl).
 *
 * Status: STUB. Fill in the TODO blocks:
 *   1. BluetoothLeAdvertiser.startAdvertising — connectable, service UUID
 *   2. BluetoothGattServer — claim characteristic (write) + exchange code (read)
 *   3. Map :notifications to events (claimReceived, advertisingStarted, advertisingError)
 *
 * Service UUIDs come from @ble-id/shared-types (WRAPPER_SERVICE_UUID,
 * WRAPPER_CLAIM_CHAR_UUID, WRAPPER_EXCHANGE_CHAR_UUID).
 */
@CapacitorPlugin(
    name = "BlePeripheral",
    permissions = [
        Permission(
            strings = [Manifest.permission.BLUETOOTH_ADVERTISE],
            alias = "bluetoothAdvertise",
        ),
        Permission(
            strings = [Manifest.permission.BLUETOOTH_CONNECT],
            alias = "bluetoothConnect",
        ),
        Permission(
            strings = [Manifest.permission.ACCESS_FINE_LOCATION],
            alias = "fineLocation",
        ),
    ],
)
class BlePeripheralPlugin : Plugin() {

    private val manager: BluetoothManager? by lazy {
        context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    }
    private var advertiser: BluetoothLeAdvertiser? = null
    private var gattServer: BluetoothGattServer? = null
    private var activeExchangeCode: String? = null

    private val serviceUuid: UUID = UUID.fromString("B1E4D1A0-0F1E-46BA-8E29-9A4C1F7E0001")
    private val claimCharUuid: UUID = UUID.fromString("B1E4D1A0-0F1E-46BA-8E29-9A4C1F7E0002")
    private val exchangeCharUuid: UUID = UUID.fromString("B1E4D1A0-0F1E-46BA-8E29-9A4C1F7E0003")

    @PluginMethod
    fun isSupported(call: PluginCall) {
        val pm = PackageManager.FEATURE_BLUETOOTH_LE
        val result = JSObject()
        result.put("supported", context.packageManager.hasSystemFeature(pm))
        // TODO: on API 21-30 you must verify BluetoothAdapter.isMultipleAdvertisementSupported()
        result.put("peripheralModeAvailable", manager?.adapter?.isMultipleAdvertisementSupported == true)
        call.resolve(result)
    }

    @PluginMethod
    fun startAdvertising(call: PluginCall) {
        val advertiserReady = this.advertiser ?: run {
            manager?.adapter?.bluetoothLeAdvertiser
        }
        if (advertiserReady == null) {
            call.reject("LE advertising not available on this device")
            return
        }
        this.advertiser = advertiserReady

        // TODO 1: build AdvertiseSettings (CONNECTABLE, ADVERTISE_TX_POWER_MEDIUM)
        // TODO 2: build AdvertiseData with ParcelUuid(serviceUuid) and localName
        // TODO 3: advertiseCallback → notifyListeners("advertisingStarted", JSObject())
        //          on error → notifyListeners("advertisingError", …) and call.reject
        // TODO 4: openGattServer(context, callback) + register the 3 characteristics:
        //   claimCharUuid    → WRITE: parse UTF-8 JSON IdClaim → notifyListeners("claimReceived")
        //   exchangeCharUuid → READ: serve activeExchangeCode bytes
        //   serviceUuid      → BluetoothGattService(SERVICE_TYPE_PRIMARY)
        call.resolve()
    }

    @PluginMethod
    fun stopAdvertising(call: PluginCall) {
        // TODO: advertiser?.stopAdvertising (keep null-safe), close gattServer, null refs
        call.resolve()
    }

    @PluginMethod
    fun getActiveExchange(call: PluginCall) {
        val result = JSObject()
        result.put("exchangeCode", activeExchangeCode)
        call.resolve(result)
    }

    @PluginMethod
    fun setActiveExchange(call: PluginCall) {
        val code = call.getString("exchangeCode")
            ?: return call.reject("exchangeCode is required")
        activeExchangeCode = code
        // TODO: if gattServer characteristic exists, notifyWithResponse connected centrals
        call.resolve()
    }

    /** Emit a claim JSON string that arrived over GATT. Used by the GATT callback. */
    private fun emitClaimReceived(claimJson: String) {
        val data = JSObject()
        data.put("claim", claimJson)
        notifyListeners("claimReceived", data)
    }

    private fun buildCharacteristic(
        uuid: UUID,
        properties: Int,
        permissions: Int,
    ): BluetoothGattCharacteristic =
        BluetoothGattCharacteristic(uuid, properties, permissions)

    override fun checkPermissions(call: PluginCall) {
        if (android.os.Build.VERSION.SDK_INT >= 31) {
            super.checkPermissions(call)
        } else {
            // API 21-30: BLUETOOTH_CONNECT/ADVERTISE don't exist; fine location is what gates scans
            val res = JSObject()
            res.put(
                "fineLocation",
                if (context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED
                )
                    PermissionState.GRANTED.toString()
                else PermissionState.PROMPT.toString(),
            )
            call.resolve(res)
        }
    }
}
