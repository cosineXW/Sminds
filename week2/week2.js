

// --- 你的 API Token 放这里 ---
let authToken = "eyJhbGciOiJSUzI1NiIsImtpZCI6ImY3NThlNTYzYzBiNjRhNzVmN2UzZGFlNDk0ZDM5NTk1YzE0MGVmOTMiLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoiWWlyZW4gWmhhbmciLCJwaWN0dXJlIjoiaHR0cHM6Ly9saDMuZ29vZ2xldXNlcmNvbnRlbnQuY29tL2EvQUNnOG9jTHZJU29ZV2JEQkpMZTI0SFE3M2xkRXVCQTR5VS1UTDJlcFV1ZzYyY0hEemFvQXdwMD1zOTYtYyIsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9pdHAtaW1hLXJlcGxpY2F0ZS1wcm94eSIsImF1ZCI6Iml0cC1pbWEtcmVwbGljYXRlLXByb3h5IiwiYXV0aF90aW1lIjoxNzY5NjMxNTU2LCJ1c2VyX2lkIjoiT25aYkhpMURBVlFsN0JQRUhSc0JNZEJXVTR5MiIsInN1YiI6Ik9uWmJIaTFEQVZRbDdCUEVIUnNCTWRCV1U0eTIiLCJpYXQiOjE3NzAyMjMxMDQsImV4cCI6MTc3MDIyNjcwNCwiZW1haWwiOiJ5ejEwNDQ0QG55dS5lZHUiLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJnb29nbGUuY29tIjpbIjEwMzQ1NzQyNzA4OTk0NTkzODUzMCJdLCJlbWFpbCI6WyJ5ejEwNDQ0QG55dS5lZHUiXX0sInNpZ25faW5fcHJvdmlkZXIiOiJnb29nbGUuY29tIn19.sNarUjdqQ5rdswBzBdDw6ccvRNYbHsWt8H-_jQ8lMpzjnCalArkJ77b-X5Lfbkkgz3TNbW-Aj5wE8EFr6NvVfujkcEJ9s3l0nqREP-nADmdyFi2YWI3d7_e9xfwsS_-e6LHUFM2tsWWbo7wst1o3d-kG8ora1KGomXI6MU8tbAM3Ct4xCmrY2ff2WzXfk0uijAZLFwKDXNO0ddj04l3Sgaf-tDI0SHZwm0hrcmTaJ0Lpo-Vn8HDDygtSfSNhtNGAkahPHmGCvgMCh9LYGMKLxnBqbbB21U1F-WhoGljugh44jzo099840UXsdep7m2SHIXQ3bI9BqqghmAKbRbaRKg"; 

// --- 核心变量 ---
let milliSec;
let bandWidth = 24; 
let spectrum = new Array(bandWidth).fill(0);
let textSong = new Array(bandWidth).fill("."); // 初始化防止 undefined
let font;

// AI 数据
let currentLabel = "WAITING..."; 
let currentConfidence = 0; // 用来控制动画强度的变量
let targetConfidence = 0.5; // 目标强度
let isLoading = false;

// 动态颜色 (默认初始色)
let dominantCol;  
let secondaryCol; 

let isFeedback = false;

// 输入框相关
let inputBox;

function setup() {
    createCanvas(windowWidth, windowHeight);
    angleMode(DEGREES);
    background(20);
    font = 'Arial'; // 或者你可以加载自定义字体
    
    // 初始化颜色
    dominantCol = color(0, 0, 255);
    secondaryCol = color(255, 255, 255);

    // 初始化界面 (输入框)
    initInterface();
    
    // 初始填充
    populateText("READY");
}

function draw() {   
    background(20); // 每一帧刷新背景，如果你想要拖尾效果可以把这个放在 else 里或者加透明度
    
    // --- 动画数值逻辑 ---
    // 如果正在加载，让信心值像呼吸灯一样
    if (isLoading) {
        targetConfidence = (sin(frameCount * 5) + 1) / 2; 
    } else {
        targetConfidence = 0.8; // 输入完成后保持高亮
    }
    
    // 平滑过渡动画强度
    currentConfidence = lerp(currentConfidence, targetConfidence, 0.05);
    let amp = map(currentConfidence, 0, 1, 50, 255);

    // 伪频谱生成 (保留你的 noise 逻辑)
    for (let i = 0; i < bandWidth; i++) {
        let n = noise(i * 0.1, frameCount * 0.01);
        spectrum[i] = map(n, 0, 1, 0, amp); 
    }

    // --- 视觉绘制 ---
    noFill();
    textAlign(CENTER, CENTER);

    milliSec = millis();

    // 缓慢自转
    let globalRotation = frameCount * 0.2;

    // 底层 (副色)
    let bottomLayerColor = color(red(secondaryCol), green(secondaryCol), blue(secondaryCol), 100);
    auSpectrum(spectrum, width/2, height/2, 500, bottomLayerColor, 45 + globalRotation, amp);
    
    // 顶层 (主色)
    let topLayerColor = color(red(dominantCol), green(dominantCol), blue(dominantCol), 180);
    auSpectrum(spectrum, width/2, height/2, 200, topLayerColor, 0 + globalRotation, amp);
    auSpectrum(spectrum, width/2, height/2, 800, topLayerColor, 90 + globalRotation, amp);

    // 故障闪烁逻辑
    if(amp > 200 && floor(milliSec) % 200 < random(120, 160)) {
        isFeedback = true;
    } else {
        isFeedback = false;
    }

    drawBottomUI();
}

// --- 界面初始化 ---

function initInterface() {
    // 创建输入框
    inputBox = createInput('');
    inputBox.attribute('placeholder', 'input any words and press enter...');
    inputBox.attribute('autocomplete', 'off');
    
    // 样式美化
    inputBox.position(width / 2 - 150, height / 2 - 25);
    inputBox.size(300, 50);
    inputBox.style('font-size', '24px');
    inputBox.style('text-align', 'center');
    inputBox.style('border', 'none');
    inputBox.style('border-bottom', '2px solid white');
    inputBox.style('background', 'transparent');
    inputBox.style('color', '#FFF');
    inputBox.style('outline', 'none');
    inputBox.style('z-index', '100');

    // 👇 关键部分：监听回车
    inputBox.elt.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            let val = inputBox.value();
            if(val.trim() !== "") {
                
                // 1. 这里直接用你的输入去生成文字粒子（强制顺序）
                populateText(val); 
                
                // 2. 依然去问 AI 要颜色，但 AI 回来后不会再改你的字了
                askAI(val);
                
                inputBox.value(''); // 清空输入框
                inputBox.elt.blur(); // 移除焦点
            }
        }
    });
}

// --- 核心修改：auSpectrum (保留你的逻辑) ---
function auSpectrum(spec, posX, posY, radius, colorRef, rotXOffset, visualIntensity) {
    push();
    stroke(colorRef);
    
    for (let i = 0; i< spec.length; i++){
        
        // 动态计算字体大小
        let dynamicSize = map(visualIntensity, 0, 255, 10, 60); 
        let individualSize = dynamicSize + map(spec[i], 0, 255, 0, 20);
        
        textFont(font, individualSize);
        // 安全获取字符，防止数组越界
        let charIndex = i % textSong.length;
        let letter = textSong[charIndex];
        
        for (let j = 0; j < 360; j+=120) {
            let r = map(spec[i], 0, 255, 0, radius); 
            let angle = j + rotXOffset + (i * 30);
            
            let x = posX + (r * cos(angle)) + random(5,8);
            let y = posY + (r * sin(angle)) + random(5,8);
            text(letter, x, y);
        }
    }
    pop();
}

// 找到这个函数，把里面的内容全换成下面这样
function populateText(sourceWord) {   
    if (!sourceWord) sourceWord = ".";
    
    // 强制转成大写，视觉效果更好
    sourceWord = sourceWord.toUpperCase(); 

    for(let i = 0; i < bandWidth; i++) {
        // 核心修改：用 % 实现循环读取，而不是 random 随机抓取
        textSong[i] = sourceWord.charAt(i % sourceWord.length);
    }
}

function drawBottomUI() {
    push();
    resetMatrix(); 
    let padding = 30;
    textAlign(RIGHT, BOTTOM);
    textSize(16);
    noStroke();
    
    let x = width - padding;
    let y = height - padding;

    // 显示当前的主题词
    fill(dominantCol);
    textStyle(BOLD);
    textSize(32);
    text(currentLabel.toUpperCase(), x, y - 40);
    
    textStyle(NORMAL);
    textSize(12);
    fill(255, 150);
    if(isLoading) {
         text("AI IS THINKING COLORS...", x, y - 20);
    } else {
         text("GENERATED BY GPT-5", x, y - 20);
    }
    
    // 小色块指示器
    fill(dominantCol);
    rect(x - 10, y - 10, 10, 10);
    fill(secondaryCol);
    rect(x - 25, y - 10, 10, 10);
    
    pop();
}

// --- AI 请求部分 ---
async function askAI(word) {
    console.log("Asking AI about:", word);
    isLoading = true;
    currentLabel = word; 
    
    const url = "https://itp-ima-replicate-proxy.web.app/api/create_n_get";
    
    let prompt = `For the concept "${word}", return a valid JSON object strictly with no markdown formatting. 
    The JSON must have these fields:
    1. "related_words": a single string of 5 related uppercase words joined together (e.g. "APPLEFRESHRED...").
    2. "dominant_color": a hex color code representing the concept (e.g. "#FF0000").
    3. "secondary_color": a contrasting hex color code (e.g. "#00FF00").`;

    document.body.style.cursor = "progress";
    
    const data = {
        model: "openai/gpt-5", // 或者 gpt-4o，看你 proxy 支持啥
        input: { prompt: prompt },
    };

    try {
        const options = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: 'application/json',
                'Authorization': `Bearer ${authToken}`,
            },
            body: JSON.stringify(data),
        };

        const raw_response = await fetch(url, options);
        const json_response = await raw_response.json();
        
        console.log("AI Response:", json_response);
        
        // 解析 AI 返回的内容
        let resultText = json_response.output.join("");
        // 尝试清理可能存在的 markdown 符号 (```json ... ```)
        resultText = resultText.replace(/```json/g, "").replace(/```/g, "");
        
        let parsedData = JSON.parse(resultText);
        
        // 1. 应用颜色
        if(parsedData.dominant_color) dominantCol = color(parsedData.dominant_color);
        if(parsedData.secondary_color) secondaryCol = color(parsedData.secondary_color);
        
        // 2. 应用文字
        if(parsedData.related_words) {
            // 用 API 返回的关联词重新填充粒子
            //populateText(parsedData.related_words);
            // 也可以把 currentLabel 换成 AI 返回的第一个关联词，看你喜好
            // currentLabel = parsedData.related_words.substring(0, 5); 
        }

    } catch (error) {
        console.error("AI Error:", error);
        currentLabel = "ERROR / TRY AGAIN";
    } finally {
        isLoading = false;
        document.body.style.cursor = "auto";
    }
}

// 窗口大小改变时重置画布
function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    inputBox.position(width / 2 - 150, height / 2 - 25);
}