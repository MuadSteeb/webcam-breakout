const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const webcam = document.getElementById('webcam');
const startButton = document.getElementById('startButton');
const pauseButton = document.getElementById('pauseButton');
const playAudienceButton = document.getElementById('playAudienceButton');
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
const audiencePlaceholder = new Image();
audiencePlaceholder.src = './assets/audience-placeholder.png';
audiencePlaceholder.crossOrigin = 'anonymous';

let useAudiencePlaceholder = false;

const game = {
  width: canvas.width,
  height: canvas.height,
  paddleWidth: 168,
  paddleHeight: 18,
  ballSize: 24,
  brickRows: 4,
  brickCols: 12,
  brickWidth: 56,
  brickHeight: 32,
  brickGap: 8,
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
  speedX: 120,
  speedY: -120,
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
  const totalBrickWidth = game.brickCols * game.brickWidth + (game.brickCols - 1) * game.brickGap;
  const leftPadding = (game.width - totalBrickWidth) / 2;

  for (let row = 0; row < game.brickRows; row += 1) {
    for (let col = 0; col < game.brickCols; col += 1) {
      const contributionValue = (row + col + (row * 2)) % 5;
      bricks.push({
        x: leftPadding + col * (game.brickWidth + game.brickGap),
        y: topPadding + row * (game.brickHeight + game.brickGap),
        width: game.brickWidth,
        height: game.brickHeight,
        alive: true,
        shade: contributionValue,
      });
    }
  }
}

function makeCrowdBlock(sideName) {
  const margin = 18;
  const size = 7;
  const centerGap = game.width * 0.05;
  const halfWidth = game.width / 2;
  const minX = sideName === 'left' ? margin : halfWidth + centerGap / 2;
  const maxX = sideName === 'left' ? (halfWidth - centerGap / 2) - margin : game.width - margin - size;
  const minY = game.height * 0.2;
  const maxY = game.height * 0.9 - size;

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
      crowdCtx.fillStyle = `rgba(57, 211, 83, ${block.alpha})`;
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
      const centerGap = game.width * 0.05;
      const minX = sideName === 'left' ? 18 : sideHalf + centerGap / 2;
      const maxX = sideName === 'left' ? sideHalf - centerGap / 2 - 18 : game.width - 18;
      const minY = game.height * 0.2;
      const maxY = game.height * 0.9 - block.size;
      block.x = clamp(block.x + (Math.random() - 0.5) * 18, minX, maxX - block.size);
      block.y = clamp(block.y + (Math.random() - 0.5) * 18, minY, maxY);
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
  ball.speedX = 120 * (Math.random() < 0.5 ? -1 : 1);
  ball.speedY = -120;
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

function drawAsciiPixel(x, y, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, size, size);
}

function drawBrick(brick) {
  const shades = ['#20112d', '#3a1d5a', '#5a2e8c', '#7b4cc9', '#b392ff'];
  const tone = shades[brick.shade % shades.length];

  for (let py = 0; py < brick.height; py += 4) {
    for (let px = 0; px < brick.width; px += 4) {
      const shouldFill = ((px + py) % 8) < 7 || (brick.shade > 0 && ((brick.x + brick.y + px + py) % 9) === 0);
      if (shouldFill) {
        drawAsciiPixel(brick.x + px, brick.y + py, 4, tone);
      }
    }
  }

  ctx.strokeStyle = 'rgba(214, 205, 255, 0.38)';
  ctx.lineWidth = 1;
  ctx.strokeRect(brick.x + 0.5, brick.y + 0.5, brick.width - 1, brick.height - 1);
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
  ctx.fillStyle = '#0a120e';
  ctx.fillRect(0, 0, game.width, game.height);

  const activeSource = useAudiencePlaceholder ? audiencePlaceholder : webcam;
  const hasActiveSource = useAudiencePlaceholder
    ? audiencePlaceholder.complete && audiencePlaceholder.naturalWidth > 0
    : webcam && webcam.videoWidth && webcam.videoHeight;

  if (hasActiveSource) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.drawImage(activeSource, 0, 0, game.width, game.height);
    ctx.restore();
  }

  drawCrowdBlocks();

  for (const brick of bricks) {
    if (!brick.alive) {
      continue;
    }
    drawBrick(brick);
  }

  ctx.fillStyle = '#d2ff6c';
  ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = '#f6fff8';
  ctx.fill();
}

function detectYellowSide() {
  const activeSource = useAudiencePlaceholder ? audiencePlaceholder : webcam;
  const hasActiveSource = useAudiencePlaceholder
    ? audiencePlaceholder.complete && audiencePlaceholder.naturalWidth > 0
    : webcam && webcam.videoWidth && webcam.videoHeight;

  if (!hasActiveSource) {
    return;
  }

  if (useAudiencePlaceholder) {
    yellowProbe.width = audiencePlaceholder.naturalWidth;
    yellowProbe.height = audiencePlaceholder.naturalHeight;
    yellowProbeCtx.clearRect(0, 0, yellowProbe.width, yellowProbe.height);
    yellowProbeCtx.drawImage(audiencePlaceholder, 0, 0, yellowProbe.width, yellowProbe.height);
  } else {
    yellowProbe.width = webcam.videoWidth;
    yellowProbe.height = webcam.videoHeight;
    yellowProbeCtx.clearRect(0, 0, yellowProbe.width, yellowProbe.height);
    yellowProbeCtx.drawImage(webcam, 0, 0, yellowProbe.width, yellowProbe.height);
  }

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

    const isGreen = g > 140 && r < 180 && b < 180 && g >= r && g >= b;
    if (isGreen) {
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
    : 'Hold green objects to the left or right to pull the paddle.';
}

async function startCamera() {
  useAudiencePlaceholder = false;

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    statusMessage.textContent = 'This browser does not support webcam access.';
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 },
      audio: false,
    });

    if (webcam.srcObject) {
      webcam.srcObject.getTracks().forEach((track) => track.stop());
    }

    webcam.srcObject = stream;
    await webcam.play();

    ensureAudioContext();
    statusMessage.textContent = 'Hold green objects to the left or right to pull the paddle.';
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

function startAudiencePlaceholder() {
  useAudiencePlaceholder = true;

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (webcam.srcObject) {
    webcam.srcObject.getTracks().forEach((track) => track.stop());
    webcam.srcObject = null;
  }

  ensureAudioContext();
  statusMessage.textContent = 'Using audience placeholder image. Hold green blocks to the left or right to steer the paddle.';
  startButton.textContent = 'Start webcam';
  startButton.disabled = false;
  pauseButton.disabled = false;
  isRunning = true;
  isPaused = false;
  pauseButton.textContent = 'Pause';
  animationFrameId = requestAnimationFrame(animate);
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
playAudienceButton.addEventListener('click', startAudiencePlaceholder);
createBricks();
syncCrowd('left');
syncCrowd('right');
updateScores();
resetBall();
drawGame();
