"use client";

import { useRef, useState } from "react";

export default function Home() {
  const [isTracking, setIsTracking] = useState(false);
  const [distractionLevel, setDistractionLevel] = useState(0);
  const [maxThreshold, setMaxThreshold] = useState(40);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null); 
  const wsRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isConnecting, setIsConnecting] = useState(false);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      return true; 
    } catch (err) {
      console.error("Camera access denied:", err);
      alert("Please allow camera access to use the Study Guardian.");
      return false;
    }
  };

  const startTracking = async () => {
    setIsConnecting(true); 

    const cameraReady = await startCamera();
    if (!cameraReady) {
      setIsConnecting(false);
      return;
    }

    wsRef.current = new WebSocket("ws://127.0.0.1:8000/ws/vision");

    wsRef.current.onopen = () => {
      console.log("Connected to Python Vision Server!");
      setIsTracking(true);
      setIsConnecting(false); 

      intervalRef.current = setInterval(() => {
        captureAndSendFrame();
      }, 200);
    };

    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setDistractionLevel(data.distraction_level);
      if (data.max_threshold) setMaxThreshold(data.max_threshold);

      if (data.distraction_level >= data.max_threshold) {
        if (audioRef.current && audioRef.current.paused) {
          audioRef.current.play().catch(e => console.log("Audio block:", e));
        }
      } else {
        if (audioRef.current && !audioRef.current.paused) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0; 
        }
      }
    };

    wsRef.current.onclose = () => {
      console.log("Disconnected from server.");
      stopTracking();
    };
  };
 
  const stopTracking = () => {
    setIsTracking(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (wsRef.current) wsRef.current.close();
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
    }
    setDistractionLevel(0);
    
    if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
    }
  };

  const captureAndSendFrame = () => {
    if (videoRef.current && canvasRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      const video = videoRef.current;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context?.drawImage(video, 0, 0, canvas.width, canvas.height);

      const base64Frame = canvas.toDataURL("image/jpeg", 0.5); 

      wsRef.current.send(
        JSON.stringify({
          frame: base64Frame,
        })
      );
    }
  };

  return (
    <main className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8">
      <audio ref={audioRef} src="/FAAH.mp3" loop />

      <div className="max-w-2xl w-full bg-gray-800 rounded-xl shadow-2xl p-8 space-y-6">
        
        <div className="text-center">
          <h1 className="text-4xl font-bold text-blue-400 mb-2">Study Guardian</h1>
          <p className="text-gray-400">Put your phone away. Or I'll will yell at you.</p>
        </div>

      
        {!isTracking ? (
          <button
            onClick={startTracking}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-lg transition-colors"
          >
            Start Guardian Mode
          </button>
        ) : (
          <button
            onClick={stopTracking}
            className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-4 rounded-lg transition-colors"
          >
            Stop Guardian Mode
          </button>
        )}

        <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-gray-700">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${!isTracking ? "hidden" : ""}`}
          />
          {!isTracking && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500">
              Camera Offline
            </div>
          )}
          
         
          {distractionLevel >= maxThreshold && (
            <div className="absolute top-4 left-4 right-4 bg-red-500/90 text-white text-center py-2 rounded-lg font-bold animate-pulse">
              DISTRACTION DETECTED! Look up!
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm font-medium text-gray-400">
            <span>Focus Level</span>
            <span>Alarm Trigger: {Math.min(100, Math.round((distractionLevel / maxThreshold) * 100))}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
            <div
              className={`h-4 transition-all duration-200 ${distractionLevel >= maxThreshold ? 'bg-red-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(100, (distractionLevel / maxThreshold) * 100)}%` }}
            ></div>
          </div>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </main>
  );
}