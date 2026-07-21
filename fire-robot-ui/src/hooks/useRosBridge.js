import { useCallback, useEffect, useRef, useState } from "react";
import * as ROSLIB from "roslib";

const MAX_RECONNECT_ATTEMPTS = 10;
const MAX_RECONNECT_DELAY_MS = 30000;

export function useRosBridge({ url, onEvent }) {
  const [bridgeState, setBridgeState] = useState({
    ros: null,
    connected: false,
    status: "connecting",
    reconnectAttempt: 0,
  });

  const mountedRef = useRef(false);
  const currentRosRef = useRef(null);
  const connectedRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const connectRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;

    const clearReconnectTimer = () => {
      if (!reconnectTimeoutRef.current) return;
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    };

    const disposeCurrentRos = () => {
      const previousRos = currentRosRef.current;
      currentRosRef.current = null;
      if (!previousRos) return;

      try {
        previousRos.close();
      } catch (error) {
        console.warn("[ROS] Failed to close previous connection:", error);
      }
    };

    const scheduleReconnect = () => {
      if (!mountedRef.current || reconnectTimeoutRef.current) return;

      reconnectAttemptRef.current = Math.min(
        reconnectAttemptRef.current + 1,
        MAX_RECONNECT_ATTEMPTS
      );
      const delay = Math.min(
        1000 * 2 ** (reconnectAttemptRef.current - 1),
        MAX_RECONNECT_DELAY_MS
      );

      setBridgeState({
        ros: null,
        connected: false,
        status: "reconnecting",
        reconnectAttempt: reconnectAttemptRef.current,
      });

      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connectRef.current?.();
      }, delay);
    };

    const connect = () => {
      if (!mountedRef.current) return;

      clearReconnectTimer();
      disposeCurrentRos();

      const nextRos = new ROSLIB.Ros({ url });
      currentRosRef.current = nextRos;

      nextRos.on("connection", () => {
        if (!mountedRef.current || currentRosRef.current !== nextRos) return;

        clearReconnectTimer();
        reconnectAttemptRef.current = 0;
        connectedRef.current = true;
        setBridgeState({
          ros: nextRos,
          connected: true,
          status: "connected",
          reconnectAttempt: 0,
        });
        onEvent("INFO", "ROS Bridge 연결됨");
      });

      nextRos.on("error", (error) => {
        if (!mountedRef.current || currentRosRef.current !== nextRos) return;

        console.error("[ROS] rosbridge error:", error);
        const wasConnected = connectedRef.current;
        connectedRef.current = false;
        setBridgeState({
          ros: null,
          connected: false,
          status: "error",
          reconnectAttempt: reconnectAttemptRef.current,
        });
        if (wasConnected) onEvent("WARN", "ROS Bridge 연결 오류");
        scheduleReconnect();
      });

      nextRos.on("close", () => {
        if (!mountedRef.current || currentRosRef.current !== nextRos) return;

        const wasConnected = connectedRef.current;
        connectedRef.current = false;
        setBridgeState({
          ros: null,
          connected: false,
          status: "reconnecting",
          reconnectAttempt: reconnectAttemptRef.current,
        });
        if (wasConnected) onEvent("WARN", "ROS Bridge 연결 끊김");
        scheduleReconnect();
      });
    };

    connectRef.current = connect;
    connect();

    return () => {
      mountedRef.current = false;
      connectRef.current = null;
      clearReconnectTimer();
      disposeCurrentRos();
    };
  }, [onEvent, url]);

  const reconnect = useCallback(() => {
    reconnectAttemptRef.current = 0;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    connectedRef.current = false;
    setBridgeState({
      ros: null,
      connected: false,
      status: "connecting",
      reconnectAttempt: 0,
    });
    connectRef.current?.();
  }, []);

  return {
    ...bridgeState,
    reconnect,
  };
}
