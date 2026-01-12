import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

const GRID_SIZE = 11;
const TILE_SIZE = 1.2;
const BASE_TILE_HEIGHT = 0.2;
const LEVEL_HEIGHT = 0.55;
const LEVELS = 3;
const MAP_RANDOMNESS = 0.72;
const BUILD_ZONES = [
  { x: 1, z: 1, w: 3, h: 3 },
  { x: 1, z: 7, w: 3, h: 3 },
  { x: 7, z: 2, w: 3, h: 3 },
  { x: 6, z: 7, w: 4, h: 3 },
];
const MAX_TOWER_LEVEL = 3;

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
  heightMap: [],
  buildableTiles: new Set(),
  lastSpawnTime: 0,
  spawnInterval: 1.6,
  waveActive: false,
  enemiesSpawned: 0,
  enemiesTotal: 0,
  status: "Ready",
  selectedTowerType: "sprout",
  selectedTowerId: null,
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
  selectedTower: document.getElementById("selected-tower"),
  selectedLevel: document.getElementById("selected-level"),
  upgradeTower: document.getElementById("upgrade-tower"),
  placeTower: document.getElementById("place-tower"),
  startWave: document.getElementById("start-wave"),
  message: document.getElementById("message"),
};

const errorBanner = document.getElementById("error-banner");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#cfe8ff");
scene.fog = new THREE.Fog("#cfe8ff", 10, 30);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(9, 11, 12);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById("game").appendChild(renderer.domElement);

const directionalLight = new THREE.DirectionalLight("#fff9e6", 1.2);
directionalLight.position.set(6, 10, 4);
directionalLight.castShadow = true;
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

function generateHeightMap() {
  const map = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => 0)
  );
  for (let x = 0; x < GRID_SIZE; x += 1) {
    for (let z = 0; z < GRID_SIZE; z += 1) {
      const roll = Math.random();
      if (roll > 0.7) {
        map[x][z] = 2;
      } else if (roll > 0.35) {
        map[x][z] = 1;
      }
    }
  }
  for (let pass = 0; pass < 2; pass += 1) {
    const copy = map.map((row) => [...row]);
    for (let x = 0; x < GRID_SIZE; x += 1) {
      for (let z = 0; z < GRID_SIZE; z += 1) {
        let total = copy[x][z];
        let count = 1;
        const neighbors = [
          [x - 1, z],
          [x + 1, z],
          [x, z - 1],
          [x, z + 1],
        ];
        neighbors.forEach(([nx, nz]) => {
          if (nx >= 0 && nz >= 0 && nx < GRID_SIZE && nz < GRID_SIZE) {
            total += copy[nx][nz];
            count += 1;
          }
        });
        map[x][z] = clamp(Math.round(total / count), 0, LEVELS - 1);
      }
    }
  }
  return map;
}

function generateBuildableTiles() {
  const buildable = new Set();
  BUILD_ZONES.forEach((zone) => {
    for (let x = zone.x; x < zone.x + zone.w; x += 1) {
      for (let z = zone.z; z < zone.z + zone.h; z += 1) {
        buildable.add(`${x},${z}`);
      }
    }
  });
  return buildable;
}

function generatePath(heightMap) {
  const path = [];
  const startZ = Math.floor(GRID_SIZE / 2);
  let x = 0;
  let z = startZ;
  const endX = GRID_SIZE - 1;
  path.push({ x, z });
  while (x < endX) {
    const options = [];
    if (x < endX) {
      options.push({ x: x + 1, z });
    }
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
  let currentHeight = heightMap[path[0].x][path[0].z];
  heightMap[path[0].x][path[0].z] = currentHeight;
  for (let i = 1; i < path.length; i += 1) {
    const node = path[i];
    const targetHeight = heightMap[node.x][node.z];
    if (Math.abs(targetHeight - currentHeight) > 1) {
      currentHeight += targetHeight > currentHeight ? 1 : -1;
      heightMap[node.x][node.z] = currentHeight;
    } else {
      currentHeight = targetHeight;
    }
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
  if (state.selectedTowerId) {
    const selected = state.towers.find(
      (tower) => tower.mesh.userData.towerId === state.selectedTowerId
    );
    if (selected) {
      const cost = getUpgradeCost(selected.level);
      ui.upgradeTower.disabled =
        selected.level >= MAX_TOWER_LEVEL || state.gold < cost;
      ui.selectedLevel.textContent = `Lv ${selected.level}`;
    } else {
      setSelectedTower(null);
    }
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function tileTopY(height) {
  return height * LEVEL_HEIGHT + BASE_TILE_HEIGHT * 0.5;
}

function getTileHeight(x, z) {
  if (!state.heightMap.length) {
    return 0;
  }
  return state.heightMap[x]?.[z] ?? 0;
}

function gridToWorld(x, z) {
  const offset = (GRID_SIZE - 1) * TILE_SIZE * 0.5;
  const height = getTileHeight(x, z);
  return new THREE.Vector3(
    x * TILE_SIZE - offset,
    tileTopY(height),
    z * TILE_SIZE - offset
  );
}

function isPathTile(x, z) {
  return state.path.some((node) => node.x === x && node.z === z);
}

function isBuildableTile(x, z) {
  return state.buildableTiles.has(`${x},${z}`);
}

function buildFarmTiles() {
  const tiles = new THREE.Group();
  const buildableOverlay = new THREE.Group();
  for (let x = 0; x < GRID_SIZE; x += 1) {
    for (let z = 0; z < GRID_SIZE; z += 1) {
      const tile = createTileMesh(x, z);
      const pos = gridToWorld(x, z);
      tile.position.set(pos.x, getTileHeight(x, z) * LEVEL_HEIGHT, pos.z);
      tile.scale.set(TILE_SIZE, 1, TILE_SIZE);
      tile.userData.isTile = true;
      tile.traverse((child) => {
        if (child.isMesh) {
          child.userData.isTile = true;
        }
      });
      tiles.add(tile);
      if (isBuildableTile(x, z) && !isPathTile(x, z)) {
        const highlight = new THREE.Mesh(
          new THREE.RingGeometry(0.28, 0.45, 16),
          new THREE.MeshStandardMaterial({
            color: "#d9f0ff",
            transparent: true,
            opacity: 0.7,
            emissive: "#a5d6ff",
            emissiveIntensity: 0.35,
          })
        );
        highlight.rotation.x = -Math.PI / 2;
        highlight.position.set(pos.x, tileTopY(getTileHeight(x, z)) + 0.02, pos.z);
        buildableOverlay.add(highlight);
      }
    }
  }
  scene.add(tiles);
  scene.add(buildableOverlay);
  buildCliffs();
  buildSlopes();
}

function buildPathDecor() {
  const pathGroup = new THREE.Group();
  state.path.forEach((node) => {
    const stone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.3, 0.16, 10),
      new THREE.MeshStandardMaterial({ color: "#ead8b8" })
    );
    const pos = gridToWorld(node.x, node.z);
    stone.position.set(pos.x, pos.y + 0.12, pos.z);
    pathGroup.add(stone);
  });
  scene.add(pathGroup);
}

function buildCliffs() {
  const wallGroup = new THREE.Group();
  const wallColor = new THREE.MeshStandardMaterial({ color: "#bfa07a" });
  const offset = (GRID_SIZE - 1) * TILE_SIZE * 0.5;
  for (let x = 0; x < GRID_SIZE; x += 1) {
    for (let z = 0; z < GRID_SIZE; z += 1) {
      const height = getTileHeight(x, z);
      const eastHeight = x < GRID_SIZE - 1 ? getTileHeight(x + 1, z) : height;
      const southHeight = z < GRID_SIZE - 1 ? getTileHeight(x, z + 1) : height;
      if (height > eastHeight) {
        const diff = height - eastHeight;
        const wallHeight = diff * LEVEL_HEIGHT;
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, wallHeight, TILE_SIZE),
          wallColor
        );
        wall.castShadow = true;
        wall.receiveShadow = true;
        wall.position.set(
          x * TILE_SIZE - offset + TILE_SIZE * 0.5,
          tileTopY(eastHeight) + wallHeight * 0.5,
          z * TILE_SIZE - offset
        );
        wallGroup.add(wall);
      }
      if (height > southHeight) {
        const diff = height - southHeight;
        const wallHeight = diff * LEVEL_HEIGHT;
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(TILE_SIZE, wallHeight, 0.1),
          wallColor
        );
        wall.castShadow = true;
        wall.receiveShadow = true;
        wall.position.set(
          x * TILE_SIZE - offset,
          tileTopY(southHeight) + wallHeight * 0.5,
          z * TILE_SIZE - offset + TILE_SIZE * 0.5
        );
        wallGroup.add(wall);
      }
    }
  }
  scene.add(wallGroup);
}

function buildSlopes() {
  const slopeGroup = new THREE.Group();
  const slopeMaterial = new THREE.MeshStandardMaterial({
    color: "#d9c8a5",
    transparent: true,
    opacity: 0.85,
  });
  const slopeAngle = Math.atan2(LEVEL_HEIGHT, TILE_SIZE);
  for (let i = 0; i < state.path.length - 1; i += 1) {
    const current = state.path[i];
    const next = state.path[i + 1];
    const currentHeight = getTileHeight(current.x, current.z);
    const nextHeight = getTileHeight(next.x, next.z);
    if (Math.abs(currentHeight - nextHeight) !== 1) {
      continue;
    }
    const lowerHeight =
      currentHeight < nextHeight ? currentHeight : nextHeight;
    const lowerPos = gridToWorld(current.x, current.z);
    const nextPos = gridToWorld(next.x, next.z);
    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(TILE_SIZE, 0.06, TILE_SIZE),
      slopeMaterial
    );
    ramp.receiveShadow = true;
    ramp.position.set(
      (lowerPos.x + nextPos.x) / 2,
      tileTopY(lowerHeight) + LEVEL_HEIGHT * 0.5,
      (lowerPos.z + nextPos.z) / 2
    );
    const dx = next.x - current.x;
    const dz = next.z - current.z;
    if (dx !== 0) {
      ramp.rotation.z = dx > 0 ? -slopeAngle : slopeAngle;
    }
    if (dz !== 0) {
      ramp.rotation.x = dz > 0 ? slopeAngle : -slopeAngle;
    }
    slopeGroup.add(ramp);
  }
  scene.add(slopeGroup);
}

function createTileMesh(x, z) {
  const isPath = isPathTile(x, z);
  const buildable = isBuildableTile(x, z);
  const baseColor = isPath ? "#caa86d" : "#8fd98f";
  const buildableTint = buildable ? "#aee4ff" : baseColor;
  const color =
    !isPath && (x + z) % 2 === 0
      ? new THREE.Color(buildableTint).offsetHSL(0.02, 0.08, 0.05)
      : buildableTint;
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
  const geometry = new THREE.BoxGeometry(1, BASE_TILE_HEIGHT, 1);
  const material = new THREE.MeshStandardMaterial({ color });
  const tile = new THREE.Mesh(geometry, material);
  tile.receiveShadow = true;
  return tile;
}

function buildCuteDecor() {
  const pasture = new THREE.Mesh(
    new THREE.CircleGeometry(8.8, 64),
    new THREE.MeshStandardMaterial({ color: "#c9f2b7" })
  );
  pasture.rotation.x = -Math.PI / 2;
  pasture.position.y = -0.22;
  pasture.receiveShadow = true;
  scene.add(pasture);

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

function createTombstone() {
  const stone = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.5, 0.18),
    new THREE.MeshStandardMaterial({ color: "#d9d6d1" })
  );
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 0.2, 12),
    new THREE.MeshStandardMaterial({ color: "#e6e2dc" })
  );
  cap.position.y = 0.35;
  const group = new THREE.Group();
  group.add(stone);
  group.add(cap);
  return group;
}

function createLantern() {
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 0.3, 8),
    new THREE.MeshStandardMaterial({ color: "#4b3b2a" })
  );
  const light = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.22, 0.18),
    new THREE.MeshStandardMaterial({
      color: "#ffd589",
      emissive: "#ffb347",
      emissiveIntensity: 0.6,
    })
  );
  light.position.y = 0.26;
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.16, 6),
    new THREE.MeshStandardMaterial({ color: "#7b4a3d" })
  );
  roof.position.y = 0.4;
  const group = new THREE.Group();
  group.add(base);
  group.add(light);
  group.add(roof);
  return group;
}

function createTownHouse() {
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.45, 0.6),
    new THREE.MeshStandardMaterial({ color: "#f2e6c8" })
  );
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 0.3, 4),
    new THREE.MeshStandardMaterial({ color: "#c97b63" })
  );
  roof.position.y = 0.35;
  roof.rotation.y = Math.PI / 4;
  const group = new THREE.Group();
  group.add(base);
  group.add(roof);
  return group;
}

function buildSceneProps() {
  const props = new THREE.Group();
  for (let i = 0; i < 6; i += 1) {
    const grave = createTombstone();
    const pos = gridToWorld(1 + i, 0);
    grave.position.set(pos.x, pos.y + 0.1, pos.z);
    props.add(grave);
  }
  for (let i = 0; i < 3; i += 1) {
    const house = createTownHouse();
    const pos = gridToWorld(9, 2 + i * 2);
    house.position.set(pos.x, pos.y + 0.2, pos.z);
    props.add(house);
  }
  const lantern = createLantern();
  const lanternPos = gridToWorld(0, 9);
  lantern.position.set(lanternPos.x, lanternPos.y + 0.1, lanternPos.z);
  props.add(lantern);
  scene.add(props);
}

function buildGoal() {
  if (!state.path.length) {
    return;
  }
  const end = state.path[state.path.length - 1];
  const pos = gridToWorld(end.x, end.z);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.6, 0.3, 10),
    new THREE.MeshStandardMaterial({ color: "#cfd8ff" })
  );
  base.castShadow = true;
  base.receiveShadow = true;
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.35),
    new THREE.MeshStandardMaterial({
      color: "#8fd1ff",
      emissive: "#4fb4ff",
      emissiveIntensity: 0.7,
    })
  );
  crystal.castShadow = true;
  crystal.position.y = 0.4;
  const shrine = new THREE.Group();
  shrine.add(base);
  shrine.add(crystal);
  shrine.position.set(pos.x, pos.y + 0.05, pos.z);
  scene.add(shrine);
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

function getTowerStats(towerType, level) {
  const levelBonus = level - 1;
  return {
    range: towerType.range + levelBonus * 0.35,
    fireRate: Math.max(0.6, towerType.fireRate - levelBonus * 0.1),
    damage: towerType.damage + levelBonus * 1.2,
    projectileSpeed: towerType.projectileSpeed + levelBonus * 0.4,
  };
}

function getUpgradeCost(level) {
  return 40 + level * 30;
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

  base.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  roof.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const tower = new THREE.Group();
  tower.add(base);
  tower.add(roof);
  tower.position.copy(position);
  tower.position.y += 0.28;
  const selectionRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.45, 0.06, 8, 20),
    new THREE.MeshStandardMaterial({
      color: "#7bd8ff",
      emissive: "#54b5ff",
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.8,
    })
  );
  selectionRing.rotation.x = Math.PI / 2;
  selectionRing.visible = false;
  tower.add(selectionRing);
  const towerId = crypto.randomUUID
    ? crypto.randomUUID()
    : `tower-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  tower.userData.towerId = towerId;

  scene.add(tower);
  const level = 1;
  const stats = getTowerStats(towerType, level);
  const entry = {
    mesh: tower,
    selectionRing,
    typeId: towerType.id,
    level,
    baseMesh: base,
    roofMesh: roof,
    cooldown: 0,
    range: stats.range,
    fireRate: stats.fireRate,
    damage: stats.damage,
    projectileSpeed: stats.projectileSpeed,
    projectileColor: towerType.projectileColor,
  };
  state.towers.push(entry);
  return entry;
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
  enemy.position.set(start.x, start.y + 0.25, start.z);
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
    enemy.mesh.position.y += 0.25 + Math.sin(Date.now() / 200) * 0.05;
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
    setMessage("The shrine has fallen!", "danger", 0);
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
    (item) =>
      (item.object.userData.isTile || item.object.parent?.userData.isTile) &&
      !item.object.userData.isPreview
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
  if (isPathTile(gridX, gridZ) || !isBuildableTile(gridX, gridZ)) {
    return { valid: false, pos: gridToWorld(gridX, gridZ) };
  }
  const pos = gridToWorld(gridX, gridZ);
  const occupied = state.towers.some((tower) => {
    const dx = tower.mesh.position.x - pos.x;
    const dz = tower.mesh.position.z - pos.z;
    return Math.hypot(dx, dz) < 0.1;
  });
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
    previewTower.position.y += 0.28;
  }
  updatePreviewColor(placement.valid);
}

function setSelectedTower(tower) {
  state.towers.forEach((entry) => {
    entry.selectionRing.visible = entry === tower;
  });
  if (!tower) {
    state.selectedTowerId = null;
    ui.selectedTower.textContent = "None";
    ui.selectedLevel.textContent = "-";
    ui.upgradeTower.disabled = true;
    ui.upgradeTower.textContent = "Upgrade (40)";
    return;
  }
  state.selectedTowerId = tower.mesh.userData.towerId;
  ui.selectedTower.textContent = TOWER_TYPES[tower.typeId].name;
  ui.selectedLevel.textContent = `Lv ${tower.level}`;
  if (tower.level >= MAX_TOWER_LEVEL) {
    ui.upgradeTower.disabled = true;
    ui.upgradeTower.textContent = "Max Level";
  } else {
    const cost = getUpgradeCost(tower.level);
    ui.upgradeTower.disabled = state.gold < cost;
    ui.upgradeTower.textContent = `Upgrade (${cost})`;
  }
}

function getTowerFromObject(object) {
  let current = object;
  while (current) {
    if (current.userData?.towerId) {
      return state.towers.find(
        (tower) => tower.mesh.userData.towerId === current.userData.towerId
      );
    }
    current = current.parent;
  }
  return null;
}

function selectTowerFromPointer() {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  const towerHit = hits.find((hit) => getTowerFromObject(hit.object));
  if (!towerHit) {
    setSelectedTower(null);
    return false;
  }
  const tower = getTowerFromObject(towerHit.object);
  if (tower) {
    setSelectedTower(tower);
    return true;
  }
  return false;
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
    selectTowerFromPointer();
    return;
  }
  const placement = getPlacementData();
  if (!placement || !placement.valid) {
    setMessage("Choose a highlighted build zone with enough gold.", "warning");
    return;
  }
  const towerType = TOWER_TYPES[state.selectedTowerType];
  state.gold -= towerType.cost;
  const newTower = createTower(placement.pos, towerType);
  state.placingTower = false;
  ui.placeTower.classList.remove("secondary");
  ui.placeTower.textContent = `Place ${towerType.name} (${towerType.cost})`;
  setSelectedTower(newTower);
  updateUi();
}

function upgradeSelectedTower() {
  const selected = state.towers.find(
    (tower) => tower.mesh.userData.towerId === state.selectedTowerId
  );
  if (!selected) {
    setMessage("Select a tower to upgrade.", "warning");
    return;
  }
  if (selected.level >= MAX_TOWER_LEVEL) {
    setMessage("That tower is already max level.", "info");
    return;
  }
  const cost = getUpgradeCost(selected.level);
  if (state.gold < cost) {
    setMessage("Not enough gold for the upgrade.", "warning");
    return;
  }
  state.gold -= cost;
  selected.level += 1;
  const towerType = TOWER_TYPES[selected.typeId];
  const stats = getTowerStats(towerType, selected.level);
  selected.range = stats.range;
  selected.fireRate = stats.fireRate;
  selected.damage = stats.damage;
  selected.projectileSpeed = stats.projectileSpeed;
  const baseColor = new THREE.Color(towerType.baseColor).offsetHSL(
    0,
    0,
    0.05 * selected.level
  );
  const roofColor = new THREE.Color(towerType.roofColor).offsetHSL(
    0,
    0,
    0.05 * selected.level
  );
  applyTowerMaterials(selected.baseMesh, baseColor);
  applyTowerMaterials(selected.roofMesh, roofColor);
  setSelectedTower(selected);
  setMessage(`Upgraded to level ${selected.level}!`, "success");
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
  ui.upgradeTower.addEventListener("click", upgradeSelectedTower);
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

function showError(message) {
  if (!errorBanner) {
    return;
  }
  errorBanner.textContent = message;
  errorBanner.hidden = false;
}

async function init() {
  try {
    const [tileObj, towerObj, roofObj] = await Promise.allSettled([
      loadObj("assets/models/primitives/tile_ground.obj"),
      loadObj("assets/models/primitives/tower_base.obj"),
      loadObj("assets/models/primitives/barn_roof.obj"),
    ]);

    assets.tile = tileObj.status === "fulfilled" ? tileObj.value : null;
    assets.towerBase = towerObj.status === "fulfilled" ? towerObj.value : null;
    assets.roof = roofObj.status === "fulfilled" ? roofObj.value : null;

    state.heightMap = generateHeightMap();
    state.buildableTiles = generateBuildableTiles();
    state.path = generatePath(state.heightMap);
    state.path.forEach((node) => {
      state.buildableTiles.delete(`${node.x},${node.z}`);
    });
    buildFarmTiles();
    buildPathDecor();
    buildCuteDecor();
    buildSceneProps();
    buildGoal();
    previewTower = createPreviewTower();
    setupUi();
    setSelectedTowerType(state.selectedTowerType);
    if (!assets.tile || !assets.towerBase || !assets.roof) {
      setMessage("Loaded fallback geometry for the map.", "warning", 4000);
    } else {
      setMessage("Place towers on highlighted zones before the wave!", "info", 3000);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("click", onClick);
    window.addEventListener("resize", resize);
    requestAnimationFrame(animate);
  } catch (error) {
    console.error("Failed to initialize game.", error);
    showError("Failed to load 3D assets or WebGL. Check console/network.");
  }
}

init();
