"""Barcode detection engine: zxing-cpp for decoding, OpenCV for drawing."""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
import zxingcpp


@dataclass(frozen=True)
class Detection:
    text: str
    format: str
    points: tuple  # 4 (x, y) corners


def detect(frame_bgr: np.ndarray, try_harder: bool = True) -> list[Detection]:
    """Find every barcode / QR code in a BGR frame (multi-code per frame)."""
    results = zxingcpp.read_barcodes(frame_bgr, try_rotate=try_harder, try_downscale=try_harder)
    out = []
    for r in results:
        p = r.position
        pts = tuple((c.x, c.y) for c in (p.top_left, p.top_right, p.bottom_right, p.bottom_left))
        out.append(Detection(r.text, str(r.format).split(".")[-1], pts))
    return out


def annotate(frame_bgr: np.ndarray, detections: list[Detection]) -> np.ndarray:
    """Draw outlines and labels in place and return the frame."""
    for d in detections:
        poly = np.array(d.points, dtype=np.int32).reshape(-1, 1, 2)
        cv2.polylines(frame_bgr, [poly], True, (0, 255, 0), 3)
        x, y = poly[0, 0]
        label = f"{d.text[:40]} [{d.format}]"
        (w, h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        y = max(y, h + 8)
        cv2.rectangle(frame_bgr, (x, y - h - 8), (x + w + 4, y), (0, 255, 0), -1)
        cv2.putText(frame_bgr, label, (x + 2, y - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
    return frame_bgr
