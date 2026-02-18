let handPose;
let video;
let hands = [];
let p5Canvas; 

// 手部骨架连接点
let handArray = [
    1, 2, 3, 4, 3, 2, 5, 6, 7, 8, 7, 6, 5, 9, 10, 11, 12, 11, 10, 9, 13, 14, 15, 16, 15, 14, 13, 17, 18, 19, 20, 19, 18, 17, 0
];

// 交互对象列表
let visualObjects = [];
let currentObject = -1;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

// --- 状态控制 ---
let isCountingDown = false;
let countdownTimer = 0;
let isProcessing = false; 
let isFrozen = false;    
let frozenImage;         

// API 设置 (Replicate 代理)
const proxyUrl = "https://itp-ima-replicate-proxy.web.app/api/create_n_get"; 

function preload() {
    handPose = ml5.handPose();
}

function setup() {
    p5Canvas = createCanvas(windowWidth, windowHeight);
    video = createCapture(VIDEO);
    video.size(width, height);
    video.hide();
    
    // 开始检测手势
    handPose.detectStart(video, gotHands);
    
    // --- 这里就是之前报错的地方，现在下面的函数定义补全了就好了 ---
    p5Canvas.canvas.addEventListener('mousedown', handleMouseDown);
    p5Canvas.canvas.addEventListener('mousemove', handleMouseMove);
    p5Canvas.canvas.addEventListener('mouseup', handleMouseUp);
}

function gotHands(results) {
    // 只有在非定格状态下更新手势
    if (!isFrozen) {
        hands = results;
    }
}

// --- 专门提取出来的：只画场景（不画UI文字） ---
function drawSceneOnly() {
    // 1. 画背景
    if (isFrozen && frozenImage) {
        image(frozenImage, 0, 0, width, height);
    } else {
        background(0); // 纯黑背景，适合星空
        
        // 2. 画骨架 (仅在非定格且非冻结图模式下)
        push();
        stroke(255);
        strokeWeight(4);
        noFill();
        
        for (let i = 0; i < hands.length; i++) {
            let hand = hands[i];
            for (let j = 0; j < hand.keypoints.length; j++) {
                let kp = hand.keypoints[j];
                fill(255);
                noStroke();
                circle(kp.x, kp.y, 8);
            }
            stroke(255);
            noFill();
            beginShape();
            for (let j = 0; j < handArray.length; j++) {
                let index = handArray[j];
                let kp = hand.keypoints[index];
                vertex(kp.x, kp.y);
            }
            endShape();
        }
        pop();
    }

    // 3. 画生成的图片对象
    for (let obj of visualObjects) {
        obj.display();
    }
}

function draw() {
    // 1. 先画纯净的场景
    drawSceneOnly();

    // 2. 再在顶层画 UI 文字 (截图时不会包含这些)
    fill(255);
    noStroke();
    textAlign(CENTER, CENTER);

    if (isProcessing) {
        textSize(24);
        text("Generating...", width/2, height/2);
        cursor("wait");
        
    } else if (isCountingDown) {
        // 倒计时数字
        textSize(100);
        fill(255, 255, 0); 
        text(countdownTimer, width/2, height/2);
        
        textSize(20);
        fill(255);
        text("Hold Pose!", width/2, height/2 + 80);
        
    } else if (isFrozen) {
        // 结果展示阶段
        textSize(20);
        fill(100, 255, 100); 
        text("Result Generated. Press ENTER to Reset", width/2, height - 50);
        cursor("default");
        
    } else {
        // 待机阶段
        textSize(16);
        textAlign(LEFT, TOP);
        text("Press 'ENTER' to Start", 20, 30);
        cursor("default");
    }
}

// --- 交互逻辑 ---

function keyPressed() {
    // 1. 如果是定格状态，按 Enter 重置所有
    if (isFrozen && key === 'Enter') {
        isFrozen = false;     
        isProcessing = false; 
        frozenImage = null;   
        visualObjects = []; // 清空上一轮
        return;               
    }

    // 2. 如果是正常状态，按 Enter 开始
    if (key === 'Enter' && !isProcessing && !isCountingDown) {
        visualObjects = []; 
        startCountdownAndCapture();
    }
}

function startCountdownAndCapture() {
    isCountingDown = true;
    countdownTimer = 2; 

    let timerInterval = setInterval(() => {
        countdownTimer--;
        if (countdownTimer <= 0) {
            clearInterval(timerInterval);
        }
    }, 1000);

    // 2秒后截图
    setTimeout(() => {
        isCountingDown = false; 
        captureCanvasAndSend(); 
    }, 2000); 
}

async function captureCanvasAndSend() {
    isProcessing = true;
    
    // --- 关键步骤 ---
    drawSceneOnly(); // 强制刷新画面，去掉UI
    frozenImage = get(); // 截图
    isFrozen = true;     // 锁定
    
    console.log("定格！发送纯净画面给 AI...");
    
    let canvasData = p5Canvas.canvas.toDataURL("image/png");

    // 这里是你的 Prompt
    let promptText = "To generate an animal constellation map, it is necessary to also draw the faint outline of the animal's silhouette.";    
    
    const data = {
        version: "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        
        input: {
            prompt: promptText,
            image: canvasData, 
            prompt_strength: 0.9, // 强度
            guidance_scale: 7
        }
    };

    try {
        const response = await fetch(proxyUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: 'application/json',
            },
            body: JSON.stringify(data),
        });

        const json_response = await response.json();
        console.log("AI 响应:", json_response); // 方便调试

        if (json_response.output) {
            let imgUrl = Array.isArray(json_response.output) ? json_response.output[0] : json_response.output;
            
            loadImage(imgUrl, (loadedImg) => {
                let displaySize = 512; 
                let centerX = width/2 - displaySize/2;
                let centerY = height/2 - displaySize/2;

                let newObj = new VisualObject(promptText, loadedImg, centerX, centerY, displaySize, displaySize);
                visualObjects.push(newObj);
                
                isProcessing = false; 
            });
        } else {
            console.log("AI 出错或无输出");
            isProcessing = false; 
        }

    } catch (error) {
        console.error("AI 请求失败:", error);
        isProcessing = false;
    }
}

// --- VisualObject 类 ---
class VisualObject {
    constructor(prompt, img, x, y, w, h) {
        this.prompt = prompt;
        this.img = img;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
    }

    display() {
        image(this.img, this.x, this.y, this.w, this.h);
        noFill();
        stroke(255, 100);
        strokeWeight(2);
        rect(this.x, this.y, this.w, this.h);
    }

    isOver(mx, my) {
        return (mx > this.x && mx < this.x + this.w && my > this.y && my < this.y + this.h);
    }
}

// --- 鼠标交互逻辑 (之前就是缺了这部分) ---
function handleMouseDown(e) {
    if (isProcessing) return; 

    let mx = e.clientX;
    let my = e.clientY;

    for (let i = visualObjects.length - 1; i >= 0; i--) {
        if (visualObjects[i].isOver(mx, my)) {
            currentObject = i;
            isDragging = true;
            dragOffsetX = mx - visualObjects[i].x;
            dragOffsetY = my - visualObjects[i].y;
            let obj = visualObjects.splice(i, 1)[0];
            visualObjects.push(obj);
            currentObject = visualObjects.length - 1;
            break;
        }
    }
}

function handleMouseMove(e) {
    if (isDragging && currentObject !== -1) {
        visualObjects[currentObject].x = e.clientX - dragOffsetX;
        visualObjects[currentObject].y = e.clientY - dragOffsetY;
    }
}

function handleMouseUp() {
    isDragging = false;
    currentObject = -1;
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}