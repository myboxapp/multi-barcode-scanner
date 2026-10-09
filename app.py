"""Streamlit multi-barcode scanner.

Sources
- Live camera (WebRTC): real-time detection in the browser, front/back camera, works on mobile.
- Take photo: native camera snapshot (good fallback on mobile).
- Upload image: one-shot scan of a picture.
- Local OpenCV camera: cv2.VideoCapture on the *server*; only offered when LOCAL_CAMERA=1.
"""
from __future__ import annotations

import os
import time

import cv2
import numpy as np
import pandas as pd
import streamlit as st
from streamlit_webrtc import RTCConfiguration, WebRtcMode, webrtc_streamer

from processor import BarcodeProcessor
from scanner import annotate, detect

st.set_page_config(page_title="Multi-Barcode Scanner", page_icon="📷", layout="wide")
st.title("📷 Multi-Barcode Scanner")

RTC_CONFIG = RTCConfiguration({"iceServers": [{"urls": ["stun:stun.l.google.com:19302"]}]})
LOCAL_CAMERA = os.environ.get("LOCAL_CAMERA") == "1"

modes = ["Live camera (WebRTC)", "Take photo", "Upload image"]
if LOCAL_CAMERA:
    modes.append("Local OpenCV camera (server)")
mode = st.sidebar.radio("Source", modes)
try_harder = st.sidebar.checkbox("Try harder (rotation / downscale)", value=False)

if "found" not in st.session_state:
    st.session_state.found = {}  # (text, format) -> stats


def results_table(store: dict) -> pd.DataFrame:
    rows = [{"Value": k[0], "Format": k[1], **v} for k, v in store.items()]
    return pd.DataFrame(rows, columns=["Value", "Format", "count", "first_seen", "last_seen"])


def record(dets) -> None:
    now = time.strftime("%H:%M:%S")
    for d in dets:
        e = st.session_state.found.setdefault((d.text, d.format),
                                              {"count": 0, "first_seen": now, "last_seen": now})
        e["count"] += 1
        e["last_seen"] = now


def show_table(slot, store: dict) -> None:
    slot.dataframe(results_table(store), use_container_width=True, hide_index=True)


def scan_still(img_bgr: np.ndarray) -> None:
    dets = detect(img_bgr, try_harder=True)
    record(dets)
    st.image(annotate(img_bgr, dets), channels="BGR", caption=f"{len(dets)} code(s) found")
    show_table(st.empty(), st.session_state.found)


if mode == "Live camera (WebRTC)":
    scale = st.sidebar.slider("Processing scale", 0.25, 1.0, 0.6, 0.05,
                              help="Lower = faster detection; raise it for small / dense codes.")
    facing = st.radio("Camera", ["Back", "Front"], horizontal=True)
    facing_mode = "environment" if facing == "Back" else "user"

    ctx = webrtc_streamer(
        key=f"scanner-{facing_mode}",  # new key => stream restarts with the chosen camera
        mode=WebRtcMode.SENDRECV,
        rtc_configuration=RTC_CONFIG,
        video_processor_factory=BarcodeProcessor,
        media_stream_constraints={
            "video": {
                "facingMode": {"ideal": facing_mode},
                "width": {"ideal": 1280},
                "height": {"ideal": 720},
                "frameRate": {"ideal": 30},
            },
            "audio": False,
        },
        async_processing=True,
    )
    st.subheader("Detected codes")
    table = st.empty()
    if ctx.video_processor:
        while ctx.state.playing and ctx.video_processor:
            ctx.video_processor.scale = scale
            ctx.video_processor.try_harder = try_harder
            st.session_state.found = ctx.video_processor.snapshot()
            show_table(table, st.session_state.found)
            time.sleep(0.4)
    show_table(table, st.session_state.found)

elif mode == "Take photo":
    shot = st.camera_input("Point at one or more barcodes")
    if shot:
        scan_still(cv2.imdecode(np.frombuffer(shot.getvalue(), np.uint8), cv2.IMREAD_COLOR))

elif mode == "Upload image":
    up = st.file_uploader("Image with one or more barcodes", type=["png", "jpg", "jpeg", "bmp", "webp"])
    if up:
        scan_still(cv2.imdecode(np.frombuffer(up.read(), np.uint8), cv2.IMREAD_COLOR))

else:  # Local OpenCV camera (server) - development only
    st.caption("Reads a camera attached to the machine running Streamlit via cv2.VideoCapture.")
    cam_index = st.sidebar.number_input("Camera index", 0, 10, 0)
    every_n = st.sidebar.slider("Decode every N-th frame", 1, 10, 2)
    start = st.button("▶ Start", type="primary")
    video_slot, table_slot = st.empty(), st.empty()
    if start:
        cap = cv2.VideoCapture(int(cam_index))
        if not cap.isOpened():
            st.error(f"Could not open camera {cam_index}.")
        else:
            dets, i = [], 0
            try:  # any widget interaction reruns the script, which ends the loop
                while True:
                    ok, frame = cap.read()
                    if not ok:
                        break
                    i += 1
                    if i % every_n == 0:
                        dets = detect(frame, try_harder)
                        record(dets)
                    video_slot.image(annotate(frame, dets), channels="BGR", use_container_width=True)
                    if i % 5 == 0:
                        show_table(table_slot, st.session_state.found)
            finally:
                cap.release()
    show_table(table_slot, st.session_state.found)

if st.session_state.found:
    st.sidebar.download_button("⬇ Export CSV", results_table(st.session_state.found).to_csv(index=False),
                               "barcodes.csv", "text/csv")
    if st.sidebar.button("🗑 Clear results"):
        st.session_state.found = {}
        st.rerun()
