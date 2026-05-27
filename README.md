# Study Guardian

> **Do you have a bad habit of doom-scrolling Reels while you are supposed to be working? Yeah, me neither. But just in case, I built this.**

A real-time, full-stack computer vision application designed to eliminate study distractions. It uses a dual-trigger AI pipeline to track user focus and automatically blasts an in-browser alarm when phone usage or downward gazing is detected.

---

## Project Architecture

This project is built using a decoupled Client-Server monorepo architecture.

```text
deep-focus-guardian/
│
├── backend/                  # Python, FastAPI, & Computer Vision
│   ├── models/
│   │   └── yolov8n.pt        # YOLOv8 Nano Weights
│   ├── main.py               # Core WebSocket & Vision logic
│   └── requirements.txt      # Python dependencies
│
├── frontend/                 # Next.js, React, & Tailwind CSS
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx          # Main UI and Webcam/Audio logic
│   ├── public/
│   │   └── FAAH.mp3         # The distraction alarm audio
│   ├── package.json
│   └── tailwind.config.js
│
└── README.md
```

## The Tech Stack

Communication happens in real-time via WebSockets to ensure zero-lag computer vision inference without freezing the UI thread.

- **Frontend:** Next.js, React, Tailwind CSS, HTML5 Audio API
- **Backend:** Python, FastAPI, WebSockets
- **Computer Vision:** OpenCV, MediaPipe (FaceMesh), Ultralytics YOLOv8 Nano

---

## The Mathematics Behind the AI

Instead of relying on heavy third-party facial recognition wrappers, this project calculates geometric distances using `math.hypot` (Euclidean distance) on raw MediaPipe 3D landmarks.

### 1. Eye Aspect Ratio (EAR) - Catching closed eyes & downward gaze

The system calculates the physical distance between the eyelids. If you look down at a phone in your lap, your eyelids naturally lower, causing the EAR to drop without requiring a full neck bend.

<img width="810" height="538" alt="Screenshot 2026-05-28 at 1 40 06 AM" src="https://github.com/user-attachments/assets/d8b3315e-f990-44ec-8134-60956f215632" />



$$EAR = \frac{||p_2 - p_6|| + ||p_3 - p_5||}{2 ||p_1 - p_4||}$$

_If the calculated EAR drops below `0.22`, the system flags a downward gaze._

### 2. Head Yaw Tracking - Catching looking away

To track if a user turns their head to watch TV or look away from the screen, the system measures the Euclidean distance from the tip of the nose to the left and right ears.

$$Yaw  Ratio = \frac{Distance(Nose, Left Ear)}{Distance(Nose, Right Ear)}$$

_A user looking straight ahead yields a ratio of ~`1.0`. The system triggers the distraction alarm if the ratio drops below `0.75` or spikes above `1.25`._

### 3. Object Detection - Catching the phone

Runs YOLOv8n inference on incoming WebSocket frames to explicitly detect the `cell phone` (Class `67` in the COCO dataset) with a bounding box confidence threshold of `> 0.50`.

---

## How to Run Locally

### Prerequisites

Before you begin, ensure you have the following installed on your machine:

- [Python 3.10+](https://www.python.org/downloads/)
- [Node.js 18+](https://nodejs.org/en) (which includes `npm`)

### 1. Start the Python Backend

The backend uses FastAPI to open a WebSocket tunnel and run the computer vision models. Open your terminal:

```bash
cd backend
python -m venv venv

# Activate the virtual environment
source venv/bin/activate      # On macOS/Linux
# .\venv\Scripts\activate     # On Windows

# Install required libraries
pip install fastapi uvicorn websockets python-multipart opencv-python ultralytics mediapipe numpy

# Start the FastAPI server
uvicorn main:app --reload
```

_The API will listen at `ws://127.0.0.1:8000/ws/vision`. Leave this terminal open._

### 2. Start the Next.js Frontend

The frontend captures your webcam feed, controls the audio alarm, and streams frames to the backend. Open a **second, new terminal window**:

```bash
cd frontend
npm install
npm run dev
```

_Open http://localhost:3000 in your web browser. Click "Start Guardian Mode" to initialize your camera and begin tracking!_
