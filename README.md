# Hand-Controlled Pong

A small browser game inspired by classic Pong, where each paddle is controlled by a hand in the webcam.

## How to run

1. From this folder, start a local server:
   `python3 -m http.server 8000`
2. Open `http://localhost:8000` in a browser.
3. Click `Start webcam` and allow camera access.
4. Move your left and right hands in front of the camera to control the paddles.

## Notes

- The game uses MediaPipe Hands for real-time hand tracking.
- Left/Right hand detection maps to the left/right paddles.
- Works best in a well-lit room with the hands visible to the camera.
