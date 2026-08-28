# Breakout Vision

A browser-based webcam Breakout game with a GitHub-inspired dev dark mode aesthetic. Instead of classic left/right paddles, the game uses green contribution-like blocks in the camera feed to steer the paddle toward the stronger side.

Live demo: https://muadsteeb.github.io/webcam-breakout/

## Features

- Webcam-driven side control using a green block detection model
- Audience placeholder mode for demoing without a camera
- Crowd simulator sliders that generate green pixel blocks on each side of the frame
- Pause/resume control
- Breakout gameplay with a single score, contribution-style brick wall, and GitHub dark UI styling
- Retro synthesized sound effects

## How to run locally

1. From this folder, start a local server:
   `python3 -m http.server 8000`
2. Open `http://localhost:8000` in a browser.
3. Click `Start` and allow camera access, or choose `Play with audience placeholder` for a demo mode.
4. Use the green blocks on either side of the screen to move the paddle.

## Notes

- The app is a static HTML/CSS/JS project and works well on GitHub Pages.
- Webcam access requires HTTPS in a browser, so the Pages site is the easiest way to run it live.
- Best results come from a clean, well-lit background with bright green blocks or strong contrast for the side detection.
- The crowd simulator is intentionally tuned so blocks stay in the side lanes and exclude the center gap.
