# MultiScan

Mobile-first, on-device multi-barcode scanner. Camera frames are decoded in a Web Worker using ZXing-C++ WebAssembly. Detected codes receive live outlines and labels, with a deduplicated in-memory session list.

## Run

```
npm ci
npm run build
python3 -m http.server 8080 --directory dist
```

Open localhost for desktop development. Mobile cameras require an HTTPS host. No backend, camera uploads, or persistent result storage. Flashlight and camera switching depend on device support. Start camera explicitly to grant permission; backgrounding the page stops capture.

## Verify

`npm test` uses Chromium (at `/usr/bin/chromium`) with a simulated camera frame containing multiple generated barcodes. It checks actual decoding, deduplication, pause/resume, stop, permission-denied feedback, mobile layout, and the optional browser agent tool.

Physical iOS and Android camera testing is still recommended; browser emulation cannot verify autofocus, actual lens choice, glare, or hardware flashlight control.
