import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { getSampleAtDistance, INTERLAGOS_TRACK, type InterlagosTrack } from '../sim/track';
import type { CameraMode, CarState } from '../sim/types';
import type { F1CarVisual } from './carBuilder';

// Pre-allocated scratch math objects (Zero GC inside requestAnimationFrame)
const _desiredPos = new THREE.Vector3();
const _desiredLook = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _anchorWorld = new THREE.Vector3();
const _anchorQuat = new THREE.Quaternion();
const _flipYQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const _cockpitTiltQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.072);
const _tcamTiltQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.088);
const _fullOnboardQuat = new THREE.Quaternion();
const _levelOnboardQuat = new THREE.Quaternion();
const _onboardForward = new THREE.Vector3();
const _origin = new THREE.Vector3(0, 0, 0);
const _worldUp = new THREE.Vector3(0, 1, 0);
const _lookMat = new THREE.Matrix4();

function createSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MultiCameraRig {
  private currentPos = new THREE.Vector3(0, 60, 120);
  private currentLook = new THREE.Vector3(0, 35, 0);
  private currentFov = 62;
  private apexLead = 0;
  private rollAngle = 0;
  private initialized = false;
  private lastMode: CameraMode | null = null;
  private onboardQuat = new THREE.Quaternion();
  private onboardQuatInitialized = false;
  private activeTowerIdx = -1;
  private lastTowerSwitchTime = -99;
  private flyoverTime = 0.94;
  private trauma = 0;
  private noise2D = createNoise2D(createSeededRng(20261116));

  public reset(): void {
    this.initialized = false;
    this.lastMode = null;
    this.onboardQuatInitialized = false;
    this.activeTowerIdx = -1;
    this.lastTowerSwitchTime = -99;
    this.trauma = 0;
    this.apexLead = 0;
    this.rollAngle = 0;
  }

  public addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  public updateTitleFlyover(
    camera: THREE.PerspectiveCamera,
    dt: number,
    track: InterlagosTrack = INTERLAGOS_TRACK,
  ): void {
    this.flyoverTime += dt * 0.022;
    const t = ((this.flyoverTime % 1) + 1) % 1;
    const sample = getSampleAtDistance(t * track.totalLength, track);
    const ahead = getSampleAtDistance((t + 0.045) * track.totalLength, track);

    _desiredPos.set(
      sample.pos.x - sample.tangent.x * 34 - sample.right.x * 28,
      sample.pos.y + 24,
      sample.pos.z - sample.tangent.z * 34 - sample.right.z * 28,
    );
    _desiredLook.set(
      ahead.pos.x - ahead.right.x * 11,
      ahead.pos.y + 1.5,
      ahead.pos.z - ahead.right.z * 11,
    );

    if (!this.initialized) {
      this.currentPos.copy(_desiredPos);
      this.currentLook.copy(_desiredLook);
      this.initialized = true;
    } else {
      const k = 1 - Math.exp(-3.2 * dt);
      this.currentPos.lerp(_desiredPos, k);
      this.currentLook.lerp(_desiredLook, k);
    }

    const nextFov = THREE.MathUtils.damp(camera.fov, 54, 4, dt);
    const needProj = Math.abs(camera.fov - nextFov) > 1e-4 || Math.abs(camera.near - 0.35) > 1e-4;
    camera.fov = nextFov;
    camera.near = 0.35;
    if (needProj) camera.updateProjectionMatrix();
    camera.position.copy(this.currentPos);
    camera.lookAt(this.currentLook);
  }

  public updateGameplayCamera(
    camera: THREE.PerspectiveCamera,
    mode: CameraMode,
    playerCar: CarState,
    playerVisual: F1CarVisual,
    dt: number,
    immediateSnap = false,
    track: InterlagosTrack = INTERLAGOS_TRACK,
    gameTimeSec = 0,
    cockpitFov = 76,
    horizonLock = 0.72,
  ): void {
    const modeChanged = this.lastMode !== mode;
    this.lastMode = mode;
    if (modeChanged) {
      this.onboardQuatInitialized = false;
    }

    _fwd.set(Math.sin(playerCar.yaw), 0, Math.cos(playerCar.yaw));
    _right.set(-_fwd.z, 0, _fwd.x);

    const speedNorm = Math.min(1, playerCar.speed / 92);
    const isOnboard = mode === 'cockpit' || mode === 'tcam';

    // Accumulate trauma from serrated kerbs, gravel off-track rumble, and wall/car impacts
    if (playerCar.impactIntensity > 0.14) {
      this.addTrauma(Math.min(0.65, playerCar.impactIntensity * 0.55));
    } else if (playerCar.onKerb && playerCar.speed > 12) {
      this.addTrauma(0.18 * dt * 9);
    } else if (!playerCar.onTrack && playerCar.speed > 14) {
      this.addTrauma(0.22 * dt * 8);
    }
    this.trauma = Math.max(0, this.trauma - 2.6 * dt);

    // Quadratic trauma with simulation-clock Simplex noise (position + subtle rotational shake)
    const shakeScale = isOnboard ? 0.011 : 0.085;
    const shakeMag = this.trauma * this.trauma * shakeScale;
    const shakeX = shakeMag * this.noise2D(gameTimeSec * 24, 1.3);
    const shakeY = shakeMag * this.noise2D(gameTimeSec * 24, 7.9);
    const shakeRotX = this.trauma * this.trauma * (isOnboard ? 0.0055 : 0.011) * this.noise2D(gameTimeSec * 29, 13.7);
    const shakeRotZ = this.trauma * this.trauma * (isOnboard ? 0.0085 : 0.014) * this.noise2D(gameTimeSec * 29, 21.1);

    let targetFov = 62;
    let posDamp = 10;
    let lookDamp = 14;
    let targetRoll = 0;
    const targetNear = isOnboard ? 0.14 : 0.35;

    if (isOnboard) {
      playerVisual.root.updateMatrixWorld(true);
      const anchor =
        mode === 'cockpit' ? playerVisual.cockpitCameraAnchor : playerVisual.tcamCameraAnchor;
      anchor.getWorldPosition(_anchorWorld);
      anchor.getWorldQuaternion(_anchorQuat);

      // Transform car-space (+Z fwd, +Y up) into camera-space (-Z fwd, +Y up) with downward apex tilt
      _fullOnboardQuat.copy(_anchorQuat).multiply(_flipYQuat);
      _fullOnboardQuat.multiply(mode === 'cockpit' ? _cockpitTiltQuat : _tcamTiltQuat);

      // Compute horizon-leveled counterpart preserving elevation ramp pitch along vehicle heading
      _onboardForward.set(0, 0, -1).applyQuaternion(_fullOnboardQuat).normalize();
      _lookMat.lookAt(_origin, _onboardForward, _worldUp);
      _levelOnboardQuat.setFromRotationMatrix(_lookMat);

      const lockAlpha = THREE.MathUtils.clamp(horizonLock, 0, 1);
      // Blend toward horizon-locked quaternion according to player preference (0=chassis, 1=level)
      _fullOnboardQuat.slerp(_levelOnboardQuat, lockAlpha);

      if (!this.onboardQuatInitialized || immediateSnap) {
        this.onboardQuat.copy(_fullOnboardQuat);
        this.onboardQuatInitialized = true;
      } else {
        const qBlend = 1 - Math.exp(-24 * dt);
        this.onboardQuat.slerp(_fullOnboardQuat, qBlend);
      }

      targetFov =
        mode === 'cockpit'
          ? THREE.MathUtils.clamp(cockpitFov, 64, 92) + speedNorm * 4.0
          : 64 + speedNorm * 4.2;

      const fovAlpha = !this.initialized || immediateSnap ? 1 : 1 - Math.exp(-9 * dt);
      const nextFov = THREE.MathUtils.lerp(this.currentFov, targetFov, fovAlpha);
      const needProj =
        Math.abs(camera.fov - nextFov) > 1e-4 || Math.abs(camera.near - targetNear) > 1e-4;
      this.currentFov = nextFov;
      this.currentPos.copy(_anchorWorld);
      this.initialized = true;

      camera.fov = this.currentFov;
      camera.near = targetNear;
      if (needProj) camera.updateProjectionMatrix();

      camera.position.set(_anchorWorld.x + shakeX, _anchorWorld.y + shakeY, _anchorWorld.z);
      camera.quaternion.copy(this.onboardQuat);
      if (Math.abs(shakeRotX) > 1e-5 || Math.abs(shakeRotZ) > 1e-5) {
        camera.rotateX(shakeRotX);
        camera.rotateZ(shakeRotZ);
      }
      return;
    }

    if (mode === 'chase') {
      if (playerCar.forwardSpeed > 8 && playerCar.speed > 8) {
        const vxNorm = playerCar.vx / playerCar.speed;
        const vzNorm = playerCar.vz / playerCar.speed;
        _fwd.x = _fwd.x * 0.72 + vxNorm * 0.28;
        _fwd.z = _fwd.z * 0.72 + vzNorm * 0.28;
        _fwd.normalize();
      }
      // Corner apex look-ahead + subtle G-force camera sway
      const desiredApexLead = playerCar.steerAngle * (1.8 + speedNorm * 2.2);
      this.apexLead = THREE.MathUtils.damp(this.apexLead, desiredApexLead, 8, dt);
      targetRoll = THREE.MathUtils.clamp(-playerCar.steerAngle * speedNorm * 0.045, -0.032, 0.032);

      const distBack = 7.35 + speedNorm * 0.9 - (playerCar.drsActive ? 0.2 : 0);
      const height = 2.6 + speedNorm * 0.22;
      _desiredPos
        .set(playerCar.x, playerCar.y + height, playerCar.z)
        .addScaledVector(_fwd, -distBack)
        .addScaledVector(_right, -this.apexLead * 0.22);
      _desiredLook
        .set(playerCar.x, playerCar.y + 1.04, playerCar.z)
        .addScaledVector(_fwd, 13.5)
        .addScaledVector(_right, this.apexLead);
      targetFov = 60 + speedNorm * 10.5 + (playerCar.drsActive ? 2.5 : 0);
      posDamp = 14;
      lookDamp = 18;
    } else if (mode === 'trackside') {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < track.towers.length; i++) {
        const tw = track.towers[i];
        const d = Math.hypot(tw.pos.x - playerCar.x, tw.pos.z - playerCar.z);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }

      // Broadcast tower hysteresis: keep active tower unless new tower is 25% closer AND >= 2.0s elapsed
      let towerSwitched = false;
      if (this.activeTowerIdx < 0 || this.activeTowerIdx >= track.towers.length) {
        this.activeTowerIdx = bestIdx;
        this.lastTowerSwitchTime = gameTimeSec;
        towerSwitched = true;
      } else if (bestIdx !== this.activeTowerIdx) {
        const currTw = track.towers[this.activeTowerIdx];
        const currDist = Math.hypot(currTw.pos.x - playerCar.x, currTw.pos.z - playerCar.z);
        if (bestDist < currDist * 0.75 && gameTimeSec - this.lastTowerSwitchTime >= 2.0) {
          this.activeTowerIdx = bestIdx;
          this.lastTowerSwitchTime = gameTimeSec;
          towerSwitched = true;
        }
      }

      const activeTw = track.towers[this.activeTowerIdx];
      const activeDist = Math.hypot(activeTw.pos.x - playerCar.x, activeTw.pos.z - playerCar.z);
      _desiredPos.set(activeTw.pos.x, activeTw.pos.y, activeTw.pos.z);
      _desiredLook.set(playerCar.x, playerCar.y + 0.75, playerCar.z);
      const zoomNorm = Math.min(1, activeDist / 190);
      targetFov = activeTw.maxFov - zoomNorm * (activeTw.maxFov - activeTw.minFov);
      posDamp = 100;
      lookDamp = 18;
      immediateSnap = !this.initialized || modeChanged || towerSwitched;
    } else {
      _desiredPos
        .set(playerCar.x, playerCar.y + 38, playerCar.z)
        .addScaledVector(_fwd, -32)
        .addScaledVector(_right, 16);
      _desiredLook
        .set(playerCar.x, playerCar.y + 1.0, playerCar.z)
        .addScaledVector(_fwd, 14);
      targetFov = 50;
      posDamp = 5.5;
      lookDamp = 9;
    }

    if (!this.initialized || immediateSnap) {
      this.currentPos.copy(_desiredPos);
      this.currentLook.copy(_desiredLook);
      this.currentFov = targetFov;
      this.rollAngle = targetRoll;
      this.initialized = true;
    } else {
      const kp = 1 - Math.exp(-posDamp * dt);
      const kl = 1 - Math.exp(-lookDamp * dt);
      this.currentPos.lerp(_desiredPos, kp);
      this.currentLook.lerp(_desiredLook, kl);
      this.currentFov = THREE.MathUtils.damp(this.currentFov, targetFov, 7, dt);
      this.rollAngle = THREE.MathUtils.damp(this.rollAngle, targetRoll, 9, dt);
    }

    const needProj =
      Math.abs(camera.fov - this.currentFov) > 1e-4 || Math.abs(camera.near - targetNear) > 1e-4;
    camera.fov = this.currentFov;
    camera.near = targetNear;
    if (needProj) camera.updateProjectionMatrix();

    camera.position.set(this.currentPos.x + shakeX, this.currentPos.y + shakeY, this.currentPos.z);
    camera.lookAt(this.currentLook);
    const totalRoll = (mode === 'chase' ? this.rollAngle : 0) + shakeRotZ;
    if (Math.abs(shakeRotX) > 1e-5) {
      camera.rotateX(shakeRotX);
    }
    if (Math.abs(totalRoll) > 1e-4) {
      camera.rotateZ(totalRoll);
    }
  }
}
