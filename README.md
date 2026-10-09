# Multi-Barcode Scanner (Streamlit)

Real-time multi-barcode / QR scanner: OpenCV for the video loop and drawing, `zxing-cpp` for decoding
(many codes per frame, 1D + 2D formats).

```bash
pip install -r requirements.txt
streamlit run app.py
```

Sources: **Browser camera (WebRTC)** (works when deployed), **Local OpenCV camera** (`cv2.VideoCapture` loop),
**Upload image**. Sidebar controls decode frequency and processing scale; results are de-duplicated with
counts and exportable to CSV. Run tests with `pytest`.
