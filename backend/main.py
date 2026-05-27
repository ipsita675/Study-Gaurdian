import cv2
import math
import numpy as np
import base64
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from ultralytics import YOLO
import mediapipe as mp

# ==========================================
# 1. INITIALIZATION 
# ==========================================
app = FastAPI(title="Study Guardian API")

yolo_model = YOLO('models/yolov8n.pt') 

mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

COCO_CELL_PHONE_CLASS_ID = 67  
DISTRACTION_THRESHOLD = 20  

# MediaPipe exact eye landmark indices
LEFT_EYE_INDICES = [33, 160, 158, 133, 153, 144]
RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380]

# ==========================================
# 2. HELPER FUNCTIONS
# ==========================================
def calculate_ear(landmarks, eye_indices):
    """Calculates the Eye Aspect Ratio (EAR) based on the Soukupová paper."""
    p1 = landmarks[eye_indices[0]]
    p2 = landmarks[eye_indices[1]]
    p3 = landmarks[eye_indices[2]]
    p4 = landmarks[eye_indices[3]]
    p5 = landmarks[eye_indices[4]]
    p6 = landmarks[eye_indices[5]]
    
    # Vertical distances across the eye
    v1 = math.hypot(p2.x - p6.x, p2.y - p6.y)
    v2 = math.hypot(p3.x - p5.x, p3.y - p5.y)
    
    # Horizontal distance across the eye
    h = math.hypot(p1.x - p4.x, p1.y - p4.y)
    
    # Calculate and return EAR
    ear = (v1 + v2) / (2.0 * h + 1e-6)
    return ear

def check_focus_state(landmarks):
    """Checks for distraction using Eye Aspect Ratio (Down/Closed) and Yaw (Left/Right)."""
    
    # 1. EYE ASPECT RATIO (Catches Looking Down & Closed Eyes)
    left_ear = calculate_ear(landmarks, LEFT_EYE_INDICES)
    right_ear = calculate_ear(landmarks, RIGHT_EYE_INDICES)
    avg_ear = (left_ear + right_ear) / 2.0
    
    # Threshold usually ~0.20 to 0.25. If it drops below, eyelids are lowered!
    eyes_closed_or_down = avg_ear < 0.22 

    # 2. YAW (Looking Left/Right)
    nose = landmarks[1]
    left_head = landmarks[234] 
    right_head = landmarks[454] 
    
    dist_left = math.hypot(nose.x - left_head.x, nose.y - left_head.y)
    dist_right = math.hypot(nose.x - right_head.x, nose.y - right_head.y)
    yaw_ratio = dist_left / (dist_right + 1e-6)
    
    # TIGHTENED THRESHOLDS: Now a slight head turn triggers it
    looking_away = yaw_ratio < 0.75 or yaw_ratio > 1.25

    return eyes_closed_or_down or looking_away

# ==========================================
# 3. WEBSOCKET ENDPOINT
# ==========================================
@app.websocket("/ws/vision")
async def vision_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("[INFO] Client connected to Vision stream.")
    
    distraction_frames = 0

    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            
            base64_string = payload.get("frame", "")
            if not base64_string:
                continue

            encoded_data = base64_string.split(',')[1] if ',' in base64_string else base64_string
            nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            phone_detected = False
            head_distracted = False

            # YOLOv8 Phone Detection
            results = yolo_model(frame, verbose=False)
            for box in results[0].boxes:
                if int(box.cls[0]) == COCO_CELL_PHONE_CLASS_ID and float(box.conf[0]) > 0.50:
                    phone_detected = True

            # MediaPipe Face & Eye Tracking
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            fm_results = face_mesh.process(rgb_frame)

            if fm_results.multi_face_landmarks:
                for face_landmarks in fm_results.multi_face_landmarks:
                    if check_focus_state(face_landmarks.landmark):
                        head_distracted = True
            else:
                # If no face is found at all, user walked away
                head_distracted = True

            # State Tracker
            is_distracted = phone_detected or head_distracted

            if is_distracted:
                distraction_frames += 1
                if distraction_frames > DISTRACTION_THRESHOLD:
                    distraction_frames = DISTRACTION_THRESHOLD
            else:
                distraction_frames = 0 

            # Send update to Frontend
            await websocket.send_json({
                "is_distracted": is_distracted,
                "distraction_level": distraction_frames,
                "max_threshold": DISTRACTION_THRESHOLD
            })

    except WebSocketDisconnect:
        print("[INFO] Client disconnected.")
    except Exception as e:
        print(f"[ERROR] WebSocket error: {e}")