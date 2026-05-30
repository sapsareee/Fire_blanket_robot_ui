import rclpy
from rclpy.node import Node
from std_msgs.msg import Bool
import threading
import random
import time


class StatusTopicController(Node):
    def __init__(self):
        super().__init__('status_topic_controller')

        self.topic_map = {
            '1': ('/autonomy/status', 'Autonomy'),
            '2': ('/thermal_camera/status', 'Thermal Camera'),
            '3': ('/vision_sensor/status', 'Vision Sensor'),
            '4': ('/battery_sensor/status', 'Battery Sensor'),
            '5': ('/motor/status', '모터 상태'),
            '6': ('/temperature_sensor/status', 'Temperature Sensor'),
        }

        self.input_aliases = {
            'motor': '5',
        }

        self.topic_publishers = {}
        self.active_timers = {}

        # a 실행 중복 방지용
        self.random_starting = False

        for key, (topic, name) in self.topic_map.items():
            self.topic_publishers[key] = self.create_publisher(Bool, topic, 10)

        self.print_menu()

    def print_menu(self):
        print("\n===== Status Topic Controller =====")
        print("1: /autonomy/status true 발행/중지")
        print("2: /thermal_camera/status true 발행/중지")
        print("3: /vision_sensor/status true 발행/중지")
        print("4: /battery_sensor/status true 발행/중지")
        print("5: /motor/status true 발행/중지")
        print("6: /temperature_sensor/status true 발행/중지")
        print("a: 1~6 토픽을 랜덤 선택 + 0.1~0.5초 간격으로 발행 시작/전체 중지")
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

        # 켜지는 순간 바로 1회 발행
        self.publish_once(key)

        def publish_true():
            msg = Bool()
            msg.data = True
            self.topic_publishers[key].publish(msg)

        # 이후 1Hz로 계속 발행
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

    def stop_all_publish(self):
        print("\n[ALL STOP] 모든 활성 토픽 발행 중지")

        for key in list(self.active_timers.keys()):
            self.stop_publish(key)

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

        print("\n[RANDOM START] 1~6 토픽을 랜덤으로 선택하여 발행 시작")

        def random_start_worker():
            self.random_starting = True

            remaining_keys = [
                key for key in all_keys
                if key not in self.active_timers
            ]

            while remaining_keys and rclpy.ok() and self.random_starting:
                delay_time = random.uniform(0.1, 0.5)
                time.sleep(delay_time)

                # 남아있는 토픽 중 하나를 랜덤 선택
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
        # 하나라도 켜져 있으면 a 입력 시 전체 중지
        if len(self.active_timers) > 0 or self.random_starting:
            self.stop_all_publish()
        else:
            self.start_random_publish()


def input_thread(node):
    while rclpy.ok():
        user_input = input("\n번호 입력: ").strip().lower()

        if user_input == 'q':
            rclpy.shutdown()
            break

        if user_input == 'a':
            node.toggle_all_random()
            continue

        user_input = node.input_aliases.get(user_input, user_input)

        if user_input in node.topic_map:
            node.toggle_publish(user_input)
        else:
            print("잘못된 입력입니다. 1~6, motor, a 또는 q를 입력하세요.")


def main(args=None):
    rclpy.init(args=args)

    node = StatusTopicController()

    thread = threading.Thread(target=input_thread, args=(node,), daemon=True)
    thread.start()

    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass

    node.destroy_node()

    if rclpy.ok():
        rclpy.shutdown()


if __name__ == '__main__':
    main()