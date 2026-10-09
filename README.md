# Multi-Barcode Scanner (Streamlit)

Real-time multi-barcode / QR scanner: `zxing-cpp` decodes, OpenCV draws the overlay.

```bash
pip install -r requirements.txt
streamlit run app.py
```

Sources
- **Live camera (WebRTC)** – real-time detection in the browser; pick Back/Front camera (works on mobile, needs HTTPS).
  Decoding runs on a worker thread so the video stays smooth.
- **Take photo** / **Upload image** – still-image scan; reliable fallback on any phone.
- **Local OpenCV camera (server)** – `cv2.VideoCapture` on the machine running Streamlit; development only,
  enable with `LOCAL_CAMERA=1 streamlit run app.py`. It cannot see a visitor's phone camera.

Results are de-duplicated with counts and exportable to CSV. Run tests with `pytest`.
