
const audioFiles = [
    { primary: "bass1.mp3", secondary: "bass2.mp3" },
    { primary: "drum1.mp3", secondary: "drum2.mp3" },
    { primary: "music1.mp3", secondary: "music2.mp3" },
    { primary: "vocal1.mp3", secondary: "vocal2.mp3" }
];

const TRACK_LABELS = ["Bass", "Drums", "Music", "Vocal"];

const positions = [
    { x: 0.3, y: 0.3, z: 100 },
    { x: 0.7, y: 0.3, z: 80 },
    { x: 0.3, y: 0.7, z: 60 },
    { x: 0.7, y: 0.7, z: 40 }
];

// 版本1颜色：红、黄、蓝、绿
const v1Colors = [
    [255, 50, 80],
    [255, 220, 50],
    [50, 120, 255],
    [50, 255, 120]
];

// 版本2颜色：对比色
const v2Colors = [
    [0, 220, 190],
    [80, 50, 220],
    [255, 180, 50],
    [220, 50, 180]
];

// ---- 全局状态 ----
let players = [];
let panners = [];
let analyzers = [];
let loaded = false;
let started = false;
let isPlaying = false;
let activeVersions = [0, 0, 0, 0];
let maxDistance;

// ML5 Handpose
let handpose;
let hands = [];
let video;

// 双食指状态（带平滑）
let leftFinger  = { x: -100, y: -100, sx: -100, sy: -100, active: false };
let rightFinger = { x: -100, y: -100, sx: -100, sy: -100, active: false };
const SMOOTH = 0.35;

// 手指灵敏度：食指尖相对手腕的小范围偏移 → 映射到整个画布
// 调小 = 更灵敏（手指动一点点就能跨越全屏）
// 调大 = 更稳（需要更大幅度的手指移动）
const FINGER_RANGE_X = 150;  // 水平活动范围（视频像素）
const FINGER_RANGE_Y = 150;  // 垂直活动范围（视频像素）

// 粒子拖尾
let leftTrail = [];
let rightTrail = [];
const MAX_TRAIL = 12;

// 悬停切换
let hoverProgress = [0, 0, 0, 0];
const HOVER_RADIUS = 80;
const HOVER_SECONDS = 4;
let prevTime = 0;

// 网格
const gridSize = 40;
const gridDepth = 5;

// ==========================================
// p5.js 生命周期
// ==========================================

function preload() {
    handpose = ml5.handPose({ maxHands: 2, flipped: true });
}

function setup() {
    // 画布匹配摄像头原始比例 (4:3)
    createCanvas(960, 720);
    maxDistance = dist(0, 0, width, height);

    // 摄像头（保持原始比例，不压缩）
    video = createCapture(VIDEO);
    video.size(960, 720);
    video.hide();
    handpose.detectStart(video, (results) => { hands = results; });

    // 音频引擎（每轨加 Panner）
    audioFiles.forEach((track) => {
        const panner = new Tone.Panner(0).toDestination();
        const primary   = new Tone.Player(track.primary).connect(panner);
        const secondary = new Tone.Player(track.secondary).connect(panner);
        primary.loop = true;
        secondary.loop = true;

        const analyzer = new Tone.Waveform(512);
        primary.connect(analyzer);
        secondary.connect(analyzer);

        players.push([primary, secondary]);
        panners.push(panner);
        analyzers.push(analyzer);
    });

    Tone.loaded().then(() => { loaded = true; });
    prevTime = millis();
}

function draw() {
    background(20, 24, 42);

    // 未启动 → 等待点击
    if (!started) {
        drawStartScreen();
        return;
    }

    // 镜像摄像头底图
    push();
    translate(width, 0);
    scale(-1, 1);
    tint(255, 30);
    image(video, 0, 0, width, height);
    pop();

    drawPerspectiveGrid();
    updateFingers();

    const dt = (millis() - prevTime) / 1000;
    prevTime = millis();

    if (loaded && isPlaying) {
        updatePanning();
        const distances = updateVolumes();
        updateHover(dt);
        drawConnections(distances);
        drawTracks(distances);
    }

    // 拖尾 + 手指指示器（始终绘制）
    drawTrailEffect(leftTrail,  [100, 180, 255]);
    drawTrailEffect(rightTrail, [255, 150, 100]);
    drawFingerDot(leftFinger,  [100, 180, 255], "L");
    drawFingerDot(rightFinger, [255, 150, 100], "R");

    // 声像指示
    if (leftFinger.active) drawPanIndicator();
}

// ==========================================
// 启动画面 & 点击启动
// ==========================================

function drawStartScreen() {
    push();
    translate(width, 0);
    scale(-1, 1);
    tint(255, 50);
    image(video, 0, 0, width, height);
    pop();

    // 半透明遮罩
    fill(20, 24, 42, 160);
    noStroke();
    rect(0, 0, width, height);

    fill(255);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(28);
    text(loaded ? "Click to Start" : "Loading audio...", width / 2, height / 2);
    textSize(14);
    fill(180);
    text("Show both hands to the camera", width / 2, height / 2 + 40);
    text("Left hand → stereo panning  |  Right hand → volume control", width / 2, height / 2 + 65);
}

function mousePressed() {
    if (!started && loaded) {
        Tone.start().then(() => {
            started = true;
            isPlaying = true;
            players.forEach((tp, i) => {
                tp.forEach((p, v) => {
                    p.start();
                    p.volume.value = (v === activeVersions[i]) ? -10 : -Infinity;
                });
            });
        });
    }
}

// ==========================================
// 手指追踪
// ==========================================

function updateFingers() {
    let foundLeft = false;
    let foundRight = false;

    for (let hand of hands) {
        if (!hand.keypoints || hand.keypoints.length < 21) continue;

        const wrist = hand.keypoints[0];  // 手腕作为锚点
        const tip   = hand.keypoints[8];  // 食指指尖

        // 食指尖相对手腕的偏移（视频像素空间）
        const dx = tip.x - wrist.x;
        const dy = tip.y - wrist.y;

        // 小范围偏移 → 映射到整个画布（flipped:true 坐标已镜像）
        const mx = constrain(map(dx, -FINGER_RANGE_X, FINGER_RANGE_X, 0, width),  0, width);
        const my = constrain(map(dy, -FINGER_RANGE_Y, FINGER_RANGE_Y, 0, height), 0, height);

        if (hand.handedness === "Left") {
            leftFinger.x = mx;
            leftFinger.y = my;
            leftFinger.sx = lerp(leftFinger.sx, mx, SMOOTH);
            leftFinger.sy = lerp(leftFinger.sy, my, SMOOTH);
            leftFinger.active = true;
            foundLeft = true;

            leftTrail.push({ x: leftFinger.sx, y: leftFinger.sy });
            if (leftTrail.length > MAX_TRAIL) {
                leftTrail.splice(0, leftTrail.length - MAX_TRAIL);
            }
        } else if (hand.handedness === "Right") {
            rightFinger.x = mx;
            rightFinger.y = my;
            rightFinger.sx = lerp(rightFinger.sx, mx, SMOOTH);
            rightFinger.sy = lerp(rightFinger.sy, my, SMOOTH);
            rightFinger.active = true;
            foundRight = true;

            rightTrail.push({ x: rightFinger.sx, y: rightFinger.sy });
            if (rightTrail.length > MAX_TRAIL) {
                rightTrail.splice(0, rightTrail.length - MAX_TRAIL);
            }
        }
    }

    if (!foundLeft)  leftFinger.active = false;
    if (!foundRight) rightFinger.active = false;
}

// ==========================================
// 音频控制
// ==========================================

// 左手 x 坐标 → 全局声像
function updatePanning() {
    if (!leftFinger.active) return;
    const pan = constrain(map(leftFinger.sx, 0, width, -1, 1), -1, 1);
    panners.forEach(p => { p.pan.value = pan; });
}

// 右手食指位置 → 各轨音量（距离映射）
function updateVolumes() {
    const rx = rightFinger.active ? rightFinger.sx : width / 2;
    const ry = rightFinger.active ? rightFinger.sy : height / 2;

    const distances = positions.map(pos =>
        dist(rx, ry, width * pos.x, height * pos.y)
    );

    distances.forEach((d, i) => {
        const vol = 1 - constrain(d / maxDistance, 0, 1);
        const db = map(vol, 0, 0.8, -40, 0);
        players[i].forEach((p, v) => {
            p.volume.value = (v === activeVersions[i]) ? db : -Infinity;
        });
    });

    return distances;
}

// ==========================================
// 悬停切换（4秒 + 颜色渐变）
// ==========================================

function updateHover(dt) {
    for (let i = 0; i < 4; i++) {
        const tx = width * positions[i].x;
        const ty = height * positions[i].y;

        let hovering = false;
        if (leftFinger.active  && dist(leftFinger.sx,  leftFinger.sy,  tx, ty) < HOVER_RADIUS) hovering = true;
        if (rightFinger.active && dist(rightFinger.sx, rightFinger.sy, tx, ty) < HOVER_RADIUS) hovering = true;

        if (hovering) {
            hoverProgress[i] += dt / HOVER_SECONDS;

            if (hoverProgress[i] >= 1) {
                // 切换版本！
                const oldV = activeVersions[i];
                const newV = 1 - oldV;
                activeVersions[i] = newV;
                hoverProgress[i] = 0;

                // 立刻更新音量
                const rx = rightFinger.active ? rightFinger.sx : width / 2;
                const ry = rightFinger.active ? rightFinger.sy : height / 2;
                const d = dist(rx, ry, tx, ty);
                const vol = 1 - constrain(d / maxDistance, 0, 1);
                const db = map(vol, 0, 0.8, -40, 0);
                players[i][newV].volume.value = db;
                players[i][oldV].volume.value = -Infinity;
            }
        } else {
            // 离开后缓慢衰减
            hoverProgress[i] = max(0, hoverProgress[i] - dt * 0.5);
        }
    }
}

// ==========================================
// 绘制函数
// ==========================================

// ---- 粒子拖尾（纯粒子，无连线） ----
function drawTrailEffect(trail, col) {
    noStroke();
    for (let i = 0; i < trail.length; i++) {
        const t = i / trail.length;
        const a = t * 160;
        const s = t * 5 + 2;
        fill(col[0], col[1], col[2], a);
        ellipse(trail[i].x, trail[i].y, s, s);
    }
}

// ---- 手指指示器 ----
function drawFingerDot(finger, col, label) {
    if (!finger.active) return;

    push();
    translate(finger.sx, finger.sy);

    // 脉冲光晕
    const pulse = sin(frameCount * 0.08) * 5 + 5;
    fill(col[0], col[1], col[2], 35);
    noStroke();
    ellipse(0, 0, 55 + pulse, 55 + pulse);

    // 主圆
    fill(col[0], col[1], col[2], 180);
    stroke(255, 180);
    strokeWeight(2);
    ellipse(0, 0, 32, 32);

    // 标签
    fill(255);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(12);
    text(label, 0, 0);

    pop();
}

// ---- 声像指示条 ----
function drawPanIndicator() {
    const panVal = constrain(map(leftFinger.sx, 0, width, -1, 1), -1, 1);
    const barY = height - 30;
    const barW = 200;
    const barX = width / 2 - barW / 2;

    // 底条
    fill(50, 60, 100, 120);
    noStroke();
    rect(barX, barY, barW, 6, 3);

    // 指示点
    const dotX = map(panVal, -1, 1, barX, barX + barW);
    fill(100, 180, 255, 220);
    ellipse(dotX, barY + 3, 12, 12);

    // 标签
    fill(200);
    textAlign(CENTER);
    textSize(10);
    noStroke();
    text("L", barX - 12, barY + 6);
    text("R", barX + barW + 12, barY + 6);
    text("PAN", width / 2, barY - 10);
}

// ---- 音轨可视化 ----
function drawTracks(distances) {
    for (let i = 0; i < 4; i++) {
        const pos = positions[i];
        const tx = width * pos.x;
        const ty = height * pos.y;

        // 当前颜色 = 基础色向对比色渐变（随 hoverProgress）
        const isV2 = activeVersions[i] === 1;
        const base   = isV2 ? v2Colors[i] : v1Colors[i];
        const target  = isV2 ? v1Colors[i] : v2Colors[i];
        const p = hoverProgress[i];

        const cr = lerp(base[0], target[0], p);
        const cg = lerp(base[1], target[1], p);
        const cb = lerp(base[2], target[2], p);

        const sc  = map(pos.z, 40, 100, 0.8, 1.1);
        const al  = map(pos.z, 40, 100, 180, 255);
        const vol = 1 - constrain(distances[i] / maxDistance, 0, 1);
        const A   = map(vol, 0, 1, 30, 120);

        push();
        translate(tx, ty);
        scale(sc * 2);

        // 悬停进度弧
        if (p > 0.01) {
            noFill();
            stroke(target[0], target[1], target[2], 220 * p);
            strokeWeight(4);
            arc(0, 0, A * 1.8, A * 1.8, -HALF_PI, -HALF_PI + TWO_PI * p);
        }

        // 波形
        const waveform = analyzers[i].getValue();
        fill(cr, cg, cb, al * 0.7);
        noStroke();
        beginShape();
        const step = max(1, floor(waveform.length / 36));
        for (let j = 0; j < waveform.length; j += step) {
            const phi = map(j, 0, waveform.length, 0, TWO_PI);
            const r = map(waveform[j], -1, 1, 0, A);
            curveVertex(r * cos(phi), r * sin(phi));
        }
        endShape(CLOSE);

        // 中心圆
        fill(30, 35, 60);
        stroke(cr, cg, cb);
        strokeWeight(3);
        ellipse(0, 0, 20, 20);

        // 版本号
        fill(255);
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(14);
        text(activeVersions[i] + 1, 0, 0);

        // 标签
        fill(255, 200);
        textSize(12);
        text(TRACK_LABELS[i], 0, A * 0.8);

        pop();
    }
}

// ---- 右手食指到音轨的连线 ----
function drawConnections(distances) {
    if (!rightFinger.active) return;
    const rx = rightFinger.sx;
    const ry = rightFinger.sy;

    for (let i = 0; i < 4; i++) {
        const tx = width * positions[i].x;
        const ty = height * positions[i].y;
        const vol = 1 - constrain(distances[i] / maxDistance, 0, 1);

        const isV2 = activeVersions[i] === 1;
        const c = isV2 ? v2Colors[i] : v1Colors[i];

        // 曲线
        stroke(c[0], c[1], c[2], 100 * vol);
        strokeWeight(2 * vol + 0.5);
        noFill();

        const cpX = lerp(rx, tx, 0.3);
        const cpY = lerp(ry, ty, 0.3) - positions[i].z * 0.5;

        beginShape();
        curveVertex(rx, ry);
        curveVertex(cpX, cpY);
        curveVertex(tx, ty);
        endShape();

        // 流动粒子
        noStroke();
        const np = floor(vol * 10);
        for (let j = 0; j < np; j++) {
            const t = j / np;
            const px = bezierPoint(rx, cpX, cpX, tx, t);
            const py = bezierPoint(ry, cpY, cpY, ty, t);
            const s = map(t, 0, 1, 3, 1) * vol;
            fill(c[0], c[1], c[2]);
            ellipse(px, py, s, s);
        }
    }
}

// ---- 左手食指到音轨的连线（声像感） ----
// 可选：如果也想让左手和音轨之间有连线，取消下面注释

// ---- 透视网格 ----
function drawPerspectiveGrid() {
    stroke(50, 60, 100, 80);
    strokeWeight(1);
    for (let z = 0; z < gridDepth; z++) {
        const sc = map(z, 0, gridDepth, 1, 0.3);
        const yo = map(z, 0, gridDepth, 0, 150);
        push();
        translate(width / 2, height / 2 + yo);
        scale(sc);
        for (let i = -5; i <= 5; i++) {
            line(i * gridSize, -5 * gridSize, i * gridSize, 5 * gridSize);
            line(-5 * gridSize, i * gridSize, 5 * gridSize, i * gridSize);
        }
        pop();
    }
    stroke(80, 100, 180, 50);
    strokeWeight(1);
    line(0, height / 2, width, height / 2);
    line(width / 2, 0, width / 2, height);
}
