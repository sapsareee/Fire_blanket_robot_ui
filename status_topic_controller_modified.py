import rclpy
from rclpy.node import Node
from std_msgs.msg import Bool, Float32
import threading
import random
import time
import subprocess
import signal
import os


TEMP_VALUE_TOPIC = '/robot/internal_temperature'
TEMP_MIN_C = 30.0
TEMP_MAX_C = 50.0
TEMP_BASE_C = 40.0
TEMP_TIMER_PERIOD_SEC = 1.0

BATTERY_VOLTAGE_TOPIC = '/battery_voltage'
BATTERY_BASE_V = 11.1
BATTERY_VARIANCE_MIN_V = 0.0
BATTERY_VARIANCE_MAX_V = 0.02
BATTERY_TIMER_PERIOD_SEC = 1.0


def clamp(value, min_value, max_value):
    return min(max_value, max(min_value, value))


class StatusTopicController(Node):
    def __init__(self):
        super().__init__('status_topic_controller')

        self.topic_map = {
            '1': ('/autonomy/status', 'Autonomy'),
            '2': ('/thermal_camera/status', 'Thermal Camera'),
            '3': ('/vision_sensor/status', 'Vision Sensor'),
            '5': ('/motor/status', '모터 상태'),
        }

        self.input_aliases = {
            'motor': '5',
        }

        self.topic_publishers = {}
        self.active_timers = {}

        self.temperature_value_publisher = self.create_publisher(
            Float32,
            TEMP_VALUE_TOPIC,
            10
        )
        self.temperature_timer = None
        self.current_temperature = TEMP_BASE_C

        self.battery_voltage_publisher = self.create_publisher(
            Float32,
            BATTERY_VOLTAGE_TOPIC,
            10
        )
        self.battery_voltage_timer = None

        self.random_starting = False

        self.web_video_server_process = None
        self.rosbridge_server_process = None

        for key, (topic, name) in self.topic_map.items():
            self.topic_publishers[key] = self.create_publisher(Bool, topic, 10)

        self.print_menu()

    def print_menu(self):
        print("\n===== Status Topic Controller =====")
        print("1: /autonomy/status true 발행/중지")
        print("2: /thermal_camera/status true 발행/중지")
        print("3: /vision_sensor/status true 발행/중지")
        print("5: /motor/status true 발행/중지")
        print(f"온도값 토픽: {TEMP_VALUE_TOPIC} Float32, 기준 {TEMP_BASE_C:.1f}°C 주변으로 발행")
        print(f"배터리 전압 토픽: {BATTERY_VOLTAGE_TOPIC} Float32, 기준 {BATTERY_BASE_V:.1f}V +0.0~+0.02V 발행")
        print("a: 상태 토픽을 랜덤 선택 + 0.1~0.5초 간격으로 발행 시작 + 내부 온도값 발행/전체 중지")
        print("s: a 기능 + /battery_voltage Float32 발행 + rosbridge/web_video_server 실행/전체 중지")
        print("q: 종료")
        print("===================================")

    def publish_once(self, key):
        msg = Bool()
        msg.data = True
        self.topic_publishers[key].publish(msg)

    def start_publish(self, key):
        if key in self.active_timers:
            return

        topic, name = self.topic_map[key]

        self.publish_once(key)

        def publish_true():
            msg = Bool()
            msg.data = True
            self.topic_publishers[key].publish(msg)

        self.active_timers[key] = self.create_timer(1.0, publish_true)

        print(f"[START] {topic} -> true, 1Hz 발행 시작")

    def stop_publish(self, key):
        if key not in self.active_timers:
            return

        topic, name = self.topic_map[key]

        self.active_timers[key].cancel()
        del self.active_timers[key]

        print(f"[STOP] {topic}")

    def toggle_publish(self, key):
        if key in self.active_timers:
            self.stop_publish(key)
        else:
            self.start_publish(key)

    def publish_temperature_value_once(self):
        msg = Float32()
        msg.data = float(round(self.current_temperature, 1))
        self.temperature_value_publisher.publish(msg)

    def update_and_publish_temperature_value(self):
        jitter_amp = 0.1 + random.random() * 0.2
        jitter = (random.random() * 2.0 - 1.0) * jitter_amp
        restore = (TEMP_BASE_C - self.current_temperature) * 0.02

        next_temperature = self.current_temperature + jitter + restore
        self.current_temperature = clamp(next_temperature, TEMP_MIN_C, TEMP_MAX_C)

        self.publish_temperature_value_once()

    def start_temperature_value_publish(self):
        if self.temperature_timer is not None:
            return

        self.publish_temperature_value_once()
        self.temperature_timer = self.create_timer(
            TEMP_TIMER_PERIOD_SEC,
            self.update_and_publish_temperature_value
        )

        print(
            f"[START] {TEMP_VALUE_TOPIC} -> Float32, "
            f"{TEMP_TIMER_PERIOD_SEC:.1f}Hz 발행 시작 "
            f"(기준 {TEMP_BASE_C:.1f}°C 주변)"
        )

    def stop_temperature_value_publish(self):
        if self.temperature_timer is None:
            return

        self.temperature_timer.cancel()
        self.temperature_timer = None
        print(f"[STOP] {TEMP_VALUE_TOPIC}")

    def publish_battery_voltage_once(self):
        offset = random.uniform(
            BATTERY_VARIANCE_MIN_V,
            BATTERY_VARIANCE_MAX_V
        )
        voltage = BATTERY_BASE_V + offset

        msg = Float32()
        msg.data = float(round(voltage, 2))
        self.battery_voltage_publisher.publish(msg)

    def start_battery_voltage_publish(self):
        if self.battery_voltage_timer is not None:
            return

        self.publish_battery_voltage_once()
        self.battery_voltage_timer = self.create_timer(
            BATTERY_TIMER_PERIOD_SEC,
            self.publish_battery_voltage_once
        )

        print(
            f"[START] {BATTERY_VOLTAGE_TOPIC} -> Float32, "
            f"{BATTERY_TIMER_PERIOD_SEC:.1f}Hz 발행 시작 "
            f"(기준 {BATTERY_BASE_V:.1f}V, "
            f"+{BATTERY_VARIANCE_MIN_V:.2f}~+{BATTERY_VARIANCE_MAX_V:.2f}V)"
        )

    def stop_battery_voltage_publish(self):
        if self.battery_voltage_timer is None:
            return

        self.battery_voltage_timer.cancel()
        self.battery_voltage_timer = None
        print(f"[STOP] {BATTERY_VOLTAGE_TOPIC}")

    def toggle_battery_voltage_publish(self):
        if self.battery_voltage_timer is None:
            self.start_battery_voltage_publish()
        else:
            self.stop_battery_voltage_publish()

    # =========================================================
    # rosbridge / web_video_server 실행 및 종료 관련 함수
    # =========================================================

    def kill_processes_by_name(self, names):
        for name in names:
            try:
                subprocess.run(
                    ['pkill', '-9', '-f', name],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                print(f"[KILL] {name} 관련 프로세스 강제 종료 시도")
            except Exception as exc:
                print(f"[WARN] {name} pkill 실패: {exc}")

    def kill_process_using_port(self, port):
        try:
            result = subprocess.run(
                ['bash', '-lc', f"lsof -ti :{port}"],
                capture_output=True,
                text=True
            )

            pids = result.stdout.strip().splitlines()

            for pid in pids:
                if pid.strip():
                    subprocess.run(
                        ['kill', '-9', pid.strip()],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL
                    )
                    print(f"[KILL] port {port} 사용 프로세스 종료 pid={pid.strip()}")

        except Exception as exc:
            print(f"[WARN] port {port} 종료 실패: {exc}")

    def _start_process_if_needed(self, process_attr_name, command, display_name):
        current_process = getattr(self, process_attr_name)

        if current_process is not None and current_process.poll() is None:
            print(f"[INFO] {display_name} 이미 실행 중입니다.")
            return

        try:
            process = subprocess.Popen(
                command,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True
            )
            setattr(self, process_attr_name, process)
            print(f"[START] {display_name} 실행 pid={process.pid}")

        except Exception as exc:
            print(f"[ERROR] {display_name} 실행 실패: {exc}")

    def _stop_process_if_running(self, process_attr_name, display_name):
        process = getattr(self, process_attr_name)

        if process is None:
            return

        if process.poll() is not None:
            setattr(self, process_attr_name, None)
            return

        try:
            pgid = os.getpgid(process.pid)

            os.killpg(pgid, signal.SIGINT)
            process.wait(timeout=3.0)
            print(f"[STOP] {display_name} 정상 종료")

        except subprocess.TimeoutExpired:
            try:
                pgid = os.getpgid(process.pid)
                os.killpg(pgid, signal.SIGTERM)
                process.wait(timeout=2.0)
                print(f"[STOP] {display_name} SIGTERM 종료")

            except subprocess.TimeoutExpired:
                try:
                    pgid = os.getpgid(process.pid)
                    os.killpg(pgid, signal.SIGKILL)
                    process.wait(timeout=2.0)
                    print(f"[STOP] {display_name} SIGKILL 강제 종료")

                except Exception as exc:
                    print(f"[WARN] {display_name} SIGKILL 실패: {exc}")

        except ProcessLookupError:
            print(f"[INFO] {display_name} 이미 종료됨")

        except Exception as exc:
            print(f"[WARN] {display_name} 종료 중 오류: {exc}")

        finally:
            setattr(self, process_attr_name, None)

    def start_aux_ros_services(self):
        print("[START] rosbridge / web_video_server 시작 전 기존 프로세스 정리")

        self.kill_processes_by_name([
            'web_video_server',
            'rosbridge_websocket',
            'rosbridge_server'
        ])

        self.kill_process_using_port(8080)
        self.kill_process_using_port(9090)

        time.sleep(0.5)

        self._start_process_if_needed(
            'web_video_server_process',
            ['ros2', 'run', 'web_video_server', 'web_video_server'],
            'web_video_server'
        )

        self._start_process_if_needed(
            'rosbridge_server_process',
            ['ros2', 'run', 'rosbridge_server', 'rosbridge_websocket'],
            'rosbridge_websocket'
        )

    def stop_aux_ros_services(self):
        print("[STOP] rosbridge / web_video_server 종료 시도")

        self._stop_process_if_running(
            'web_video_server_process',
            'web_video_server'
        )

        self._stop_process_if_running(
            'rosbridge_server_process',
            'rosbridge_websocket'
        )

        self.kill_processes_by_name([
            'web_video_server',
            'rosbridge_websocket',
            'rosbridge_server'
        ])

        self.kill_process_using_port(8080)
        self.kill_process_using_port(9090)

        print("[STOP DONE] rosbridge / web_video_server 정리 완료")

    # =========================================================
    # s, a 입력 동작
    # =========================================================

    def start_random_with_battery_voltage_publish(self):
        self.start_aux_ros_services()
        self.start_battery_voltage_publish()
        self.start_random_publish()

    def toggle_random_with_battery_voltage_publish(self):
        is_any_status_active = len(self.active_timers) > 0
        is_battery_active = self.battery_voltage_timer is not None
        is_temperature_active = self.temperature_timer is not None

        rosbridge_active = (
            self.rosbridge_server_process is not None
            and self.rosbridge_server_process.poll() is None
        )

        web_video_active = (
            self.web_video_server_process is not None
            and self.web_video_server_process.poll() is None
        )

        if (
            is_any_status_active
            or is_battery_active
            or is_temperature_active
            or self.random_starting
            or rosbridge_active
            or web_video_active
        ):
            self.stop_all_publish()
        else:
            self.start_random_with_battery_voltage_publish()

    def stop_all_publish(self):
        print("\n[ALL STOP] 모든 활성 토픽 발행 및 보조 프로세스 중지")

        for key in list(self.active_timers.keys()):
            self.stop_publish(key)

        self.stop_temperature_value_publish()
        self.stop_battery_voltage_publish()
        self.stop_aux_ros_services()

        self.random_starting = False

    def start_random_publish(self):
        if self.random_starting:
            print("[INFO] 이미 랜덤 발행 시작 중입니다.")
            return

        all_keys = list(self.topic_map.keys())

        inactive_keys = [
            key for key in all_keys
            if key not in self.active_timers
        ]

        if not inactive_keys:
            print("[INFO] 모든 토픽이 이미 발행 중입니다.")
            return

        print("\n[RANDOM START] 상태 토픽을 랜덤으로 선택하여 발행 시작")
        self.start_temperature_value_publish()

        def random_start_worker():
            self.random_starting = True

            remaining_keys = [
                key for key in all_keys
                if key not in self.active_timers
            ]

            while remaining_keys and rclpy.ok() and self.random_starting:
                delay_time = random.uniform(0.1, 0.5)
                time.sleep(delay_time)

                key = random.choice(remaining_keys)
                remaining_keys.remove(key)

                topic, name = self.topic_map[key]

                print(f"[RANDOM DELAY {delay_time:.2f}s] {topic} 선택됨")

                self.start_publish(key)

            self.random_starting = False
            print("[RANDOM START DONE] 랜덤 발행 시작 완료")

        thread = threading.Thread(target=random_start_worker, daemon=True)
        thread.start()

    def toggle_all_random(self):
        if len(self.active_timers) > 0 or self.random_starting:
            self.stop_all_publish()
        else:
            self.start_random_publish()


def input_thread(node):
    while rclpy.ok():
        try:
            user_input = input("\n번호 입력: ").strip().lower()
        except EOFError:
            node.stop_all_publish()
            rclpy.shutdown()
            break

        if user_input == 'q':
            node.stop_all_publish()
            rclpy.shutdown()
            break

        if user_input == 'a':
            node.toggle_all_random()
            continue

        if user_input == 's':
            node.toggle_random_with_battery_voltage_publish()
            continue

        user_input = node.input_aliases.get(user_input, user_input)

        if user_input in node.topic_map:
            node.toggle_publish(user_input)
        else:
            print("잘못된 입력입니다. 1, 2, 3, 5, motor, a, s 또는 q를 입력하세요.")


def main(args=None):
    rclpy.init(args=args)

    node = StatusTopicController()

    thread = threading.Thread(target=input_thread, args=(node,), daemon=True)
    thread.start()

    try:
        rclpy.spin(node)

    except KeyboardInterrupt:
        print("\n[CTRL+C] 종료 요청 감지")

    finally:
        node.stop_all_publish()
        node.destroy_node()

        if rclpy.ok():
            rclpy.shutdown()


if __name__ == '__main__':
    main()
