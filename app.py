"""Streamlit multi-barcode scanner with a continuous video loop.

Modes
- Browser camera (WebRTC): works locally and when deployed; frames are processed live.
- Local OpenCV camera: a cv2.VideoCapture loop on the machine running Streamlit.
- Upload image: one-shot scan of a photo.
"""
from __future__ import annotations

import threading
import time

import av
import cv2
import numpy as np
import pandas as pd
import streamlit as st
from streamlit_webrtc import RTCConfiguration, WebRtcMode, webrtc_streamer

from scanner import annotate, detect

st.set_page_config(page_title="Multi-Barcode Scanner", page_icon="📷", layout="wide")
st.title("📷 Multi-Barcode Scanner")

RTC_CONFIG = RTCConfiguration({"iceServers": [{"urls": ["stun:stun.l.google.com:19302"]}]})

# ---------------------------------------------------------------- sidebar
mode = st.sidebar.radio("Source", ["Browser camera (WebRTC)", "Local OpenCV camera", "Upload image"])
every_n = st.sidebar.slider("Decode every N-th frame", 1, 10, 2,
                            help="Higher = smoother video, lower CPU, slightly slower detection.")
scale = st.sidebar.slider("Processing scale", 0.25, 1.0, 0.75, 0.05,
                          help="Downscale frames before decoding for speed.")
try_harder = st.sidebar.checkbox("Try harder (rotation / downscale)", value=False)

if "found" not in st.session_state:
    st.session_state.found = {}  # (text, format) -> {"count", "first_seen", "last_seen"}


def record(dets, store: dict, lock=None):
    now = time.strftime("%H:%M:%S")
    for d in dets:
        key = (d.text, d.format)
        if lock:
            lock.acquire()
        try:
            e = store.setdefault(key, {"count": 0, "first_seen": now, "last_seen": now})
            e["count"] += 1
            e["last_seen"] = now
        finally:
            if lock:
                lock.release()


def process(frame: np.ndarray, frame_idx: int, state: dict):
    """Detect on a (possibly downscaled) frame; reuse last result between decodes."""
    if frame_idx % every_n == 0:
        small = cv2.resize(frame, None, fx=scale, fy=scale) if scale < 1 else frame
        dets = detect(small, try_harder)
        if scale < 1:  # map corners back to full resolution
            dets = [type(d)(d.text, d.format, tuple((x / scale, y / scale) for x, y in d.points))
                    for d in dets]
        state["dets"] = dets
        return dets, True
    return state.get("dets", []), False


def results_table(store: dict) -> pd.DataFrame:
    rows = [{"Value": k[0], "Format": k[1], **v} for k, v in store.items()]
    cols = ["Value", "Format", "count", "first_seen", "last_seen"]
    return pd.DataFrame(rows, columns=cols)


# ---------------------------------------------------------------- modes
if mode == "Browser camera (WebRTC)":
    lock = threading.Lock()
    shared: dict = {}
    loop_state = {"i": 0, "dets": []}

    def video_callback(frame: av.VideoFrame) -> av.VideoFrame:
        img = frame.to_ndarray(format="bgr24")
        loop_state["i"] += 1
        dets, fresh = process(img, loop_state["i"], loop_state)
        if fresh:
            record(dets, shared, lock)
        return av.VideoFrame.from_ndarray(annotate(img, dets), format="bgr24")

    left, right = st.columns([3, 2])
    with left:
        ctx = webrtc_streamer(
            key="scanner",
            mode=WebRtcMode.SENDRECV,
            rtc_configuration=RTC_CONFIG,
            video_frame_callback=video_callback,
            media_stream_constraints={"video": {"width": {"ideal": 1280}}, "audio": False},
            async_processing=True,
        )
    with right:
        st.subheader("Detected codes")
        table = st.empty()
        while ctx.state.playing:
            with lock:
                snapshot = dict(shared)
            table.dataframe(results_table(snapshot), use_container_width=True, hide_index=True)
            st.session_state.found = snapshot
            time.sleep(0.5)
        table.dataframe(results_table(st.session_state.found), use_container_width=True, hide_index=True)

elif mode == "Local OpenCV camera":
    st.caption("Reads the camera attached to the machine running Streamlit via cv2.VideoCapture.")
    cam_index = st.sidebar.number_input("Camera index", 0, 10, 0)
    c1, c2 = st.columns(2)
    start = c1.button("▶ Start", type="primary")
    stop = c2.button("⏹ Stop")
    video_slot = st.empty()
    table_slot = st.empty()
    fps_slot = st.sidebar.empty()

    if start:
        cap = cv2.VideoCapture(int(cam_index))
        if not cap.isOpened():
            st.error(f"Could not open camera {cam_index}.")
        else:
            state = {"dets": []}
            i, t0 = 0, time.time()
            try:
                # Streamlit reruns the script on any widget click, which ends this loop (Stop).
                while True:
                    ok, frame = cap.read()
                    if not ok:
                        st.warning("Camera read failed.")
                        break
                    i += 1
                    dets, fresh = process(frame, i, state)
                    if fresh:
                        record(dets, st.session_state.found)
                    video_slot.image(annotate(frame, dets), channels="BGR", use_container_width=True)
                    if i % 5 == 0:
                        table_slot.dataframe(results_table(st.session_state.found),
                                             use_container_width=True, hide_index=True)
                        fps_slot.metric("FPS", f"{i / (time.time() - t0):.1f}")
            finally:
                cap.release()
    else:
        table_slot.dataframe(results_table(st.session_state.found), use_container_width=True, hide_index=True)

else:
    up = st.file_uploader("Image with one or more barcodes", type=["png", "jpg", "jpeg", "bmp", "webp"])
    if up:
        img = cv2.imdecode(np.frombuffer(up.read(), np.uint8), cv2.IMREAD_COLOR)
        dets = detect(img, try_harder=True)
        record(dets, st.session_state.found)
        st.image(annotate(img, dets), channels="BGR", caption=f"{len(dets)} code(s) found")
        st.dataframe(results_table(st.session_state.found), use_container_width=True, hide_index=True)

if st.session_state.found:
    st.sidebar.download_button("⬇ Export CSV", results_table(st.session_state.found).to_csv(index=False),
                               "barcodes.csv", "text/csv")
    if st.sidebar.button("🗑 Clear results"):
        st.session_state.found = {}
        st.rerun()
