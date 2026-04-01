let video;
let bodyPose;
let poses = [];
let head;
let nose;
let body;
let yawnSound; 
let isAudioStarted = false;

function preload() {
  bodyPose = ml5.bodyPose("BlazePose", { flipped: true });
  head = loadImage("head.png");
  nose = loadImage("nose.png");
  body = loadImage("body.png"); 
  yawnSound = loadSound("yawn.mp3");
}

function setup() {
  createCanvas(840, 600);
  video = createCapture(VIDEO, { flipped: true });
  video.size(840, 600);
  video.hide();
  bodyPose.detectStart(video, gotPoses);
  connections = bodyPose.getSkeleton();
}

function draw() {
  background(0);
  
  if (!isAudioStarted) {
    fill(255); 
    textAlign(CENTER);
    textSize(20);
    strokeWeight(2);
    text("CLICK SCREEN TO START", width/2, height/2);
  }

  for (let i = 0; i < poses.length; i++) {
    let pose = poses[i];
    for (let j = 9; j < connections.length; j++) {
      let pointAIndex = connections[j][0];
      let pointBIndex = connections[j][1];
      let pointA = pose.keypoints[pointAIndex];
      let pointB = pose.keypoints[pointBIndex];
      
      if (pointA.confidence > 0.1 && pointB.confidence > 0.1) {
        stroke(255);
        strokeWeight(10);
        line(pointA.x, pointA.y, pointB.x, pointB.y);
      }
    }

    if (poses.length > 0) {
      let left_ear = poses[0].left_ear;
      let right_ear = poses[0].right_ear;
      let left_shoulder = poses[0].left_shoulder;
      let right_shoulder = poses[0].right_shoulder;
      let right_eye = poses[0].right_eye;
      
      let bodyX = (left_shoulder.x + right_shoulder.x) / 2;
      let bodyY = (left_shoulder.y + right_shoulder.y) / 2;
      let centerX = (left_ear.x + right_ear.x) / 2;
      let centerY = (left_ear.y + right_ear.y) / 2;
      let size = dist(left_ear.x, left_ear.y, right_ear.x, right_ear.y) * 2;
      let size2 = dist(left_shoulder.x, left_shoulder.y, right_shoulder.x, right_shoulder.y) * 2;

      let leftX = poses[0].left_thumb.x;
      let leftY = poses[0].left_thumb.y;
      let rightX = poses[0].right_thumb.x;
      let rightY = poses[0].right_thumb.y;
      
      let handHeight = (leftY + rightY) / 2;
      
      if (isAudioStarted) {
        let armSpan = dist(leftX, leftY, rightX, rightY);
        let rate = map(armSpan, 50, 600, 1.1, 0.9, true);
        yawnSound.rate(rate);
        
        if (handHeight <= right_eye.y) {
          if (!yawnSound.isPlaying()) {
            yawnSound.play();
          }
        }
      }

      image(head, centerX - size * 0.5, centerY - size * 0.5, size, size);
      image(nose, pose.nose.x - 20, pose.nose.y, size * 0.1, size * 0.1);
      fill(0);
      circle(pose.left_eye.x, pose.left_eye.y, size * 0.2);
      circle(pose.right_eye.x, pose.right_eye.y, size * 0.2);
      image(body, bodyX - size2 * 0.3, bodyY, size2 * 0.6, size2 * 0.6);
    }
  }
}

function gotPoses(results) {
  poses = results;
}

function mousePressed() {
  if (!isAudioStarted && yawnSound.isLoaded()) {
    userStartAudio();
    isAudioStarted = true;
  }
}