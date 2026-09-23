# FrameShift – Your Videos, Made Compatible

## The problem

Videos recorded on a newer iPhone often won't play on older and mid-range Android phones (for example the Samsung Galaxy M32). When you open them you get a black screen with sound, washed-out or green colours, stuttering, or a "can't play video" error.

The video isn't broken. iPhones record in a newer, heavier format than these phones can decode:

- **HEVC (H.265)** compression, which many older Android phones can't play smoothly
- **10-bit HDR / Dolby Vision**, which looks grey or green on phones without HDR
- **4K at up to 60 fps**, which is more than a mid-range chip can decode
- **.mov** files, which some Android apps refuse to open

## The solution

FrameShift converts the video on a server and hands back a file that plays everywhere these phones can reach:

| Setting | Output |
| --- | --- |
| Container | `.mp4` with `faststart` |
| Video | H.264, High profile, Level 4.1, 8-bit |
| Colour | HDR is tone-mapped to standard colours |
| Size | Max 1920 px on the longer side (1080p) |
| Frame rate | Capped at 30 fps |
| Audio | AAC stereo, 44.1 kHz, 128 kbps |

Conversion runs on the server, not in the visitor's browser, so a large video can't crash the tab. FFmpeg comes from the `ffmpeg-static` package and is only started while a file is being converted. Conversions run one at a time, and files are deleted 20 minutes after upload.

Converting always costs a little quality. 4K becomes 1080p and HDR becomes standard colour by design.

## Project structure

```
frameshift/
├── server.js            Express server: upload, job queue, ffmpeg conversion, download
├── package.json         Dependencies (express, multer, ffmpeg-static) and start script
├── .gitignore
├── README.md
└── public/              Static frontend served by the server
    ├── index.html       Converter page
    ├── compatibility.html   Compatible phone models, with search
    ├── style.css        Dark blue theme shared by both pages
    └── app.js           Upload, progress polling, download
```

### API

| Route | Purpose |
| --- | --- |
| `POST /api/convert` | Upload a video (`video`) and a speed (`balanced` or `fast`). Returns a job id. |
| `GET /api/status/:id` | Job status, progress and queue position |
| `GET /api/download/:id` | Download the finished `.mp4` |

## Run locally

```
npm install
npm start        # http://localhost:3000
```

Set `MAX_MB` to change the upload limit (default 500).

## Deploy for free (Render)

1. Push the repo to GitHub.
2. On Render, create a new Web Service from the repo.
3. Runtime: Node. Build command: `npm install`. Start command: `npm start`. Plan: Free.

Free plans have little CPU and sleep when idle, so the first visit is slow and conversions take longer.
