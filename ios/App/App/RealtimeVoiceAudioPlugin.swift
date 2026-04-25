import AVFoundation
import Capacitor
import Foundation

@objc(MentalaRealtimeVoiceAudioPlugin)
public class MentalaRealtimeVoiceAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MentalaRealtimeVoiceAudioPlugin"
    public let jsName = "MentalaRealtimeVoiceAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "activate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deactivate", returnType: CAPPluginReturnPromise)
    ]

    private let session = AVAudioSession.sharedInstance()
    private var previousCategory: AVAudioSession.Category?
    private var previousMode: AVAudioSession.Mode?
    private var previousOptions: AVAudioSession.CategoryOptions?
    private var isActive = false

    @objc func activate(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                call.reject("Realtime voice audio bridge is unavailable")
                return
            }

            do {
                let result = try self.activateInternal()
                call.resolve(result)
            } catch {
                call.reject(
                    "Failed to activate realtime voice audio session",
                    nil,
                    error
                )
            }
        }
    }

    @objc func deactivate(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                call.resolve()
                return
            }

            do {
                try self.restorePlaybackSession()
                call.resolve()
            } catch {
                // Деактивация не должна ломать завершение voice-сессии:
                // JS уже остановил WebRTC, а AppDelegate дополнительно
                // поднимет playback-сессию на следующем lifecycle-событии.
                #if DEBUG
                print("[RealtimeVoiceAudio] restore failed: \(error.localizedDescription)")
                #endif
                call.resolve()
            }
        }
    }

    private func activateInternal() throws -> [String: Any] {
        if !isActive {
            previousCategory = session.category
            previousMode = session.mode
            previousOptions = session.categoryOptions
        }

        // Для WebRTC на iPhone нужен duplex-режим: иначе playback-сессия,
        // оставшаяся после фоновой музыки/медитаций, ухудшает echo cancellation,
        // и голос ассистента может возвращаться во входной микрофон.
        try session.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [.defaultToSpeaker, .allowBluetooth]
        )
        try? session.overrideOutputAudioPort(.speaker)
        try session.setActive(true, options: [])

        isActive = true

        #if DEBUG
        print("[RealtimeVoiceAudio] activated category=playAndRecord mode=voiceChat")
        #endif

        return [
            "platform": "ios",
            "category": session.category.rawValue,
            "mode": session.mode.rawValue,
            "speakerPinned": true
        ]
    }

    private func restorePlaybackSession() throws {
        guard isActive || previousCategory != nil || previousMode != nil else {
            return
        }

        let category = previousCategory ?? .playback
        let mode = previousMode ?? .default
        let options = previousOptions ?? [.allowBluetoothA2DP, .allowAirPlay]

        try session.setCategory(category, mode: mode, options: options)
        try session.setActive(true, options: [])

        previousCategory = nil
        previousMode = nil
        previousOptions = nil
        isActive = false

        #if DEBUG
        print("[RealtimeVoiceAudio] restored category=\(session.category.rawValue) mode=\(session.mode.rawValue)")
        #endif
    }
}
