const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const webcam = document.getElementById('webcam');
const startButton = document.getElementById('startButton');
const pauseButton = document.getElementById('pauseButton');
const statusMessage = document.getElementById('statusMessage');
const leftScoreEl = document.getElementById('leftScore');
const leftCrowdSlider = document.getElementById('leftCrowdSlider');
const rightCrowdSlider = document.getElementById('rightCrowdSlider');
const leftCrowdValue = document.getElementById('leftCrowdValue');
const rightCrowdValue = document.getElementById('rightCrowdValue');

const yellowProbe = document.createElement('canvas');
const yellowProbeCtx = yellowProbe.getContext('2d');
const crowdCanvas = document.createElement('canvas');
const crowdCtx = crowdCanvas.getContext('2d');

const game = {
  width: canvas.width,
  height: canvas.height,
  paddleWidth: 140,
  paddleHeight: 18,
  ballSize: 12,
  brickRows: 5,
  brickCols: 9,
  brickWidth: 78,
  brickHeight: 24,
  brickGap: 10,
  score: 0,
  timeScale: 0.5,
};

const paddle = {
  x: game.width / 2 - game.paddleWidth / 2,
  y: game.height - 42,
  width: game.paddleWidth,
  height: game.paddleHeight,
  targetX: game.width / 2 - game.paddleWidth / 2,
  travelSpeed: 560,
};

const ball = {
  x: game.width / 2,
  y: game.height - 58,
  radius: game.ballSize / 2,
  speedX: 150,
  speedY: -150,
};

const bricks = [];
const crowd = {
  left: { blocks: [], value: Number(leftCrowdSlider.value), slider: leftCrowdSlider, output: leftCrowdValue },
  right: { blocks: [], value: Number(rightCrowdSlider.value), slider: rightCrowdSlider, output: rightCrowdValue },
};
const audio = {
  context: null,
};

let animationFrameId = null;
let isRunning = false;
let isPaused = false;
let scoreLocked = false;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createBricks() {
  bricks.length = 0;
  const topPadding = 52;
  const leftPadding = 34;

  for (let row = 0; row < game.brickRows; row += 1) {
    for (let col = 0; col < game.brickCols; col += 1) {
      bricks.push({
        x: leftPadding + col * (game.brickWidth + game.brickGap),
        y: topPadding + row * (game.brickHeight + game.brickGap),
        width: game.brickWidth,
        height: game.brickHeight,
        alive: true,
      });
    }
  }
}

function makeCrowdBlock(sideName) {
  const margin = 18;
  const size = 10;
  const minX = sideName === 'left' ? margin : game.width / 2 + margin;
  const maxX = sideName === 'left' ? (game.width / 2) - margin : game.width - margin - size;
  const minY = 30;
  const maxY = game.height - 40;

  return {
    x: Math.random() * (maxX - minX) + minX,
    y: Math.random() * (maxY - minY) + minY,
    size,
    alpha: 0.4 + Math.random() * 0.6,
  };
}

function drawCrowdOverlay() {
  if (!crowdCtx) {
    return;
  }

  crowdCanvas.width = game.width;
  crowdCanvas.height = game.height;
  crowdCtx.clearRect(0, 0, crowdCanvas.width, crowdCanvas.height);

  for (const sideName of ['left', 'right']) {
    const side = crowd[sideName];
    for (const block of side.blocks) {
      crowdCtx.fillStyle = `rgba(249, 214, 53, ${block.alpha})`;
      crowdCtx.fillRect(block.x, block.y, block.size, block.size);
    }
  }
}

function syncCrowd(sideName) {
  const side = crowd[sideName];
  const target = Number(side.slider.value);
  side.value = target;
  side.output.textContent = String(target);

  while (side.blocks.length < target) {
    side.blocks.push(makeCrowdBlock(sideName));
  }

  while (side.blocks.length > target) {
    side.blocks.pop();
  }

  for (const block of side.blocks) {
    if (Math.random() < 0.08) {
      const sideHalf = game.width / 2;
      const minX = sideName === 'left' ? 18 : sideHalf + 18;
      const maxX = sideName === 'left' ? sideHalf - 18 : game.width - 18;
      block.x = clamp(block.x + (Math.random() - 0.5) * 18, minX, maxX - 10);
      block.y = clamp(block.y + (Math.random() - 0.5) * 18, 18, game.height - 28);
    }
  }
}

function ensureAudioContext() {
  if (!audio.context) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) {
      return null;
    }
    audio.context = new AudioCtor();
  }

  if (audio.context.state === 'suspended') {
    audio.context.resume();
  }

  return audio.context;
}

function playTone(frequency, duration, type = 'sine', volume = 0.05) {
  const context = ensureAudioContext();
  if (!context) {
    return;
  }

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  oscillator.type = type;
  oscillator.frequency.value = frequency;

  gainNode.gain.setValueAtTime(volume, context.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);

  oscillator.start();
  oscillator.stop(context.currentTime + duration);
}

function resetBall() {
  ball.x = paddle.x + paddle.width / 2;
  ball.y = paddle.y - ball.radius - 4;
  ball.speedX = 150 * (Math.random() < 0.5 ? -1 : 1);
  ball.speedY = -150;
  scoreLocked = false;
}

function updateScores() {
  leftScoreEl.textContent = String(game.score);
}

function updatePaddle(deltaTime) {
  const maxStep = paddle.travelSpeed * deltaTime;
  const distance = paddle.targetX - paddle.x;
  const step = clamp(distance, -maxStep, maxStep);
  paddle.x += step;
  paddle.x = clamp(paddle.x, 18, game.width - paddle.width - 18);
}

function handleWallCollisions() {
  if (ball.x - ball.radius <= 0 || ball.x + ball.radius >= game.width) {
    ball.speedX *= -1;
    ball.x = clamp(ball.x, ball.radius, game.width - ball.radius);
    playTone(180, 0.08, 'square', 0.04);
  }

  if (ball.y - ball.radius <= 0) {
    ball.speedY *= -1;
    ball.y = ball.radius;
    playTone(220, 0.08, 'triangle', 0.04);
  }

  if (ball.y - ball.radius > game.height) {
    scoreLocked = true;
    playTone(120, 0.2, 'sawtooth', 0.07);
    setTimeout(() => resetBall(), 800);
  }
}

function handlePaddleCollision() {
  const paddleTop = paddle.y;
  const paddleBottom = paddle.y + paddle.height;
  const paddleLeft = paddle.x;
  const paddleRight = paddle.x + paddle.width;

  if (
    ball.y + ball.radius >= paddleTop &&
    ball.y - ball.radius <= paddleBottom &&
    ball.x >= paddleLeft &&
    ball.x <= paddleRight &&
    ball.speedY > 0
  ) {
    const relativeIntersect = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
    const bounceAngle = relativeIntersect * (Math.PI / 3);
    const speed = Math.hypot(ball.speedX, ball.speedY) * 1.02;

    ball.speedX = Math.sin(bounceAngle) * speed;
    ball.speedY = -Math.cos(bounceAngle) * speed;
    ball.y = paddleTop - ball.radius - 1;
    playTone(360, 0.08, 'triangle', 0.05);
  }
}

function handleBrickCollisions() {
  for (const brick of bricks) {
    if (!brick.alive) {
      continue;
    }

    const overlapsX = ball.x + ball.radius > brick.x && ball.x - ball.radius < brick.x + brick.width;
    const overlapsY = ball.y + ball.radius > brick.y && ball.y - ball.radius < brick.y + brick.height;

    if (!overlapsX || !overlapsY) {
      continue;
    }

    brick.alive = false;
    game.score += 1;
    updateScores();
    playTone(620, 0.06, 'square', 0.06);

    const overlapLeft = ball.x + ball.radius - brick.x;
    const overlapRight = brick.x + brick.width - (ball.x - ball.radius);
    const overlapTop = ball.y + ball.radius - brick.y;
    const overlapBottom = brick.y + brick.height - (ball.y - ball.radius);
    const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

    if (minOverlap === overlapLeft || minOverlap === overlapRight) {
      ball.speedX *= -1;
    } else {
      ball.speedY *= -1;
    }

    if (bricks.every((item) => !item.alive)) {
      createBricks();
      game.score = 0;
      updateScores();
      playTone(780, 0.18, 'triangle', 0.07);
      resetBall();
    }
    return;
  }
}

function updateBall(deltaTime) {
  if (scoreLocked) {
    return;
  }

  ball.x += ball.speedX * deltaTime;
  ball.y += ball.speedY * deltaTime;

  handleWallCollisions();
  handlePaddleCollision();
  handleBrickCollisions();
}

function drawRoundedRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCrowdBlocks() {
  drawCrowdOverlay();
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.drawImage(crowdCanvas, 0, 0, game.width, game.height);
  ctx.restore();
}

function drawGame() {
  ctx.clearRect(0, 0, game.width, game.height);
  ctx.fillStyle = '#0e1830';
  ctx.fillRect(0, 0, game.width, game.height);

  if (webcam && webcam.videoWidth && webcam.videoHeight) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.drawImage(webcam, 0, 0, game.width, game.height);
    ctx.restore();
  }

  drawCrowdBlocks();

  for (const brick of bricks) {
    if (!brick.alive) {
      continue;
    }

    drawRoundedRect(brick.x, brick.y, brick.width, brick.height, 6);
    const brickShade = 180 + ((brick.x + brick.y) % 3) * 15;
    ctx.fillStyle = `rgb(${brickShade - 40}, ${brickShade + 40}, ${brickShade - 80})`;
    ctx.fill();
  }

  drawRoundedRect(paddle.x, paddle.y, paddle.width, paddle.height, 10);
  ctx.fillStyle = '#7ee7ff';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

function detectYellowSide() {
  if (!webcam.videoWidth || !webcam.videoHeight) {
    return;
  }

  yellowProbe.width = webcam.videoWidth;
  yellowProbe.height = webcam.videoHeight;
  yellowProbeCtx.clearRect(0, 0, yellowProbe.width, yellowProbe.height);
  yellowProbeCtx.drawImage(webcam, 0, 0, yellowProbe.width, yellowProbe.height);

  drawCrowdOverlay();
  yellowProbeCtx.drawImage(crowdCanvas, 0, 0, yellowProbe.width, yellowProbe.height);

  const pixels = yellowProbeCtx.getImageData(0, 0, yellowProbe.width, yellowProbe.height).data;
  let leftYellow = 0;
  let rightYellow = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const x = (index / 4) % yellowProbe.width;

    const isYellow = r > 150 && g > 120 && b < 120 && r >= g && g >= b;
    if (isYellow) {
      if (x < yellowProbe.width / 2) {
        leftYellow += 1;
      } else {
        rightYellow += 1;
      }
    }
  }

  const totalYellow = leftYellow + rightYellow;
  if (totalYellow === 0) {
    return;
  }

  const majority = Math.abs(leftYellow - rightYellow) / totalYellow;
  const leftBias = leftYellow > rightYellow;

  if (majority < 0.1) {
    paddle.targetX = paddle.x;
    paddle.travelSpeed = 0;
    return;
  }

  paddle.travelSpeed = 180 + majority * 700;
  const targetSide = leftBias ? 18 : game.width - paddle.width - 18;
  paddle.targetX = targetSide;
}

function animate(timestamp) {
  if (!isRunning) {
    return;
  }

  const deltaTime = Math.min((timestamp - (animate.lastTimestamp || timestamp)) / 1000, 0.03) * game.timeScale;
  animate.lastTimestamp = timestamp;

  if (!isPaused) {
    detectYellowSide();
    updatePaddle(deltaTime);
    updateBall(deltaTime);
  }

  syncCrowd('left');
  syncCrowd('right');
  drawGame();
  animationFrameId = requestAnimationFrame(animate);
}

function togglePause() {
  if (!isRunning) {
    return;
  }

  isPaused = !isPaused;
  pauseButton.textContent = isPaused ? 'Resume' : 'Pause';
  statusMessage.textContent = isPaused
    ? 'Game paused. Resume to continue playing.'
    : 'Hold yellow objects to the left or right to pull the paddle.';
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    statusMessage.textContent = 'This browser does not support webcam access.';
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 },
      audio: false,
    });

    webcam.srcObject = stream;
    await webcam.play();

    ensureAudioContext();
    statusMessage.textContent = 'Hold yellow objects to the left or right to pull the paddle.';
    startButton.textContent = 'Camera live';
    startButton.disabled = true;
    pauseButton.disabled = false;
    isRunning = true;
    isPaused = false;
    pauseButton.textContent = 'Pause';
    animationFrameId = requestAnimationFrame(animate);
  } catch (error) {
    console.error(error);
    statusMessage.textContent = 'Camera access was denied. Please allow it and try again.';
  }
}

leftCrowdSlider.addEventListener('input', () => {
  crowd.left.value = Number(leftCrowdSlider.value);
  leftCrowdValue.textContent = leftCrowdSlider.value;
});

rightCrowdSlider.addEventListener('input', () => {
  crowd.right.value = Number(rightCrowdSlider.value);
  rightCrowdValue.textContent = rightCrowdSlider.value;
});

startButton.addEventListener('click', startCamera);
pauseButton.addEventListener('click', togglePause);
createBricks();
syncCrowd('left');
syncCrowd('right');
updateScores();
resetBall();
drawGame();
