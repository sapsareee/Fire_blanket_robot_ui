import { useCallback, useEffect, useState } from "react";
import autonomyIcon from "../assets/icons/icon-autonomy.svg";
import batteryIcon from "../assets/icons/icon-battery.svg";
import cameraIcon from "../assets/icons/icon-camera.svg";
import motorIcon from "../assets/icons/icon-motor.svg";
import temperatureIcon from "../assets/icons/icon-temperature.svg";
import thermalIcon from "../assets/icons/icon-thermal.svg";
import nav2Video from "../assets/videos/nav_canva.mp4";
import { useRosBridge } from "./useRosBridge";
import { useRobotSensors } from "./useRobotSensors";

const PAGE_IS_HTTPS = window.location.protocol === "https:";
const WS_PROTOCOL = PAGE_IS_HTTPS ? "wss" : "ws";
const HTTP_PROTOCOL = PAGE_IS_HTTPS ? "https" : "http";
const DEFAULT_HOST = window.location.hostname;

const ROS_HOST = import.meta.env.VITE_ROS_HOST || DEFAULT_HOST;
const ROSBRIDGE_PORT = import.meta.env.VITE_ROSBRIDGE_PORT || "9090";
const VIDEO_HOST = import.meta.env.VITE_VIDEO_HOST || DEFAULT_HOST;
const VIDEO_PORT = import.meta.env.VITE_VIDEO_PORT || "8080";

const ROSBRIDGE_URL = `${WS_PROTOCOL}://${ROS_HOST}:${ROSBRIDGE_PORT}`;
const THERMAL_STREAM_URL = `${HTTP_PROTOCOL}://${VIDEO_HOST}:${VIDEO_PORT}/stream?topic=/thermal/image&type=mjpeg&quality=70&qos_profile=sensor_data`;
const RGB_STREAM_URL = `${HTTP_PROTOCOL}://${VIDEO_HOST}:${VIDEO_PORT}/stream?topic=/rgb/image_raw&qos_profile=sensor_data`;
const STREAM_RETRY_INTERVAL_MS = 3000;
const MAX_EVENT_LOGS = 200;
const BATTERY_MIN_V = 10.5;
const BATTERY_MAX_V = 11.5;
const TEMP_MIN_C = 30;
const TEMP_MAX_C = 50;

const CONNECTION_CONFIG = [
  { key: "autonomy", name: "자율주행", icon: autonomyIcon },
  { key: "thermal_camera", name: "열화상", icon: thermalIcon },
  { key: "vision_sensor", name: "RGB 카메라", icon: cameraIcon },
  {
    key: "battery_sensor",
    name: "배터리 상태",
    icon: batteryIcon,
    valueKey: "batteryVoltage",
  },
  { key: "motor", name: "모터 상태", icon: motorIcon },
  {
    key: "temperature_sensor",
    name: "로봇 온도",
    icon: temperatureIcon,
    valueKey: "internalTemperature",
  },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const formatTimeLabel = (timeMs) => {
  const date = new Date(timeMs);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
};

const streamState = () => ({ ok: false, source: null });

export function useFireRobotDashboard() {
  const [activeTab, setActiveTab] = useState("home");
  const [eventLogs, setEventLogs] = useState([]);
  const [thermalReloadKey, setThermalReloadKey] = useState(0);
  const [rgbReloadKey, setRgbReloadKey] = useState(0);
  const [autonomyReloadKey, setAutonomyReloadKey] = useState(0);
  const [thermalStreamState, setThermalStreamState] = useState(streamState);
  const [rgbStreamState, setRgbStreamState] = useState(streamState);
  const [autonomyStreamState, setAutonomyStreamState] = useState(streamState);

  const appendEventLog = useCallback((level, text) => {
    const now = Date.now();
    const nextLog = {
      id: `${now}-${Math.random().toString(16).slice(2, 8)}`,
      time: formatTimeLabel(now),
      timestamp: now,
      level,
      text,
    };
    setEventLogs((previous) =>
      [nextLog, ...previous].slice(0, MAX_EVENT_LOGS)
    );
  }, []);

  const bridge = useRosBridge({
    url: ROSBRIDGE_URL,
    onEvent: appendEventLog,
  });

  const sensors = useRobotSensors({
    ros: bridge.ros,
    rosConnected: bridge.connected,
    onEvent: appendEventLog,
  });

  const topicAlive = useCallback(
    (key) => {
      const state = sensors.topicStates[key];
      return Boolean(state && !state.timedOut && state.value === true);
    },
    [sensors.topicStates]
  );

  const shouldLoadThermalStream = bridge.connected && topicAlive("thermal_camera");
  const shouldLoadRgbStream = bridge.connected && topicAlive("vision_sensor");
  const shouldLoadAutonomyVideo = bridge.connected && topicAlive("autonomy");

  const thermalStreamConnected = Boolean(
    shouldLoadThermalStream &&
      thermalStreamState.ok &&
      thermalStreamState.source === bridge.ros
  );
  const rgbStreamConnected = Boolean(
    shouldLoadRgbStream &&
      rgbStreamState.ok &&
      rgbStreamState.source === bridge.ros
  );
  const autonomyStreamConnected = Boolean(
    shouldLoadAutonomyVideo &&
      autonomyStreamState.ok &&
      autonomyStreamState.source === bridge.ros
  );

  useEffect(() => {
    if (!shouldLoadThermalStream || thermalStreamConnected) return undefined;
    const timer = setInterval(
      () => setThermalReloadKey((value) => value + 1),
      STREAM_RETRY_INTERVAL_MS
    );
    return () => clearInterval(timer);
  }, [shouldLoadThermalStream, thermalStreamConnected]);

  useEffect(() => {
    if (!shouldLoadRgbStream || rgbStreamConnected) return undefined;
    const timer = setInterval(
      () => setRgbReloadKey((value) => value + 1),
      STREAM_RETRY_INTERVAL_MS
    );
    return () => clearInterval(timer);
  }, [rgbStreamConnected, shouldLoadRgbStream]);

  const handleThermalLoad = useCallback(() => {
    setThermalStreamState({ ok: true, source: bridge.ros });
  }, [bridge.ros]);
  const handleThermalError = useCallback(() => {
    setThermalStreamState({ ok: false, source: bridge.ros });
  }, [bridge.ros]);
  const reconnectThermalStream = useCallback(() => {
    setThermalStreamState(streamState());
    setThermalReloadKey((value) => value + 1);
  }, []);

  const handleRgbLoad = useCallback(() => {
    setRgbStreamState({ ok: true, source: bridge.ros });
  }, [bridge.ros]);
  const handleRgbError = useCallback(() => {
    setRgbStreamState({ ok: false, source: bridge.ros });
  }, [bridge.ros]);
  const reconnectRgbStream = useCallback(() => {
    setRgbStreamState(streamState());
    setRgbReloadKey((value) => value + 1);
  }, []);

  const handleAutonomyLoadStart = useCallback(() => {
    setAutonomyStreamState({ ok: false, source: bridge.ros });
  }, [bridge.ros]);
  const handleAutonomyCanPlay = useCallback(() => {
    setAutonomyStreamState({ ok: true, source: bridge.ros });
  }, [bridge.ros]);
  const handleAutonomyError = useCallback(() => {
    setAutonomyStreamState({ ok: false, source: bridge.ros });
  }, [bridge.ros]);
  const reconnectAutonomyStream = useCallback(() => {
    setAutonomyStreamState(streamState());
    setAutonomyReloadKey((value) => value + 1);
  }, []);

  const connectionItems = CONNECTION_CONFIG.map((config) => {
    const state = sensors.topicStates[config.key];
    const connected = config.valueKey
      ? sensors[config.valueKey] !== null
      : Boolean(state && !state.timedOut && state.value === true);
    return {
      key: config.key,
      name: config.name,
      icon: config.icon,
      connected,
      status: connected ? "CONNECTED" : "DISCONNECTED",
    };
  });

  const batteryPercentage =
    sensors.batteryVoltage === null
      ? null
      : Math.round(
          clamp(
            ((sensors.batteryVoltage - BATTERY_MIN_V) /
              (BATTERY_MAX_V - BATTERY_MIN_V)) *
              100,
            0,
            100
          )
        );
  const temperaturePercentage =
    sensors.internalTemperature === null
      ? null
      : Math.round(
          clamp(
            ((sensors.internalTemperature - TEMP_MIN_C) /
              (TEMP_MAX_C - TEMP_MIN_C)) *
              100,
            0,
            100
          )
        );

  return {
    activeTab,
    setActiveTab,
    bridge,
    sensors: {
      ...sensors,
      batteryPercentage,
      temperaturePercentage,
      batteryRange: { min: BATTERY_MIN_V, max: BATTERY_MAX_V },
      temperatureRange: { min: TEMP_MIN_C, max: TEMP_MAX_C },
    },
    streams: {
      thermal: {
        title: "Thermal Cam",
        caption: "Thermal Cam",
        type: "image",
        src: `${THERMAL_STREAM_URL}&reload=${thermalReloadKey}`,
        reloadKey: thermalReloadKey,
        shouldLoad: shouldLoadThermalStream,
        connected: thermalStreamConnected,
        status: thermalStreamConnected
          ? "ACTIVE 10 FPS"
          : shouldLoadThermalStream
            ? "CONNECTING"
            : "DISCONNECTED",
        onLoad: handleThermalLoad,
        onError: handleThermalError,
        onReload: reconnectThermalStream,
      },
      autonomy: {
        title: "Autonomous Path",
        caption: "Autonomous Path",
        type: "video",
        src: nav2Video,
        reloadKey: autonomyReloadKey,
        shouldLoad: shouldLoadAutonomyVideo,
        connected: autonomyStreamConnected,
        status: autonomyStreamConnected
          ? "SYNCED"
          : shouldLoadAutonomyVideo
            ? "LOADING"
            : "DISCONNECTED",
        onLoadStart: handleAutonomyLoadStart,
        onCanPlay: handleAutonomyCanPlay,
        onError: handleAutonomyError,
        onReload: reconnectAutonomyStream,
      },
      rgb: {
        title: "Front RGB",
        caption: "Front RGB",
        type: "image",
        src: `${RGB_STREAM_URL}&reload=${rgbReloadKey}`,
        reloadKey: rgbReloadKey,
        shouldLoad: shouldLoadRgbStream,
        connected: rgbStreamConnected,
        status: rgbStreamConnected
          ? "ACTIVE 30 FPS"
          : shouldLoadRgbStream
            ? "CONNECTING"
            : "DISCONNECTED",
        onLoad: handleRgbLoad,
        onError: handleRgbError,
        onReload: reconnectRgbStream,
      },
    },
    connectionItems,
    eventLogs,
  };
}
