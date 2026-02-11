
let handPose;
let video;
let hands = [];
let p5Canvas; // P5的画布引用

let handArray = [
    1, 2, 3, 4, 3, 2, 5, 6, 7, 8, 7, 6, 5, 9, 10, 11, 12, 11, 10, 9, 13, 14, 15, 16, 15, 14, 13, 17, 18, 19, 20, 19, 18, 17, 0
];

// 交互对象列表
let visualObjects = [];
let currentObject = -1;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

// API 设置
const proxyUrl = "https://itp-ima-replicate-proxy.web.app/api/create_n_get"; // 确保这是你的有效代理地址

function preload() {
    handPose = ml5.handPose();
}

function setup() {
    // 创建画布，存入变量以便截图
    p5Canvas = createCanvas(windowWidth, windowHeight);
    
    video = createCapture(VIDEO);
    video.size(width, height);
    video.hide();
    
    // 开始检测
    handPose.detectStart(video, gotHands);
    
    // 鼠标交互事件监听
    p5Canvas.canvas.addEventListener('mousedown', handleMouseDown);
    p5Canvas.canvas.addEventListener('mousemove', handleMouseMove);
    p5Canvas.canvas.addEventListener('mouseup', handleMouseUp);
}

function gotHands(results) {
    hands = results;
}

function draw() {
    // --- 第一层：绘制背景和手势 (作为输入源) ---
    background(0, 50, 150); // 深蓝色背景
    
    // 绘制摄像头捕捉到的手部骨架
    push();
    stroke(255); // 白色线条
    strokeWeight(4);
    noFill();
    
    for (let i = 0; i < hands.length; i++) {
        let hand = hands[i];
        // 绘制关节点
        for (let j = 0; j < hand.keypoints.length; j++) {
            let kp = hand.keypoints[j];
            fill(255);
            noStroke();
            circle(kp.x, kp.y, 8);
        }
        
        // 绘制连线 (根据 handArray)
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

    // --- 第二层：绘制生成的图片对象 (VisualObjects) ---
    // 这些对象浮在手势之上，就像拼贴画
    for (let obj of visualObjects) {
        obj.display();
    }

    // --- UI 提示 ---
    fill(255);
    noStroke();
    textSize(16);
    text("按 'ENTER' 把当前手势变成珊瑚", 20, 30);
}

// --- 2. 交互逻辑 (生成与拖拽) ---

function keyPressed() {
    if (key === 'Enter') {
        generateCoralFromHand();
    }
}

async function generateCoralFromHand() {
    document.body.style.cursor = "wait";
    console.log("正在捕捉画布并请求 AI...");

    let canvasData = p5Canvas.canvas.toDataURL("image/png");

    // 2. 准备 Prompt
    // 我们想要白色珊瑚，海底风格
    let promptText = "White coral reef structure, underwater photography, organic intricate details, deep blue ocean background, 8k, masterpiece, bioluminescent glow";
    
    const data = {
        // model: "stability-ai/sdxl", 
        version: "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        
        input: {
            prompt: promptText,
            image: canvasData, 
            strength: 0.75, // 这个参数后面可能要调，下面细说
            guidance_scale: 7.5
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
        console.log("AI 响应:", json_response);

        if (json_response.output) {
            // 处理返回的图片 (有些模型返回数组，有些返回字符串)
            let imgUrl = Array.isArray(json_response.output) ? json_response.output[0] : json_response.output;
            
            loadImage(imgUrl, (loadedImg) => {
                // 创建一个新的 VisualObject
                // 位置随机一点，或者放在画布中心
                let newObj = new VisualObject(promptText, loadedImg, width/2 - 128, height/2 - 128, 256, 256);
                visualObjects.push(newObj);
            });
        }

    } catch (error) {
        console.error("AI 请求失败:", error);
    }
    
    document.body.style.cursor = "default";
}

// --- 3. VisualObject 类 (拼贴元素) ---
class VisualObject {
    constructor(prompt, img, x, y, w, h) {
        this.prompt = prompt;
        this.img = img; // p5.Image 对象
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
    }

    display() {
        image(this.img, this.x, this.y, this.w, this.h);
        // 如果需要显示文字标签，取消下面注释
        // fill(255);
        // textSize(10);
        // text(this.prompt.substring(0, 10) + "...", this.x, this.y + this.h + 15);
    }

    isOver(mx, my) {
        return (mx > this.x && mx < this.x + this.w && my > this.y && my < this.y + this.h);
    }
}

// --- 4. 鼠标拖拽逻辑 ---
function handleMouseDown(e) {
    let mx = e.clientX;
    let my = e.clientY;

    // 倒序遍历，这样先选中最上面的
    for (let i = visualObjects.length - 1; i >= 0; i--) {
        if (visualObjects[i].isOver(mx, my)) {
            currentObject = i;
            isDragging = true;
            dragOffsetX = mx - visualObjects[i].x;
            dragOffsetY = my - visualObjects[i].y;
            // 把选中的移到数组最后（渲染在最上层）
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