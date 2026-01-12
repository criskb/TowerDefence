import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

const GRID_SIZE = 9;
const TILE_SIZE = 1.2;
const MAP_RANDOMNESS = 0.65;

const TOWER_TYPES = {
  sprout: {
    id: "sprout",
    name: "Sprout",
    cost: 50,
    range: 2.6,
    fireRate: 0.8,
    damage: 1,
    projectileSpeed: 4.8,
    projectileColor: "#ffdf7e",
    baseColor: "#f2f0e6",
    roofColor: "#f2a4a4",
    description: "Fast shots, short range.",
  },
  bloom: {
    id: "bloom",
    name: "Bloom",
    cost: 75,
    range: 3.2,
    fireRate: 1.1,
    damage: 2,
    projectileSpeed: 4.2,
    projectileColor: "#b6f0ff",
    baseColor: "#e6f4ff",
    roofColor: "#78c6f0",
    description: "Balanced range with heavier hits.",
  },
  orchard: {
    id: "orchard",
    name: "Orchard",
    cost: 110,
    range: 4.0,
    fireRate: 1.6,
    damage: 3,
    projectileSpeed: 3.6,
    projectileColor: "#f6c1ff",
    baseColor: "#f7f0dd",
    roofColor: "#c98bf2",
    description: "Long range, slower but powerful.",
  },
};

const TOWER_TYPES = {
  sprout: {
    id: "sprout",
    name: "Sprout",
    cost: 50,
    range: 2.6,
    fireRate: 0.8,
    damage: 1,
    projectileSpeed: 4.8,
    projectileColor: "#ffdf7e",
    baseColor: "#f2f0e6",
    roofColor: "#f2a4a4",
    description: "Fast shots, short range.",
  },
  bloom: {
    id: "bloom",
    name: "Bloom",
    cost: 75,
    range: 3.2,
    fireRate: 1.1,
    damage: 2,
    projectileSpeed: 4.2,
    projectileColor: "#b6f0ff",
    baseColor: "#e6f4ff",
    roofColor: "#78c6f0",
    description: "Balanced range with heavier hits.",
  },
  orchard: {
    id: "orchard",
    name: "Orchard",
    cost: 110,
    range: 4.0,
    fireRate: 1.6,
    damage: 3,
    projectileSpeed: 3.6,
    projectileColor: "#f6c1ff",
    baseColor: "#f7f0dd",
    roofColor: "#c98bf2",
    description: "Long range, slower but powerful.",
  },
};

const state = {
  gold: 200,
  lives: 20,
  wave: 1,
  placingTower: false,
  towers: [],
  enemies: [],
  projectiles: [],
  path: [],
  lastSpawnTime: 0,
  spawnInterval: 1.6,
  waveActive: false,
  enemiesSpawned: 0,
  enemiesTotal: 0,
  status: "Ready",
  selectedTowerType: "sprout",
};

const ui = {
  gold: document.getElementById("gold"),
  lives: document.getElementById("lives"),
  wave: document.getElementById("wave"),
  enemies: document.getElementById("enemies"),
  status: document.getElementById("status"),
  towerName: document.getElementById("tower-name"),
  towerDetails: document.getElementById("tower-details"),
  towerOptions: Array.from(document.querySelectorAll(".tower-option")),
  placeTower: document.getElementById("place-tower"),
  startWave: document.getElementById("start-wave"),
  message: document.getElementById("message"),
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

let messageTimeout = null;
let previewTower = null;

function loadObj(path) {
  return new Promise((resolve, reject) => {
    loader.load(path, resolve, undefined, reject);
  });
}

function generatePath() {
  const path = [];
  const startZ = Math.floor(GRID_SIZE / 2);
  let x = 0;
  let z = startZ;
  const endX = GRID_SIZE - 1;
  path.push({ x, z });
  while (x < endX) {
    const options = [];
    options.push({ x: x + 1, z });
    if (z > 0) {
      options.push({ x, z: z - 1 });
    }
    if (z < GRID_SIZE - 1) {
      options.push({ x, z: z + 1 });
    }
    let next = options[0];
    if (Math.random() < MAP_RANDOMNESS) {
      next = options[Math.floor(Math.random() * options.length)];
    }
    if (next.x > endX) {
      next.x = endX;
    }
    x = next.x;
    z = next.z;
    const last = path[path.length - 1];
    if (!last || last.x !== x || last.z !== z) {
      path.push({ x, z });
    }
  }
  if (path[path.length - 1].x !== endX) {
    path.push({ x: endX, z });
  }
  return path;
}

function getWaveTotal(wave) {
  return 6 + wave * 2;
}

function getSpawnInterval(wave) {
  return Math.max(0.7, 1.6 - wave * 0.1);
}

function setStatus(text) {
  state.status = text;
  ui.status.textContent = text;
}

function setMessage(text, tone = "info", duration = 2500) {
  ui.message.textContent = text;
  ui.message.dataset.tone = tone;
  if (messageTimeout) {
    clearTimeout(messageTimeout);
  }
  if (duration) {
    messageTimeout = setTimeout(() => {
      ui.message.textContent = "";
      ui.message.dataset.tone = "";
    }, duration);
  }
}

function updateUi() {
  ui.gold.textContent = state.gold;
  ui.lives.textContent = state.lives;
  ui.wave.textContent = state.wave;
  const defeated = state.enemiesSpawned - state.enemies.length;
  const remaining = Math.max(0, state.enemiesTotal - defeated);
  ui.enemies.textContent = remaining;
  ui.towerName.textContent = TOWER_TYPES[state.selectedTowerType].name;
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
  return state.path.some((node) => node.x === x && node.z === z);
}

function buildFarmTiles() {
  const tiles = new THREE.Group();
  for (let x = 0; x < GRID_SIZE; x += 1) {
    for (let z = 0; z < GRID_SIZE; z += 1) {
      const tile = createTileMesh(x, z);
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
  state.path.forEach((node) => {
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

function createTileMesh(x, z) {
  const isPath = isPathTile(x, z);
  const color = isPath ? "#caa86d" : "#8fd98f";
  if (assets.tile) {
    const tile = assets.tile.clone();
    tile.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({ color });
        child.castShadow = false;
        child.receiveShadow = true;
      }
    });
    return tile;
  }
  const geometry = new THREE.BoxGeometry(1, 0.2, 1);
  const material = new THREE.MeshStandardMaterial({ color });
  const tile = new THREE.Mesh(geometry, material);
  tile.receiveShadow = true;
  return tile;
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

function applyTowerMaterials(model, color, opacity = 1) {
  model.traverse((child) => {
    if (child.isMesh) {
      child.material = new THREE.MeshStandardMaterial({
        color,
        transparent: opacity < 1,
        opacity,
      });
    }
  });
}

function createPreviewTower() {
  const base = assets.towerBase
    ? assets.towerBase.clone()
    : new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.6, 12));
  const roof = assets.roof
    ? assets.roof.clone()
    : new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.5, 12));

  const towerType = TOWER_TYPES[state.selectedTowerType];
  applyTowerMaterials(base, towerType.baseColor, 0.6);
  applyTowerMaterials(roof, towerType.roofColor, 0.6);

  const towerType = TOWER_TYPES[state.selectedTowerType];
  applyTowerMaterials(base, towerType.baseColor, 0.6);
  applyTowerMaterials(roof, towerType.roofColor, 0.6);

  base.traverse((child) => {
    if (child.isMesh) {
      child.userData.isPreview = true;
    }
  });

  roof.traverse((child) => {
    if (child.isMesh) {
      child.userData.isPreview = true;
    }
  });

  base.scale.setScalar(1.2);
  roof.scale.setScalar(1.2);
  roof.position.y = assets.roof ? 0.6 : 0.7;

  const tower = new THREE.Group();
  tower.userData.isPreview = true;
  tower.add(base);
  tower.add(roof);
  tower.position.y = 0.3;
  tower.visible = false;
  scene.add(tower);
  return tower;
}

function updatePreviewColor(valid) {
  if (!previewTower) {
    return;
  }
  const color = valid ? "#b8f7c0" : "#f2a1a1";
  previewTower.traverse((child) => {
    if (child.isMesh && child.material?.color) {
      child.material.color.set(color);
    }
  });
}

function createTower(position, towerType) {
  const base = assets.towerBase
    ? assets.towerBase.clone()
    : new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.6, 12));
  const roof = assets.roof
    ? assets.roof.clone()
    : new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.5, 12));

  applyTowerMaterials(base, towerType.baseColor);
  applyTowerMaterials(roof, towerType.roofColor);

  base.scale.setScalar(1.2);
  roof.scale.setScalar(1.2);
  roof.position.y = assets.roof ? 0.6 : 0.7;

  const tower = new THREE.Group();
  tower.userData.isPreview = true;
  tower.add(base);
  tower.add(roof);
  tower.position.y = 0.3;
  tower.visible = false;
  scene.add(tower);
  return tower;
}

function updatePreviewColor(valid) {
  if (!previewTower) {
    return;
  }
  const color = valid ? "#b8f7c0" : "#f2a1a1";
  previewTower.traverse((child) => {
    if (child.isMesh && child.material?.color) {
      child.material.color.set(color);
    }
  });
}

function createTower(position, towerType) {
  const base = assets.towerBase.clone();
  const roof = assets.roof.clone();

  applyTowerMaterials(base, towerType.baseColor);
  applyTowerMaterials(roof, towerType.roofColor);

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
    range: towerType.range,
    fireRate: towerType.fireRate,
    damage: towerType.damage,
    projectileSpeed: towerType.projectileSpeed,
    projectileColor: towerType.projectileColor,
  });
}

function spawnEnemy() {
  const enemy = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 16, 16),
    new THREE.MeshStandardMaterial({ color: "#b087ff" })
  );
  if (!state.path.length) {
    return;
  }
  const start = gridToWorld(state.path[0].x, state.path[0].z);
  enemy.position.set(start.x, 0.4, start.z);
  scene.add(enemy);
  state.enemies.push({
    mesh: enemy,
    pathIndex: 0,
    progress: 0,
    speed: 0.5 + state.wave * 0.05,
    hp: 3 + state.wave,
  });
  state.enemiesSpawned += 1;
}

function updateEnemies(delta) {
  const finished = [];
  state.enemies.forEach((enemy, index) => {
    const current = state.path[enemy.pathIndex];
    const next = state.path[enemy.pathIndex + 1];
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
      tower.cooldown = tower.fireRate;
      const projectile = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        new THREE.MeshStandardMaterial({ color: tower.projectileColor })
      );
      projectile.position.copy(tower.mesh.position);
      projectile.position.y += 0.4;
      scene.add(projectile);
      state.projectiles.push({
        mesh: projectile,
        target,
        speed: tower.projectileSpeed,
        damage: tower.damage,
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
      projectile.target.hp -= projectile.damage;
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
  if (
    state.lastSpawnTime >= state.spawnInterval &&
    state.enemiesSpawned < state.enemiesTotal
  ) {
    state.lastSpawnTime = 0;
    spawnEnemy();
  }
  if (
    state.enemiesSpawned >= state.enemiesTotal &&
    state.enemies.length === 0
  ) {
    state.waveActive = false;
    ui.startWave.disabled = false;
    setStatus("Ready");
    const reward = 25 + state.wave * 5;
    state.gold += reward;
    setMessage(`Wave cleared! +${reward} gold`, "success", 3000);
    state.wave += 1;
  }
  if (state.lives <= 0) {
    state.waveActive = false;
    ui.startWave.disabled = true;
    setStatus("Game Over");
    setMessage("The farm has fallen!", "danger", 0);
  }
}

function onPointerMove(event) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  updatePlacementPreview();
}

function getPlacementData() {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  const hit = hits.find(
    (item) => item.object.parent && !item.object.userData.isPreview
  );
  if (!hit) {
    return null;
  }
  const point = hit.point;
  const gridX = Math.round(point.x / TILE_SIZE + (GRID_SIZE - 1) / 2);
  const gridZ = Math.round(point.z / TILE_SIZE + (GRID_SIZE - 1) / 2);
  if (gridX < 0 || gridZ < 0 || gridX >= GRID_SIZE || gridZ >= GRID_SIZE) {
    return { valid: false };
  }
  if (isPathTile(gridX, gridZ)) {
    return { valid: false, pos: gridToWorld(gridX, gridZ) };
  }
  const pos = gridToWorld(gridX, gridZ);
  const occupied = state.towers.some(
    (tower) => tower.mesh.position.distanceTo(pos) < 0.1
  );
  if (occupied || state.gold < TOWER_TYPES[state.selectedTowerType].cost) {
    return { valid: false, pos };
  }
  return { valid: true, pos };
}

function updatePlacementPreview() {
  if (!previewTower) {
    return;
  }
  if (!state.placingTower) {
    previewTower.visible = false;
    return;
  }
  const placement = getPlacementData();
  if (!placement) {
    previewTower.visible = false;
    return;
  }
  previewTower.visible = true;
  if (placement.pos) {
    previewTower.position.copy(placement.pos);
  }
  updatePreviewColor(placement.valid);
}

function setSelectedTowerType(typeId) {
  const towerType = TOWER_TYPES[typeId];
  if (!towerType) {
    return;
  }
  state.selectedTowerType = typeId;
  ui.towerName.textContent = towerType.name;
  ui.towerDetails.textContent = towerType.description;
  ui.towerOptions.forEach((button) => {
    button.classList.toggle(
      "selected",
      button.dataset.type === state.selectedTowerType
    );
  });
  ui.placeTower.textContent = `Place ${towerType.name} (${towerType.cost})`;
  if (previewTower) {
    previewTower.traverse((child) => {
      if (child.isMesh) {
        child.userData.isPreview = true;
      }
    });
    previewTower.children.forEach((child, index) => {
      if (index === 0) {
        applyTowerMaterials(child, towerType.baseColor, 0.6);
      } else {
        applyTowerMaterials(child, towerType.roofColor, 0.6);
      }
    });
  }
  updatePlacementPreview();
}

function onClick(event) {
  onPointerMove(event);
  if (!state.placingTower) {
    return;
  }
  const placement = getPlacementData();
  if (!placement || !placement.valid) {
    setMessage("Choose an empty grass tile and enough gold.", "warning");
    return;
  }
  const towerType = TOWER_TYPES[state.selectedTowerType];
  state.gold -= towerType.cost;
  createTower(placement.pos, towerType);
  state.placingTower = false;
  ui.placeTower.classList.remove("secondary");
  ui.placeTower.textContent = `Place ${towerType.name} (${towerType.cost})`;
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
  ui.towerOptions.forEach((button) => {
    button.addEventListener("click", () => {
      setSelectedTowerType(button.dataset.type);
    });
  });
  ui.placeTower.addEventListener("click", () => {
    state.placingTower = !state.placingTower;
    ui.placeTower.classList.toggle("secondary", state.placingTower);
    if (state.placingTower) {
      ui.placeTower.textContent = "Cancel Placement";
    } else {
      const towerType = TOWER_TYPES[state.selectedTowerType];
      ui.placeTower.textContent = `Place ${towerType.name} (${towerType.cost})`;
    }
    updatePlacementPreview();
  });
  ui.startWave.addEventListener("click", () => {
    if (state.waveActive || state.lives <= 0) {
      return;
    }
    state.waveActive = true;
    state.lastSpawnTime = 0;
    state.enemiesSpawned = 0;
    state.enemiesTotal = getWaveTotal(state.wave);
    state.spawnInterval = getSpawnInterval(state.wave);
    ui.startWave.disabled = true;
    setStatus(`Wave ${state.wave} in progress`);
    setMessage(`Wave ${state.wave} started!`, "success", 2000);
  });
}

async function init() {
  const [tileObj, towerObj, roofObj] = await Promise.allSettled([
    loadObj("assets/models/primitives/tile_ground.obj"),
    loadObj("assets/models/primitives/tower_base.obj"),
    loadObj("assets/models/primitives/barn_roof.obj"),
  ]);

  assets.tile = tileObj.status === "fulfilled" ? tileObj.value : null;
  assets.towerBase = towerObj.status === "fulfilled" ? towerObj.value : null;
  assets.roof = roofObj.status === "fulfilled" ? roofObj.value : null;

  state.path = generatePath();
  buildFarmTiles();
  buildPathDecor();
  buildCuteDecor();
  previewTower = createPreviewTower();
  setupUi();
  setSelectedTowerType(state.selectedTowerType);
  if (!assets.tile || !assets.towerBase || !assets.roof) {
    setMessage("Loaded fallback geometry for the map.", "warning", 4000);
  } else {
    setMessage("Build towers before the wave!", "info", 3000);
  }

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("click", onClick);
  window.addEventListener("resize", resize);
  requestAnimationFrame(animate);
}

init();
