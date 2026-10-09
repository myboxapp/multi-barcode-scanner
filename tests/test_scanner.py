import cv2
import numpy as np
import zxingcpp

from scanner import annotate, detect


def _canvas():
    return np.full((400, 700, 3), 255, np.uint8)



def test_multi_detect():
    qr = zxingcpp.write_barcode(zxingcpp.BarcodeFormat.QRCode, "hello-qr", 150, 150)
    c128 = zxingcpp.write_barcode(zxingcpp.BarcodeFormat.Code128, "ABC12345", 300, 100)
    canvas = _canvas()
    for bc, (x, y) in ((qr, (30, 30)), (c128, (300, 200))):
        img = cv2.cvtColor(np.array(bc), cv2.COLOR_GRAY2BGR)
        h, w = img.shape[:2]
        canvas[y:y + h, x:x + w] = img
    dets = detect(canvas)
    assert {d.text for d in dets} == {"hello-qr", "ABC12345"}
    annotate(canvas, dets)
