// 一楼门厅的接待机器人。一个网格，基本材质。胸前屏幕是这一台自己的字，不是展品站名。
import * as THREE from "../vendor/three.module.js";
import { attachSun } from "./meshes.js";
import { DEFAULT_SIGN, DEFAULT_SIGN_SPEED, cleanSign, readSignSpeed, signTravel } from "./sign.js";

const raycaster = new THREE.Raycaster();
const aim = new THREE.Vector3();

function box(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function createScreen() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 288;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  let text = DEFAULT_SIGN;
  let speed = DEFAULT_SIGN_SPEED;
  let parked = false;
  // 屏幕网格会绕 Y 转 180° 朝向馆门。转过之后字已经是正的，再镜像就会反着读。
  // 字从右往左滚。边框画在裁切外面，不跟着走。速度 0 时只画一次，停在屏幕中间。
  function paint(now) {
    if (speed === 0 && parked) return;
    ctx.fillStyle = "#1a2744";
    ctx.fillRect(0, 0, 512, 288);
    ctx.strokeStyle = "#3ad4e6";
    ctx.lineWidth = 6;
    ctx.strokeRect(18, 18, 476, 252);
    ctx.fillStyle = "#d8fff6";
    ctx.font = "600 72px Songti SC, SimSun, STSong, serif";
    ctx.textBaseline = "middle";
    const width = Math.max(1, ctx.measureText(text).width);
    const innerLeft = 36;
    const innerRight = 476;
    ctx.save();
    ctx.beginPath();
    ctx.rect(30, 30, 452, 228);
    ctx.clip();
    if (speed === 0) {
      const room = innerRight - innerLeft;
      ctx.textAlign = width <= room ? "center" : "left";
      ctx.fillText(text, width <= room ? (innerLeft + innerRight) / 2 : innerLeft, 150);
      parked = true;
    } else {
      parked = false;
      ctx.textAlign = "left";
      const gap = 96;
      const span = width + gap;
      const travel = signTravel(now, speed) % span;
      let x = innerRight - travel;
      while (x > innerLeft - span) x -= span;
      for (; x < innerRight; x += span) ctx.fillText(text, x, 150);
    }
    ctx.restore();
    texture.needsUpdate = true;
  }
  paint(0);
  return {
    texture,
    setText(value) {
      const next = cleanSign(value);
      if (next === text) return;
      text = next;
      parked = false;
    },
    setSpeed(value) {
      if (value == null || value === "") return;
      const next = readSignSpeed(value);
      if (next < 0 || next === speed) return;
      speed = next;
      parked = false;
    },
    paint,
  };
}

function lidAmount(now) {
  const t = now % 3900;
  if (t > 170) return 0;
  const u = t < 75 ? t / 75 : (170 - t) / 95;
  return u < 0 ? 0 : u;
}

export function createReception(scene, sunShared, sunRole) {
  const white = new THREE.MeshBasicMaterial({ color: 0xf4f7fb });
  const silver = new THREE.MeshBasicMaterial({ color: 0xc5ccd4 });
  const rubber = new THREE.MeshBasicMaterial({ color: 0x14171c });
  const cyan = new THREE.MeshBasicMaterial({ color: 0x3ad4e6, fog: false });
  const dark = new THREE.MeshBasicMaterial({ color: 0x101820, fog: false });
  const lidMat = new THREE.MeshBasicMaterial({ color: 0xf4f7fb });
  attachSun(white, sunShared, sunRole);
  attachSun(silver, sunShared, sunRole);
  attachSun(lidMat, sunShared, sunRole);

  const screen = createScreen();
  const screenMat = new THREE.MeshBasicMaterial({ map: screen.texture, fog: false });
  const group = new THREE.Group();
  group.name = "reception";

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.4, 18),
    new THREE.MeshBasicMaterial({ color: 0x1a1614, transparent: true, opacity: 0.16, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  shadow.raycast = () => {};
  group.add(shadow);

  const skirt = box(0.7, 0.16, 0.56, white, 0, 0.2, 0);
  group.add(skirt);
  group.add(box(0.6, 0.02, 0.48, silver, 0, 0.29, 0));
  // 四颗黑球收在最下面那块白座里面，上沿埋进座底，不探出外沿。
  const footGeo = new THREE.SphereGeometry(0.06, 14, 10);
  const footAt = [[-0.14, -0.1], [-0.14, 0.1], [0.14, -0.1], [0.14, 0.1]];
  for (let i = 0; i < footAt.length; i++) {
    const foot = new THREE.Mesh(footGeo, rubber);
    foot.position.set(footAt[i][0], 0.08, footAt[i][1]);
    group.add(foot);
  }

  group.add(box(0.4, 0.56, 0.3, white, 0, 0.6, 0.01));
  group.add(box(0.018, 0.26, 0.02, cyan, -0.19, 0.64, -0.14));
  group.add(box(0.018, 0.26, 0.02, cyan, 0.19, 0.64, -0.14));

  function addArm(side) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.26, 0.8, 0);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), silver);
    const upper = box(0.07, 0.2, 0.07, white, 0, -0.14, 0);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), silver);
    elbow.position.set(0, -0.25, -0.01);
    const fore = box(0.06, 0.16, 0.06, white, 0, -0.36, -0.03);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), white);
    hand.position.set(0, -0.47, -0.06);
    arm.add(shoulder, upper, elbow, fore, hand);
    group.add(arm);
    return arm;
  }
  const armL = addArm(-1);
  const armR = addArm(1);
  group.add(box(0.34, 0.22, 0.03, dark, 0, 0.7, -0.15));
  const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.18), screenMat);
  screenMesh.position.set(0, 0.7, -0.168);
  screenMesh.rotation.y = Math.PI;
  group.add(screenMesh);

  group.add(box(0.16, 0.06, 0.16, silver, 0, 0.92, 0));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), white);
  head.position.set(0, 1.14, 0);
  group.add(head);
  group.add(box(0.24, 0.13, 0.016, dark, 0, 1.15, -0.214));

  const ringGeo = new THREE.TorusGeometry(0.026, 0.006, 6, 16);
  const eyeGeo = new THREE.SphereGeometry(0.014, 10, 8);
  const eyes = [-0.058, 0.058];
  const lids = [];
  for (let i = 0; i < eyes.length; i++) {
    const x = eyes[i];
    const ring = new THREE.Mesh(ringGeo, cyan);
    ring.position.set(x, 1.158, -0.232);
    const pupil = new THREE.Mesh(eyeGeo, dark);
    pupil.position.set(x, 1.158, -0.242);
    const lidGeo = new THREE.BoxGeometry(0.07, 0.064, 0.012);
    lidGeo.translate(0, -0.032, 0);
    const lid = new THREE.Mesh(lidGeo, lidMat);
    lid.position.set(x, 1.19, -0.25);
    lid.visible = false;
    lids.push(lid);
    group.add(ring, pupil, lid);
  }

  group.scale.setScalar(1.3);
  scene.add(group);

  let travel = 0;
  let lastX = 0;
  let lastZ = 0;
  let placed = false;

  return {
    group,
    setSign(value, speed) {
      screen.setText(value);
      screen.setSpeed(speed);
    },
    pick(origin, direction, minT) {
      aim.copy(direction);
      if (aim.lengthSq() < 1e-8) return -1;
      aim.normalize();
      raycaster.set(origin, aim);
      raycaster.near = minT > 0 ? minT : 0;
      raycaster.far = 7;
      const hits = raycaster.intersectObject(group, true);
      return hits.length ? hits[0].distance : -1;
    },
    place(pose, now, paused) {
      const dist = placed ? Math.hypot(pose.x - lastX, pose.z - lastZ) : 0;
      lastX = pose.x;
      lastZ = pose.z;
      placed = true;
      group.position.set(pose.x, 0, pose.z);
      group.rotation.y = pose.yaw;
      const rest = 0.2;
      // 卡片开着时不往前走，手臂收回。眼睛照常眨。
      if (paused) {
        armL.rotation.x += (rest - armL.rotation.x) * 0.3;
        armR.rotation.x += (rest - armR.rotation.x) * 0.3;
      } else {
        if (dist < 1.2) travel += dist;
        const walking = dist > 0.0004;
        const pace = walking ? Math.sin(travel * 7) * 0.35 : 0;
        armL.rotation.x += (rest + pace - armL.rotation.x) * 0.3;
        armR.rotation.x += (rest - pace - armR.rotation.x) * 0.3;
      }
      screen.paint(now);
      const blink = lidAmount(now);
      const show = blink > 0.05;
      const scale = 0.08 + blink;
      for (let i = 0; i < lids.length; i++) {
        lids[i].visible = show;
        lids[i].scale.y = scale;
      }
    },
  };
}
