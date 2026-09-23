# FrameShift

### Your Videos, Made Compatible.

FrameShift is designed to help make videos recorded on newer iPhones and Android phones playable on older Android devices.

## The problem

Newer phones often record video using formats, codecs, or recording settings that older Android devices may not support. A video can fail to play, show a black screen, or display a **“codec not supported”** message.

There are already video converters available, but in my own testing, some converted files still showed “codec not supported” on the older phone I was trying to use. A file ending in `.mp4` is not necessarily compatible: the video and audio inside it matter too.

FrameShift is built around that specific compatibility problem. It aims to create a more broadly supported MP4, rather than simply changing the file extension.

## What it does

- Accepts `.MOV`, `.MP4`, and `.M4V` video files.
- Re-encodes video to H.264 MP4 with AAC audio.
- Converts high-resolution footage to a maximum dimension of 1080p and limits frame rate to 30 fps.
- Includes Balanced and Fast conversion options.
- Provides a separate page explaining the intended older Android device compatibility.

Conversion can reduce quality, and compatibility depends on the source file and target device. FrameShift cannot guarantee playback on every handset.

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm start
```

Open `http://localhost:3000`.

Optional setting: `MAX_MB` controls the upload limit (default: 500 MB).

## Project structure

```text
frameshift/
├── public/
│   ├── index.html
│   ├── compatibility.html
│   ├── style.css
│   └── app.js
├── server.js
├── package.json
└── README.md
```
