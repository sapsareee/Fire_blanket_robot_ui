# Fire Robot UI

`fire-robot-ui`는 ROS2 기반 화재 대응 로봇의 카메라 영상, 센서 값, 모듈 연결 상태와 경고 이벤트를 한 화면에서 확인하기 위한 웹 모니터링 대시보드입니다.

이 문서는 `robot_ui_ws/fire-robot-ui`의 현재 구현을 기준으로 작성되었습니다.

> 이 UI는 현재 **모니터링 전용**입니다. ROS 토픽을 구독하지만 로봇 제어 명령을 발행하지 않습니다.

## 1. UI 설계 목적

화재 현장에서 운용되는 로봇은 열화상·RGB 영상, 화재 감지 결과, 배터리와 내부 온도, 자율주행 및 모터 상태를 동시에 확인해야 합니다. 이 UI는 운영자가 다음 내용을 빠르게 판단할 수 있도록 설계되었습니다.

- ROS Bridge와 로봇 모듈이 정상적으로 연결되어 있는지
- 열화상 및 전면 RGB 영상이 정상적으로 들어오는지
- 화재가 감지되었는지, 열화상 최고 온도가 위험 수준인지
- 배터리 전압과 계산된 잔량이 충분한지
- 로봇 내부 온도가 정상 범위인지
- 센서나 모듈의 연결·해제·timeout 이벤트가 언제 발생했는지

화면은 어두운 관제용 테마와 상태별 색상을 사용합니다.

- 초록색: 정상 또는 연결됨
- 노란색: 연결 중, 주의 또는 온도 상승
- 빨간색: 연결 끊김, 낮은 배터리 또는 경고
- 회색: 아직 데이터가 없거나 상태를 확인할 수 없음

## 2. 기술 구성

| 구분 | 내용 |
| --- | --- |
| 프런트엔드 | React 19 |
| 개발·빌드 도구 | Vite 7 |
| 스타일 | Tailwind CSS 4 |
| ROS 웹 연동 | roslib 2 |
| ROS 연결 방식 | rosbridge WebSocket |
| 영상 연결 방식 | `web_video_server`의 MJPEG HTTP 스트림 |

기본 통신 구조는 다음과 같습니다.

```text
ROS2 상태·센서 토픽
        │
        ▼
rosbridge_server :9090 ── WebSocket ──┐
                                      │
ROS2 Image 토픽                       ├── Fire Robot UI (브라우저)
        │                             │
        ▼                             │
web_video_server :8080 ── HTTP/MJPEG ─┘
```

## 3. 화면에서 확인할 수 있는 내용

### Home

전체 운용 상태를 한 화면에서 확인하는 기본 대시보드입니다.

- Thermal Cam
  - `/thermal/image` 열화상 스트림
  - `/thermal/max_temperature`에서 받은 최고 온도
  - 스트림 연결 상태
- Autonomous Path
  - `/autonomy/status`에 따라 표시 여부 결정
  - 현재 구현에서는 실제 Nav2 화면이 아니라 프로젝트에 포함된 `nav_canva.mp4` 샘플 영상을 재생
- Front RGB
  - `/rgb/image_raw` 전면 RGB 스트림
  - 스트림 연결 상태
- Battery
  - 배터리 전압
  - 10.5~11.5 V 범위를 기준으로 계산한 잔량(%)
  - 최근 전압 변화 그래프
- Temperature
  - 로봇 내부 온도
  - 최근 온도 변화 그래프
  - 그래프 갱신 주기 및 표시 구간 조절
- Sensor Connection Status
  - ROS Bridge, 자율주행, 열화상, RGB 카메라, 배터리, 모터, 온도센서, 화재 감지 상태
- Trigger Log
  - 연결, 연결 해제, timeout, 고온 및 화재 감지 이벤트

### 이벤트 로그

이벤트를 넓은 카드 형태로 확인하는 화면입니다.

- `INFO`: 연결 성공, 정상 상태 복귀 등
- `WARN`: 연결 해제, timeout, 고온 경고 등
- `ALERT`: 화재 감지
- 최대 200개 이벤트를 브라우저 메모리에 보관

이벤트는 서버나 파일에 저장되지 않으므로 페이지를 새로고침하면 초기화됩니다.

### 시스템 개요

배터리 및 온도 상태와 전체 연결 상태를 집중해서 확인하는 화면입니다.

- 배터리 전압, 환산 잔량 및 최근 추이
- 로봇 내부 온도 및 최근 추이
- `/thermal/temperature_trend` 값
- 모듈별 연결 상태
- 화재 감지 상태

## 4. ROS 토픽 요구조건

토픽 이름과 메시지 타입은 아래 표와 정확히 일치해야 합니다.

### 상태 토픽

상태 토픽은 모두 `std_msgs/msg/Bool`입니다. `true`는 정상 연결, `false`는 비정상 또는 연결 해제를 의미합니다.

| 토픽 | 타입 | 용도 |
| --- | --- | --- |
| `/autonomy/status` | `std_msgs/msg/Bool` | 자율주행 모듈 상태 및 Autonomous Path 카드 활성화 |
| `/thermal_camera/status` | `std_msgs/msg/Bool` | 열화상 카메라 상태 및 열화상 스트림 활성화 |
| `/vision_sensor/status` | `std_msgs/msg/Bool` | RGB 카메라 상태 및 RGB 스트림 활성화 |
| `/battery_sensor/status` | `std_msgs/msg/Bool` | 배터리 센서 연결 상태 |
| `/motor/status` | `std_msgs/msg/Bool` | 모터 모듈 연결 상태 |
| `/temperature_sensor/status` | `std_msgs/msg/Bool` | 로봇 온도센서 연결 상태 |
| `/thermal/fire_detected` | `std_msgs/msg/Bool` | 화재 감지 여부. `true`이면 ALERT 발생 |

상태 토픽은 단발성으로 한 번만 발행하면 4초 후 timeout으로 처리됩니다. UI가 정상 연결 상태를 유지하려면 4초보다 짧은 주기로 계속 발행해야 하며, 1 Hz 이상을 권장합니다.

### 수치 토픽

| 토픽 | 타입 | 단위/용도 |
| --- | --- | --- |
| `/battery_voltage` | `std_msgs/msg/Float32` | 배터리 전압(V), 잔량 및 추이 계산 |
| `/robot/internal_temperature` | `std_msgs/msg/Float32` | 로봇 내부 온도(°C), 상태 및 추이 표시 |
| `/thermal/temperature_trend` | `std_msgs/msg/Float32` | 열화상 온도 변화율. UI에서는 °C/s로 표시 |
| `/thermal/max_temperature` | `std_msgs/msg/Float32` | 열화상 화면의 최고 온도(°C) |

수치 및 화재 감지 데이터도 4초 이상 새 메시지가 없으면 `NO DATA`, `UNKNOWN` 또는 timeout 상태가 됩니다.

### 영상 토픽

| 토픽 | 예상 내용 | UI 표시 방식 |
| --- | --- | --- |
| `/thermal/image` | ROS2 열화상 `sensor_msgs/msg/Image` | `web_video_server` MJPEG 스트림 |
| `/rgb/image_raw` | ROS2 RGB `sensor_msgs/msg/Image` | `web_video_server` MJPEG 스트림 |

현재 Autonomous Path 카드는 ROS 영상 토픽을 사용하지 않습니다. 실제 Nav2 지도나 경로 화면을 표시하려면 별도의 영상·지도 시각화 방식과 UI 코드 수정이 필요합니다.

## 5. 주요 동작 기준

### 연결 및 timeout

- 토픽 timeout 기준: 4초
- timeout 검사 주기: 1초
- 상태 토픽은 메시지 수신 중이고 값이 `true`일 때만 `CONNECTED`
- rosbridge 연결이 끊기면 기존 연결에서 받은 데이터는 유효하지 않은 것으로 처리
- rosbridge는 1, 2, 4, 8, 16, 최대 30초 간격으로 자동 재연결
- 사이드바의 재연결 버튼으로 rosbridge 수동 재연결 가능
- 열화상과 RGB 스트림은 연결 실패 중 3초마다 다시 로드
- 각 스트림 카드의 재연결 버튼으로 수동 재로드 가능

### 경고 기준

| 항목 | 기준 | 표시/이벤트 |
| --- | --- | --- |
| 배터리 잔량 | 20% 미만 | `LOW`, 빨간색 |
| 내부 온도 | 40°C 미만 | `NORMAL` |
| 내부 온도 | 40°C 이상 45°C 미만 | `WARM`, 노란색 |
| 내부 온도 | 45°C 이상 | `HOT`, 빨간색 |
| 열화상 최고 온도 | 80°C 이상 | 고온 `WARN` 이벤트 |
| 화재 감지 | `/thermal/fire_detected = true` | `ALERT` 이벤트 |

배터리 잔량은 다음 고정 범위를 사용해 선형 계산됩니다.

```text
10.5 V = 0%
11.5 V = 100%
```

로봇의 실제 배터리 사양과 방전 곡선이 다르면 코드의 전압 범위를 조정해야 합니다.

### 그래프

- 배터리와 내부 온도 이력을 각각 최대 240개까지 메모리에 유지
- 센서 메시지를 받을 때마다 새 측정값을 이력에 추가
- 선택 가능한 갱신 주기: 500 ms, 1000 ms, 2000 ms
- 새 메시지 사이에서도 데이터가 아직 timeout되지 않았다면 선택한 주기에 맞춰 마지막 값을 그래프에 추가
- 표시 구간: 최근 16, 32, 64, 120개 지점
- 페이지를 새로고침하면 그래프 이력 초기화

## 6. 실행 요구사항

### 필수 소프트웨어

- ROS2
- `rosbridge_suite`
- `web_video_server`
- 상태·센서·영상 토픽을 발행하는 로봇 노드
- Node.js `20.19.0` 이상 또는 `22.12.0` 이상
- npm
- WebSocket과 MJPEG를 지원하는 최신 브라우저

ROS 패키지가 설치되어 있지 않다면 ROS 환경을 먼저 불러온 후 설치합니다.

```bash
source /opt/ros/<ROS_DISTRO>/setup.bash
sudo apt update
sudo apt install "ros-${ROS_DISTRO}-rosbridge-suite" \
  "ros-${ROS_DISTRO}-web-video-server"
```

`<ROS_DISTRO>`는 `humble`, `jazzy`처럼 설치된 ROS2 배포판 이름으로 바꿉니다. 첫 번째 `source` 명령에도 실제 배포판 이름을 사용해야 합니다.

### 네트워크 요구조건

기본 포트는 다음과 같습니다.

| 포트 | 서비스 |
| --- | --- |
| `5173/TCP` | Vite 개발 서버 |
| `4173/TCP` | Vite preview 서버 |
| `9090/TCP` | rosbridge WebSocket |
| `8080/TCP` | web_video_server |

다른 PC의 브라우저에서 접속한다면 해당 포트가 방화벽과 네트워크에서 접근 가능해야 합니다.

## 7. 개발 모드 실행 방법

아래 서비스들은 각각 별도의 터미널에서 실행합니다.

### 1) ROS2 환경 준비

```bash
source /opt/ros/<ROS_DISTRO>/setup.bash
```

별도의 ROS2 워크스페이스에 로봇 패키지가 있다면 overlay도 불러옵니다.

```bash
source /path/to/your_ros2_ws/install/setup.bash
```

### 2) 로봇 노드 실행

상태·센서·영상 토픽을 발행하는 실제 로봇 노드 또는 테스트 노드를 실행합니다.

```bash
ros2 launch <robot_package> <robot_launch_file>
```

패키지와 launch 파일 이름은 사용하는 로봇 시스템에 맞게 변경합니다.

### 3) rosbridge 실행

```bash
ros2 launch rosbridge_server rosbridge_websocket_launch.xml
```

기본적으로 `9090` 포트에서 WebSocket 연결을 받습니다.

### 4) 영상 스트리밍 서버 실행

```bash
ros2 run web_video_server web_video_server
```

기본적으로 `8080` 포트에서 `/thermal/image`와 `/rgb/image_raw`를 HTTP/MJPEG로 제공합니다.

### 5) UI 의존성 설치

```bash
cd /home/hyun/dev/repos/robot_ui_ws/fire-robot-ui
npm ci
```

`package-lock.json`을 사용하지 않는 개발 상황이라면 `npm install`도 사용할 수 있습니다.

### 6) UI 개발 서버 실행

```bash
npm run dev
```

브라우저에서 다음 주소로 접속합니다.

```text
http://localhost:5173
```

Vite 서버는 모든 네트워크 인터페이스에서 접속할 수 있도록 설정되어 있습니다. 다른 PC에서는 다음과 같이 UI 실행 PC의 IP를 사용합니다.

```text
http://<UI_PC_IP>:5173
```

## 8. ROS 및 영상 서버 주소 설정

별도 설정이 없으면 UI는 브라우저 주소의 hostname을 ROS 및 영상 서버 hostname으로 사용합니다.

예를 들어 브라우저에서 `http://192.168.0.20:5173`으로 접속하면 기본 연결 주소는 다음과 같습니다.

```text
ws://192.168.0.20:9090
http://192.168.0.20:8080
```

UI 서버와 ROS 서버가 서로 다른 장비에 있다면 `fire-robot-ui/.env.local`을 생성합니다.

```dotenv
VITE_ROS_HOST=192.168.0.30
VITE_ROSBRIDGE_PORT=9090
VITE_VIDEO_HOST=192.168.0.30
VITE_VIDEO_PORT=8080
```

환경변수 변경 후에는 Vite 서버를 다시 실행해야 합니다.

| 환경변수 | 기본값 | 설명 |
| --- | --- | --- |
| `VITE_ROS_HOST` | 브라우저 현재 hostname | rosbridge 서버 주소 |
| `VITE_ROSBRIDGE_PORT` | `9090` | rosbridge 포트 |
| `VITE_VIDEO_HOST` | 브라우저 현재 hostname | web_video_server 주소 |
| `VITE_VIDEO_PORT` | `8080` | 영상 서버 포트 |

페이지가 HTTPS로 서비스되면 UI는 자동으로 `wss://`와 `https://`를 사용합니다. 이 경우 rosbridge와 영상 서버도 TLS를 지원하거나 TLS reverse proxy 뒤에서 제공되어야 합니다.

## 9. 빌드 및 배포

### 정적 파일 빌드

```bash
cd /home/hyun/dev/repos/robot_ui_ws/fire-robot-ui
npm ci
npm run build
```

빌드 결과는 `fire-robot-ui/dist/`에 생성됩니다. `dist/`를 Nginx, Apache 또는 다른 정적 웹 서버로 배포할 수 있습니다.

Vite 환경변수는 런타임이 아니라 **빌드 시점**에 결과물에 포함됩니다. 운영 서버 주소가 개발 환경과 다르면 올바른 `.env` 값을 설정한 후 다시 빌드해야 합니다.

### 빌드 결과 로컬 확인

```bash
npm run preview
```

브라우저에서 다음 주소로 접속합니다.

```text
http://localhost:4173
```

### 코드 검사

```bash
npm run lint
```

## 10. 연결 상태 점검

### 토픽 존재 여부

```bash
ros2 topic list
```

### 메시지 타입 확인

```bash
ros2 topic info /autonomy/status
ros2 topic info /battery_voltage
ros2 topic info /thermal/image
```

### 발행 주기 확인

```bash
ros2 topic hz /autonomy/status
ros2 topic hz /battery_voltage
ros2 topic hz /thermal/image
```

### 메시지 내용 확인

```bash
ros2 topic echo /thermal/fire_detected
ros2 topic echo /thermal/max_temperature
```

### rosbridge 포트 확인

```bash
ss -lnt | grep 9090
```

### 영상 URL 직접 확인

다음 URL을 브라우저에 직접 입력했을 때 영상이 보여야 합니다.

```text
http://<VIDEO_HOST>:8080/stream?topic=/thermal/image&type=mjpeg&quality=70&qos_profile=sensor_data
http://<VIDEO_HOST>:8080/stream?topic=/rgb/image_raw&qos_profile=sensor_data
```

## 11. 간단한 토픽 테스트

실제 로봇 노드 없이 UI 연결 상태와 수치 표시를 점검하려면 별도의 터미널에서 테스트 메시지를 발행할 수 있습니다.

```bash
ros2 topic pub -r 1 /autonomy/status std_msgs/msg/Bool "{data: true}"
```

```bash
ros2 topic pub -r 1 /battery_sensor/status std_msgs/msg/Bool "{data: true}"
```

```bash
ros2 topic pub -r 2 /battery_voltage std_msgs/msg/Float32 "{data: 11.2}"
```

```bash
ros2 topic pub -r 2 /robot/internal_temperature std_msgs/msg/Float32 "{data: 38.5}"
```

```bash
ros2 topic pub -r 1 /thermal/fire_detected std_msgs/msg/Bool "{data: false}"
```

각 명령은 계속 메시지를 발행하므로 테스트 후 `Ctrl+C`로 종료합니다. 영상 카드는 실제 `/thermal/image` 또는 `/rgb/image_raw` publisher가 있어야 표시됩니다.

## 12. 문제 해결

### ROS Bridge가 연결되지 않는 경우

- `rosbridge_server`가 실행 중인지 확인
- 브라우저 개발자 도구에서 WebSocket 오류 확인
- `VITE_ROS_HOST`와 `VITE_ROSBRIDGE_PORT` 확인
- `9090/TCP` 방화벽 확인
- UI가 HTTPS라면 rosbridge도 WSS로 제공되는지 확인

### 모듈이 계속 DISCONNECTED인 경우

- 토픽 이름과 메시지 타입 확인
- 상태 토픽이 `true`를 발행하는지 확인
- 메시지가 4초보다 짧은 주기로 반복 발행되는지 확인
- UI가 연결된 ROS Domain과 로봇 노드의 `ROS_DOMAIN_ID`가 일치하는지 확인

### 영상이 표시되지 않는 경우

- `web_video_server` 실행 여부 확인
- 영상 토픽이 실제로 발행되는지 `ros2 topic hz`로 확인
- 영상 URL을 브라우저에서 직접 열어 확인
- `/thermal_camera/status` 또는 `/vision_sensor/status`가 `true`인지 확인
- `VITE_VIDEO_HOST`, `VITE_VIDEO_PORT`와 `8080/TCP` 방화벽 확인
- HTTPS 페이지에서 HTTP 영상에 접근하는 mixed-content 문제가 없는지 확인

### 값이 잠시 표시된 후 NO DATA가 되는 경우

센서 데이터가 한 번만 발행되었거나 발행 주기가 4초보다 느린 경우입니다. 센서 노드가 4초 이내의 주기로 지속해서 발행하도록 설정합니다.

## 13. 현재 구현 범위와 제한사항

- 모니터링 전용이며 로봇 이동, 정지, 소화 장치 등의 제어 기능은 없음
- Autonomous Path는 실제 Nav2 데이터가 아닌 로컬 샘플 MP4 사용
- 이벤트와 그래프 이력은 브라우저 메모리에만 저장
- 사용자 로그인, 권한 관리 및 접근 제어 없음
- 서버 측 데이터베이스나 로그 저장 API 없음
- 배터리 환산 범위와 온도 임계값이 코드에 고정됨
- 토픽 이름과 메시지 타입이 코드에 고정됨
- ROS 및 영상 서버 주소만 Vite 환경변수로 변경 가능

실제 현장 운용을 위해서는 로봇 사양에 맞는 배터리 보정, 이벤트 영구 저장, 사용자 인증, 실제 Nav2 시각화, 제어 기능의 안전 인터록 및 네트워크 보안 구성을 별도로 검토해야 합니다.

## 14. 주요 소스 구조

```text
fire-robot-ui/
├── package.json
├── vite.config.js
└── src/
    ├── FireRobotDashboard.jsx       # 전체 화면과 탭별 구성
    ├── DashboardLayout.jsx          # 헤더, 메뉴, 시계, 재연결 버튼
    ├── StreamCard.jsx               # 열화상/RGB/자율주행 스트림 카드
    ├── SensorChart.jsx              # 배터리/온도 게이지와 추이
    ├── ConnectionPanel.jsx          # ROS 및 모듈 연결 상태
    ├── EventLogPanel.jsx            # 이벤트 로그
    └── hooks/
        ├── useRosBridge.js          # rosbridge 연결과 자동 재연결
        ├── useRobotSensors.js       # ROS 토픽 구독, timeout, 이력
        └── useFireRobotDashboard.js # 스트림, 센서, 이벤트 통합
```
