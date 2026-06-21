export async function startScreenCapture(): Promise<{
  stream: MediaStream;
  stop: () => void;
}> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 5 },
    } as MediaTrackConstraints,
    audio: false,
  });

  const stop = () => {
    stream.getTracks().forEach((track) => track.stop());
  };

  stream.getVideoTracks()[0].onended = () => {
    stop();
  };

  return { stream, stop };
}

export function startFrameExtraction(
  stream: MediaStream,
  onFrame: (base64: string) => void,
  onError: (error: string) => void,
  intervalMs = 3000,
): { stop: () => void } {
  const video = document.createElement('video');
  video.setAttribute('autoplay', '');
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.srcObject = stream;

  // Add to DOM (hidden) so browsers actually render the video frames
  video.style.position = 'fixed';
  video.style.top = '-9999px';
  video.style.width = '1px';
  video.style.height = '1px';
  video.style.opacity = '0';
  video.style.pointerEvents = 'none';
  document.body.appendChild(video);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  let stopped = false;
  let extractionStarted = false;
  let retryCount = 0;

  const MIN_FRAME_SIZE = 5000; // Valid 1280x720 JPEG at 0.6 quality should be >> 5KB base64

  const extract = () => {
    if (stopped) return;

    if (!ctx) {
      onError('Canvas 2D context unavailable');
      return;
    }

    if (video.readyState >= 2 && video.videoWidth > 0) {
      const MAX_WIDTH = 1024;
      const scale = video.videoWidth > MAX_WIDTH ? MAX_WIDTH / video.videoWidth : 1;
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
      // Strip any data URL prefix (handle both jpeg and png in case browser falls back)
      const base64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
      if (base64.length > MIN_FRAME_SIZE) {
        onFrame(base64);
        retryCount = 0;
      } else {
        // Frame too small — likely black/corrupt, skip and retry
        retryCount++;
        if (retryCount > 15) {
          onError('截取的画面无效（黑屏或数据过小），请确认屏幕共享正常');
          return;
        }
      }
    } else {
      retryCount++;
      if (retryCount > 10) {
        onError('视频流未就绪，无法提取截图帧');
        return;
      }
    }

    setTimeout(extract, intervalMs);
  };

  // Start extraction once video data is loaded
  const startExtraction = () => {
    if (extractionStarted || stopped) return;
    extractionStarted = true;
    extract();
  };

  video.onloadeddata = startExtraction;
  video.oncanplay = startExtraction;

  // Also attempt to play and start after a delay as fallback
  video.play().then(() => {
    setTimeout(() => {
      if (!extractionStarted && !stopped) {
        startExtraction();
      }
    }, 2000);
  }).catch((err) => {
    onError(`视频播放失败: ${err.message}`);
  });

  // Fallback: start extraction after 5 seconds even without events
  setTimeout(() => {
    if (!extractionStarted && !stopped) {
      startExtraction();
    }
  }, 5000);

  return {
    stop: () => {
      stopped = true;
      try {
        video.pause();
        video.srcObject = null;
        document.body.removeChild(video);
      } catch {
        // ignore cleanup errors
      }
    },
  };
}

export function startVideoRecording(stream: MediaStream): {
  stop: () => Promise<Blob>;
} {
  // Try VP9 first, fall back to default codec
  let mimeType = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm';
  }

  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start(1000);

  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: mimeType }));
        };
        recorder.stop();
      }),
  };
}
