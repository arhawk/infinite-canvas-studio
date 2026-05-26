import { BasePlugin } from "../core/baseClasses.js";

const TIMER_STATE_MESSAGE = "app:timer-state";
const CALCULATOR_STATE_MESSAGE = "app:calculator-state";

export class CalcTimerSyncPlugin extends BasePlugin {
  static pluginId = "calc-timer-sync";

  onSetup() {
    this._timerPlugin = null;
    this._calculatorPlugin = null;
    this._unsubTimer = null;
    this._unsubCalculator = null;
    this._unsubViewerTimer = null;
    this._unsubViewerCalculator = null;
    this._boundViewerClient = null;

    this.listen("room:share:change", () => this.sync());
    this.listen("room:viewer:joined", () => this._sendHostSnapshots());
    window.setTimeout(() => this.sync(), 0);

    this.cleanups.push(() => {
      this._detachLocalStateSubscriptions();
      this._detachViewerSubscriptions();
    });
  }

  sync() {
    const roomShare = this.app.getPlugin("room-share");
    this._timerPlugin = this.app.getPlugin("timer");
    this._calculatorPlugin = this.app.getPlugin("binaryCalculator");

    if (!this._timerPlugin || !this._calculatorPlugin) {
      window.setTimeout(() => this.sync(), 0);
      return;
    }

    const isRoomClient = Boolean(roomShare?.viewer?.client);
    const isControlHost = Boolean(roomShare?.host?.connected) && !isRoomClient;

    this._timerPlugin.setReadonly?.(isRoomClient);
    this._calculatorPlugin.setReadonly?.(isRoomClient);

    if (isControlHost) {
      this._attachLocalStateSubscriptions();
    } else {
      this._detachLocalStateSubscriptions();
    }

    if (isRoomClient) {
      this._attachViewerSubscriptions(roomShare.viewer.client);
    } else {
      this._detachViewerSubscriptions();
    }
  }

  _attachLocalStateSubscriptions() {
    if (!this._unsubTimer) {
      this._unsubTimer = this._timerPlugin.onStateChange?.((state) => {
        const roomShare = this.app.getPlugin("room-share");
        if (!roomShare?.host?.connected || roomShare?.viewer?.client) return;
        roomShare.host.client?.send(TIMER_STATE_MESSAGE, { state });
      });
    }

    if (!this._unsubCalculator) {
      this._unsubCalculator = this._calculatorPlugin.onStateChange?.((state) => {
        const roomShare = this.app.getPlugin("room-share");
        if (!roomShare?.host?.connected || roomShare?.viewer?.client) return;
        roomShare.host.client?.send(CALCULATOR_STATE_MESSAGE, { state });
      });
    }
  }

  _sendHostSnapshots() {
    try {
      const roomShare = this.app.getPlugin("room-share");
      if (!roomShare?.host?.connected || roomShare?.viewer?.client) return;

      this._timerPlugin = this._timerPlugin ?? this.app.getPlugin("timer");
      this._calculatorPlugin = this._calculatorPlugin ?? this.app.getPlugin("binaryCalculator");

      try {
        const timerState = this._timerPlugin?.getSyncState?.();
        if (timerState) {
          roomShare.host.client?.send(TIMER_STATE_MESSAGE, { state: timerState });
        }
      } catch (error) {
        console.error("[calc-timer-sync] Failed to send timer sync snapshot.", error);
      }

      try {
        const calculatorState = this._calculatorPlugin?.getSyncState?.();
        if (calculatorState) {
          roomShare.host.client?.send(CALCULATOR_STATE_MESSAGE, { state: calculatorState });
        }
      } catch (error) {
        console.error("[calc-timer-sync] Failed to send calculator sync snapshot.", error);
      }
    } catch (error) {
      console.error("[calc-timer-sync] Failed to send widget snapshots.", error);
    }
  }

  _detachLocalStateSubscriptions() {
    this._unsubTimer?.();
    this._unsubCalculator?.();
    this._unsubTimer = null;
    this._unsubCalculator = null;
  }

  _attachViewerSubscriptions(client) {
    if (!client || this._boundViewerClient === client) return;
    this._detachViewerSubscriptions();
    this._boundViewerClient = client;

    this._unsubViewerTimer = client.on(TIMER_STATE_MESSAGE, ({ state } = {}) => {
      this._timerPlugin?.applySyncState?.(state ?? {});
    });
    this._unsubViewerCalculator = client.on(CALCULATOR_STATE_MESSAGE, ({ state } = {}) => {
      this._calculatorPlugin?.applySyncState?.(state ?? {});
    });
  }

  _detachViewerSubscriptions() {
    this._unsubViewerTimer?.();
    this._unsubViewerCalculator?.();
    this._unsubViewerTimer = null;
    this._unsubViewerCalculator = null;
    this._boundViewerClient = null;
  }
}
