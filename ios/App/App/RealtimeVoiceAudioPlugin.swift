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
    // Поколение restore-запроса: новый activate()/deactivate() инвалидирует
    // отложенные retry, чтобы они не перетёрли свежую сессию.
    private var restoreGeneration = 0

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

            // Деактивация не должна блокировать завершение voice-сессии:
            // restore с ретраями идёт в фоне, JS резолвим сразу.
            self.beginRestorePlaybackSession()
            call.resolve()
        }
    }

    /// Запускает восстановление playback-сессии с отложенными повторами.
    /// Сразу после закрытия WebRTC WebKit может ещё держать capture I/O,
    /// и первый setCategory/setActive падает с OSStatus-ошибкой. Раньше эта
    /// ошибка глоталась, сессия навсегда оставалась в playAndRecord/voiceChat,
    /// а AppDelegate её НЕ чинил: configurePlaybackAudioSession намеренно
    /// пропускает записывающие категории. Итог — медитации/дыхательные практики
    /// после realtime voice играли тихо через разговорный маршрут или не
    /// стартовали вовсе. Ретраи дают WebKit время отпустить аудиоюнит.
    private func beginRestorePlaybackSession() {
        restoreGeneration += 1
        let generation = restoreGeneration

        do {
            try restorePlaybackSession()
        } catch {
            #if DEBUG
            print("[RealtimeVoiceAudio] restore failed, scheduling retries: \(error.localizedDescription)")
            #endif
            scheduleRestoreRetry(after: 0.3, generation: generation, attemptsLeft: 3)
        }
    }

    private func scheduleRestoreRetry(
        after delay: TimeInterval,
        generation: Int,
        attemptsLeft: Int
    ) {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self, self.restoreGeneration == generation else {
                // Пришёл новый activate()/deactivate() — retry устарел.
                return
            }

            do {
                try self.restorePlaybackSession()
            } catch {
                if attemptsLeft > 1 {
                    self.scheduleRestoreRetry(
                        after: delay * 3,
                        generation: generation,
                        attemptsLeft: attemptsLeft - 1
                    )
                } else {
                    #if DEBUG
                    print("[RealtimeVoiceAudio] restore retries exhausted: \(error.localizedDescription)")
                    #endif
                }
            }
        }
    }

    private func activateInternal() throws -> [String: Any] {
        // Инвалидируем отложенные restore-retry прошлой сессии,
        // чтобы они не сбросили только что поднятый duplex-режим.
        restoreGeneration += 1

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

        // Сначала полностью отпускаем duplex-сессию: пока playAndRecord/voiceChat
        // активна, playback других плееров идёт через тихий разговорный маршрут,
        // а notifyOthersOnDeactivation даёт системе сигнал возобновить чужое аудио.
        try? session.setActive(false, options: [.notifyOthersOnDeactivation])

        var category = previousCategory ?? .playback
        var mode = previousMode ?? .default
        var options = previousOptions ?? [.allowBluetoothA2DP, .allowAirPlay]

        // Никогда не восстанавливаем записывающие категории: если до voice-сессии
        // была активна playAndRecord (например, STT), «восстановление» оставило бы
        // receiver-маршрут с минимальной громкостью. Базовое состояние приложения —
        // playback (см. AppDelegate.configurePlaybackAudioSession).
        if category == .playAndRecord || category == .record {
            category = .playback
            mode = .default
            options = [.allowBluetoothA2DP, .allowAirPlay]
        }

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
