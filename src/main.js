import * as THREE from "https://unpkg.com/three@0.158.0/build/three.module.js";
import { OBJLoader } from "https://unpkg.com/three@0.158.0/examples/jsm/loaders/OBJLoader.js";

const GRID_SIZE = 9;
const TILE_SIZE = 1.2;
const PATH = [
  { x: 0, z: 0 },
  { x: 1, z: 0 },
  { x: 2, z: 0 },
  { x: 3, z: 0 },
  { x: 3, z: 1 },
  { x: 3, z: 2 },
  { x: 4, z: 2 },
  { x: 5, z: 2 },
  { x: 5, z: 3 },
  { x: 5, z: 4 },
  { x: 6, z: 4 },
  { x: 7, z: 4 },
  { x: 7, z: 5 },
  { x: 7, z: 6 },
  { x: 8, z: 6 },
];

const state = {
  gold: 200,
  lives: 20,
  wave: 1,
  placingTower: false,
  towers: [],
  enemies: [],
  projectiles: [],
  lastSpawnTime: 0,
  spawnInterval: 1.6,
  waveActive: false,
};

const ui = {
  gold: document.getElementById("gold"),
  lives: document.getElementById("lives"),
  wave: document.getElementById("wave"),
  placeTower: document.getElementById("place-tower"),
  startWave: document.getElementById("start-wave"),
};

const scene = new THREE.Scene();
scene.background = new THREE.Color("#cfe8ff");

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(8, 9, 10);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.getElementById("game").appendChild(renderer.domElement);

const directionalLight = new THREE.DirectionalLight("#fff9e6", 1.2);
directionalLight.position.set(6, 10, 4);
scene.add(directionalLight);

const ambientLight = new THREE.AmbientLight("#ffffff", 0.5);
scene.add(ambientLight);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const loader = new OBJLoader();

const assets = {
  tile: null,
  towerBase: null,
  roof: null,
};

function loadObj(path) {
  return new Promise((resolve, reject) => {
    loader.load(path, resolve, undefined, reject);
  });
}

function updateUi() {
  ui.gold.textContent = state.gold;
  ui.lives.textContent = state.lives;
  ui.wave.textContent = state.wave;
}

function gridToWorld(x, z) {
  const offset = (GRID_SIZE - 1) * TILE_SIZE * 0.5;
  return new THREE.Vector3(
    x * TILE_SIZE - offset,
    0,
    z * TILE_SIZE - offset
  );
}

function isPathTile(x, z) {
  return PATH.some((node) => node.x === x && node.z === z);
}

function buildFarmTiles() {
  const tiles = new THREE.Group();
  for (let x = 0; x < GRID_SIZE; x += 1) {
    for (let z = 0; z < GRID_SIZE; z += 1) {
      const tile = assets.tile.clone();
      tile.traverse((child) => {
        if (child.isMesh) {
          const isPath = isPathTile(x, z);
          child.material = new THREE.MeshStandardMaterial({
            color: isPath ? "#caa86d" : "#8fd98f",
          });
          child.castShadow = false;
          child.receiveShadow = true;
        }
      });
      const pos = gridToWorld(x, z);
      tile.position.copy(pos);
      tile.scale.setScalar(TILE_SIZE);
      tiles.add(tile);
    }
  }
  scene.add(tiles);
}

function buildPathDecor() {
  const pathGroup = new THREE.Group();
  PATH.forEach((node) => {
    const marker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.3, 0.2, 12),
      new THREE.MeshStandardMaterial({ color: "#f6d6a8" })
    );
    const pos = gridToWorld(node.x, node.z);
    marker.position.set(pos.x, 0.1, pos.z);
    pathGroup.add(marker);
  });
  scene.add(pathGroup);
}

function buildCuteDecor() {
  const fence = new THREE.Mesh(
    new THREE.TorusGeometry(0.45, 0.08, 12, 24),
    new THREE.MeshStandardMaterial({ color: "#f3b5b5" })
  );
  fence.position.set(-4, 0.4, 4);
  fence.rotation.x = Math.PI / 2;
  scene.add(fence);

  const pond = new THREE.Mesh(
    new THREE.CircleGeometry(1.2, 32),
    new THREE.MeshStandardMaterial({ color: "#8fd3ff" })
  );
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(4, 0.02, -4);
  scene.add(pond);
}

function createTower(position) {
  const base = assets.towerBase.clone();
  const roof = assets.roof.clone();

  base.traverse((child) => {
    if (child.isMesh) {
      child.material = new THREE.MeshStandardMaterial({ color: "#f2f0e6" });
    }
  });

  roof.traverse((child) => {
    if (child.isMesh) {
      child.material = new THREE.MeshStandardMaterial({ color: "#f2a4a4" });
    }
  });

  base.scale.setScalar(1.2);
  roof.scale.setScalar(1.2);
  roof.position.y = 0.6;

  const tower = new THREE.Group();
  tower.add(base);
  tower.add(roof);
  tower.position.copy(position);
  tower.position.y = 0.3;

  scene.add(tower);
  state.towers.push({
    mesh: tower,
    cooldown: 0,
    range: 2.8,
  });
}

function spawnEnemy() {
  const enemy = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 16, 16),
    new THREE.MeshStandardMaterial({ color: "#b087ff" })
  );
  const start = gridToWorld(PATH[0].x, PATH[0].z);
  enemy.position.set(start.x, 0.4, start.z);
  scene.add(enemy);
  state.enemies.push({
    mesh: enemy,
    pathIndex: 0,
    progress: 0,
    speed: 0.5 + state.wave * 0.05,
    hp: 3 + state.wave,
  });
}

function updateEnemies(delta) {
  const finished = [];
  state.enemies.forEach((enemy, index) => {
    const current = PATH[enemy.pathIndex];
    const next = PATH[enemy.pathIndex + 1];
    if (!next) {
      finished.push(index);
      return;
    }
    enemy.progress += delta * enemy.speed;
    if (enemy.progress >= 1) {
      enemy.pathIndex += 1;
      enemy.progress = 0;
    }
    const start = gridToWorld(current.x, current.z);
    const end = gridToWorld(next.x, next.z);
    enemy.mesh.position.lerpVectors(start, end, enemy.progress);
    enemy.mesh.position.y = 0.4 + Math.sin(Date.now() / 200) * 0.05;
  });

  finished.reverse().forEach((idx) => {
    const [enemy] = state.enemies.splice(idx, 1);
    scene.remove(enemy.mesh);
    state.lives -= 1;
  });
}

function updateTowers(delta) {
  state.towers.forEach((tower) => {
    tower.cooldown = Math.max(0, tower.cooldown - delta);
    if (tower.cooldown > 0) {
      return;
    }
    const target = state.enemies.find((enemy) =>
      enemy.mesh.position.distanceTo(tower.mesh.position) < tower.range
    );
    if (target) {
      tower.cooldown = 1.0;
      const projectile = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        new THREE.MeshStandardMaterial({ color: "#ffdf7e" })
      );
      projectile.position.copy(tower.mesh.position);
      projectile.position.y += 0.4;
      scene.add(projectile);
      state.projectiles.push({
        mesh: projectile,
        target,
        speed: 4.2,
      });
    }
  });
}

function updateProjectiles(delta) {
  const remove = [];
  state.projectiles.forEach((projectile, index) => {
    if (!state.enemies.includes(projectile.target)) {
      remove.push(index);
      scene.remove(projectile.mesh);
      return;
    }
    const targetPos = projectile.target.mesh.position.clone();
    const direction = targetPos.clone().sub(projectile.mesh.position);
    const distance = direction.length();
    if (distance < 0.2) {
      projectile.target.hp -= 1;
      remove.push(index);
      scene.remove(projectile.mesh);
      if (projectile.target.hp <= 0) {
        scene.remove(projectile.target.mesh);
        state.enemies = state.enemies.filter(
          (enemy) => enemy !== projectile.target
        );
        state.gold += 10;
      }
      return;
    }
    direction.normalize();
    projectile.mesh.position.addScaledVector(direction, delta * projectile.speed);
  });

  remove.reverse().forEach((idx) => state.projectiles.splice(idx, 1));
}

function updateWave(delta) {
  if (!state.waveActive) {
    return;
  }
  state.lastSpawnTime += delta;
  if (state.lastSpawnTime >= state.spawnInterval) {
    state.lastSpawnTime = 0;
    spawnEnemy();
  }
  if (state.lives <= 0) {
    state.waveActive = false;
    ui.startWave.disabled = true;
  }
}

function onPointerMove(event) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onClick(event) {
  onPointerMove(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  const hit = hits.find((item) => item.object.parent);
  if (!hit || !state.placingTower) {
    return;
  }
  const point = hit.point;
  const gridX = Math.round(point.x / TILE_SIZE + (GRID_SIZE - 1) / 2);
  const gridZ = Math.round(point.z / TILE_SIZE + (GRID_SIZE - 1) / 2);
  if (gridX < 0 || gridZ < 0 || gridX >= GRID_SIZE || gridZ >= GRID_SIZE) {
    return;
  }
  if (isPathTile(gridX, gridZ)) {
    return;
  }
  const pos = gridToWorld(gridX, gridZ);
  const occupied = state.towers.some(
    (tower) => tower.mesh.position.distanceTo(pos) < 0.1
  );
  if (occupied || state.gold < 50) {
    return;
  }
  state.gold -= 50;
  createTower(pos);
  state.placingTower = false;
  ui.placeTower.classList.remove("secondary");
  updateUi();
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

let lastTime = performance.now();
function animate(time) {
  const delta = (time - lastTime) / 1000;
  lastTime = time;
  updateWave(delta);
  updateEnemies(delta);
  updateTowers(delta);
  updateProjectiles(delta);
  updateUi();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function setupUi() {
  ui.placeTower.addEventListener("click", () => {
    state.placingTower = !state.placingTower;
    ui.placeTower.classList.toggle("secondary", state.placingTower);
  });
  ui.startWave.addEventListener("click", () => {
    state.waveActive = true;
    state.lastSpawnTime = 0;
    state.wave += 1;
    ui.startWave.disabled = true;
    setTimeout(() => {
      ui.startWave.disabled = false;
      state.waveActive = false;
    }, 14000);
  });
}

async function init() {
  const [tileObj, towerObj, roofObj] = await Promise.all([
    loadObj("assets/models/primitives/tile_ground.obj"),
    loadObj("assets/models/primitives/tower_base.obj"),
    loadObj("assets/models/primitives/barn_roof.obj"),
  ]);

  assets.tile = tileObj;
  assets.towerBase = towerObj;
  assets.roof = roofObj;

  buildFarmTiles();
  buildPathDecor();
  buildCuteDecor();
  setupUi();

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("click", onClick);
  window.addEventListener("resize", resize);
  requestAnimationFrame(animate);
}

init();
