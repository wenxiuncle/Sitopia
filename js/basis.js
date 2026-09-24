import * as THREE from "../vendor/three.module.js";

const UP = new THREE.Vector3(0, 1, 0);

// 右手系、Y 轴向上。相机默认朝世界 -Z。
// right = forward × up。朝向只读相机自己的矩阵。
export function planarBasis(camera, forward, right) {
  camera.getWorldDirection(forward);
  forward.y = 0;
  const len = forward.length();
  if (len < 1e-6) forward.set(0, 0, -1);
  else forward.multiplyScalar(1 / len);
  right.crossVectors(forward, UP);
}

// 人物正面是局部 -Z。这个 yaw 写进 Object3D.rotation.y，正面就朝向 forward。
// forward=(0,0,-1) → 0；forward=(1,0,0) → -π/2。
export function yawFacing(forward) {
  return Math.atan2(-forward.x, -forward.z);
}

// yawFacing 的反变换。平面图上的朝向只用这一处，不再另写一套。
export function forwardFromYaw(yaw, out) {
  out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  return out;
}
