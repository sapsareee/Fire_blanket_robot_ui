import { useCallback, useEffect, useRef, useState } from "react";
import * as ROSLIB from "roslib";

const RECONNECT_DELAY_MS = 1000;

export function useRosBridge({ url, onEvent }) {
  const [bridgeState, setBridgeState] = useState({
    ros: null,
    connected: false,
    status: "connecting",
  });

  const mountedRef = useRef(false);
  const currentRosRef = useRef(null);
  const connectedRef = useRef(false);
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
      if (
        !mountedRef.current ||
        connectedRef.current ||
        reconnectTimeoutRef.current
      ) {
        return;
      }

      setBridgeState((current) =>
        current.status === "reconnecting" &&
        current.ros === null &&
        !current.connected
          ? current
          : {
              ros: null,
              connected: false,
              status: "reconnecting",
            }
      );

      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        if (!mountedRef.current || connectedRef.current) return;
        connectRef.current?.();
      }, RECONNECT_DELAY_MS);
    };

    const connect = () => {
      if (!mountedRef.current || connectedRef.current) return;

      clearReconnectTimer();
      disposeCurrentRos();

      const nextRos = new ROSLIB.Ros({ url });
      currentRosRef.current = nextRos;

      nextRos.on("connection", () => {
        if (!mountedRef.current || currentRosRef.current !== nextRos) return;

        clearReconnectTimer();
        connectedRef.current = true;
        setBridgeState({
          ros: nextRos,
          connected: true,
          status: "connected",
        });
        onEvent("INFO", "ROS Bridge 연결됨");
      });

      nextRos.on("error", (error) => {
        if (!mountedRef.current || currentRosRef.current !== nextRos) return;

        const wasConnected = connectedRef.current;
        connectedRef.current = false;
        if (wasConnected) {
          console.error("[ROS] rosbridge error:", error);
          onEvent("WARN", "ROS Bridge 연결 오류");
        }
        scheduleReconnect();
      });

      nextRos.on("close", () => {
        if (!mountedRef.current || currentRosRef.current !== nextRos) return;

        const wasConnected = connectedRef.current;
        connectedRef.current = false;
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
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    connectedRef.current = false;
    setBridgeState({
      ros: null,
      connected: false,
      status: "connecting",
    });
    connectRef.current?.();
  }, []);

  return {
    ...bridgeState,
    reconnect,
  };
}
