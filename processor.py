"""WebRTC frame processor: video stays smooth while decoding runs on a worker thread."""
from __future__ import annotations

import threading
import time

import av
import numpy as np
from streamlit_webrtc import VideoProcessorBase

from scanner import Detection, annotate, detect

STALE_AFTER = 0.6  # seconds before an old detection's overlay is dropped


class BarcodeProcessor(VideoProcessorBase):
    def __init__(self) -> None:
        self.scale = 0.6
        self.try_harder = False
        self.lock = threading.Lock()
        self.found: dict = {}  # (text, format) -> stats
        self._dets: list[Detection] = []
        self._dets_at = 0.0
        self._latest: np.ndarray | None = None
        self._wake = threading.Event()
        self._stop = threading.Event()
        threading.Thread(target=self._worker, daemon=True).start()

    # -- worker thread: decode the newest frame only (older ones are skipped)
    def _worker(self) -> None:
        while not self._stop.is_set():
            self._wake.wait(timeout=0.5)
            self._wake.clear()
            frame, self._latest = self._latest, None
            if frame is None:
                continue
            s = self.scale
            small = frame if s >= 1 else _resize(frame, s)
            dets = detect(small, self.try_harder)
            if s < 1:
                dets = [Detection(d.text, d.format, tuple((x / s, y / s) for x, y in d.points))
                        for d in dets]
            now = time.strftime("%H:%M:%S")
            with self.lock:
                self._dets, self._dets_at = dets, time.time()
                for d in dets:
                    e = self.found.setdefault((d.text, d.format),
                                              {"count": 0, "first_seen": now, "last_seen": now})
                    e["count"] += 1
                    e["last_seen"] = now

    def recv(self, frame: av.VideoFrame) -> av.VideoFrame:
        img = frame.to_ndarray(format="bgr24")
        if self._latest is None:  # worker is idle -> hand it this frame
            self._latest = img.copy()
            self._wake.set()
        with self.lock:
            dets = self._dets if time.time() - self._dets_at < STALE_AFTER else []
        return av.VideoFrame.from_ndarray(annotate(img, dets), format="bgr24")

    def snapshot(self) -> dict:
        with self.lock:
            return {k: dict(v) for k, v in self.found.items()}

    def on_ended(self) -> None:
        self._stop.set()
        self._wake.set()


def _resize(img: np.ndarray, s: float) -> np.ndarray:
    import cv2
    return cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
