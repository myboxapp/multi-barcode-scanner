# MultiScan

Mobile-first, on-device multi-barcode scanner. Camera frames are decoded in a Web Worker using ZXing-C++ WebAssembly plus supplemental linear readers. Detected codes receive live outlines and labels, with a deduplicated in-memory session list.

## Image scanning

Upload image accepts browser-readable image files up to 20 MB and 40 megapixels. Images are decoded locally, scaled to a maximum dimension of 2400 pixels, and scanned by the same worker as the camera. The preview receives outlines and the session list receives deduplicated values and crops. Selecting an image stops the active camera and flash; Use camera returns to live capture. No image is sent to a server. HEIC and other codecs depend on browser support; unsupported or damaged images show a retry message.

## Supported formats

All 17 requested labels are enabled: Codabar, Code 11, Code 25, Code 32, Code 39, Code 93, Code 128, GS1 DataBar, GS1 DataBar Expanded, EAN-13, EAN-8, IATA 2 of 5, Industrial 2 of 5, ITF, MSI Plessey, UPC-A and UPC-E. QR, Data Matrix, PDF417 and Aztec remain supported by ZXing.

- Code 25 includes Matrix and Standard. Standard Code 25 and Industrial 2 of 5 have the same encoding and share a result label.
- UPC-A is reported as 12 digits, including leading zeros. UPC-E is reported in its 8-digit compressed form. A leading-zero EAN-13 is the same physical symbol as UPC-A and is labeled UPC-A.
- Supplemental readers cover Code 11, Matrix/Industrial/IATA 2 of 5 and MSI. They scan in both directions at 12 angles, require quiet zones and agreement on at least three scan lines, and accept values of at least three characters. They preserve all encoded digits, including optional check digits; no checksum policy can be inferred reliably for these legacy types. Clean, well-lit labels are recommended.
- Code 32 is a Code 39 derivative; ZXing recognizes the pharmaceutical encoding. GS1 values retain the encoded application identifiers.

## Run

```
npm ci
npm run build
python3 -m http.server 8080 --directory dist
```

Open localhost for desktop development. Mobile cameras require an HTTPS host. No backend, camera uploads, or persistent result storage. Each unique detection keeps a PNG crop from the exact decoded frame (up to 640 pixels on its longest side). Clips appear beside the values, survive stopping the camera, and are removed by Clear or a page reload. Flash controls are enabled only when the active camera advertises torch support; the UI reports constraint failures and resets on camera stop or switch. Flashlight and camera switching depend on device support. Start camera explicitly to grant permission; backgrounding the page stops capture.

## Verify

`npm test` uses Chromium (at `/usr/bin/chromium`) with a simulated camera frame containing multiple generated barcodes. It checks actual decoding, deduplication, pause/resume, stop, permission-denied feedback, mobile layout, and the optional browser agent tool.

`npm run test:formats` verifies exact format/value output for all 17 requested types (plus the additional Matrix Code 25 variant), rotated/slightly blurred legacy samples, mixed formats, separate outlines for duplicate physical labels, and blank/noisy/cropped negative images. Fixtures are independently generated with BWIPP via bwip-js.

Physical iOS and Android camera testing is still recommended; browser emulation cannot verify autofocus, actual lens choice, glare, or hardware flashlight control.
