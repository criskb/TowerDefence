#!/usr/bin/env python3
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Tuple

Vec3 = Tuple[float, float, float]
Triangle = Tuple[Vec3, Vec3, Vec3]


@dataclass
class MeshData:
    positions: List[Vec3]
    normals: List[Vec3]
    indices: List[int]


def normalize(vec: Vec3) -> Vec3:
    length = math.sqrt(vec[0] ** 2 + vec[1] ** 2 + vec[2] ** 2)
    if length == 0:
        return (0.0, 0.0, 0.0)
    return (vec[0] / length, vec[1] / length, vec[2] / length)


def cross(a: Vec3, b: Vec3) -> Vec3:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def subtract(a: Vec3, b: Vec3) -> Vec3:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def build_mesh(triangles: Iterable[Triangle]) -> MeshData:
    positions: List[Vec3] = []
    normals: List[Vec3] = []
    indices: List[int] = []
    for tri in triangles:
        v0, v1, v2 = tri
        normal = normalize(cross(subtract(v1, v0), subtract(v2, v0)))
        base_index = len(positions)
        positions.extend([v0, v1, v2])
        normals.extend([normal, normal, normal])
        indices.extend([base_index, base_index + 1, base_index + 2])
    return MeshData(positions=positions, normals=normals, indices=indices)


def write_obj(mesh: MeshData, output_path: Path) -> None:
    lines: List[str] = ["# Generated primitive mesh"]
    for vertex in mesh.positions:
        lines.append(f"v {vertex[0]:.6f} {vertex[1]:.6f} {vertex[2]:.6f}")
    for normal in mesh.normals:
        lines.append(f"vn {normal[0]:.6f} {normal[1]:.6f} {normal[2]:.6f}")

    for i in range(0, len(mesh.indices), 3):
        idx0 = mesh.indices[i] + 1
        idx1 = mesh.indices[i + 1] + 1
        idx2 = mesh.indices[i + 2] + 1
        lines.append(f"f {idx0}//{idx0} {idx1}//{idx1} {idx2}//{idx2}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def make_tile() -> MeshData:
    size = 0.5
    v0 = (-size, 0.0, -size)
    v1 = (size, 0.0, -size)
    v2 = (size, 0.0, size)
    v3 = (-size, 0.0, size)
    triangles = [
        (v0, v1, v2),
        (v0, v2, v3),
    ]
    return build_mesh(triangles)


def make_cube(size: float = 0.5) -> MeshData:
    s = size
    v = [
        (-s, -s, -s),
        (s, -s, -s),
        (s, s, -s),
        (-s, s, -s),
        (-s, -s, s),
        (s, -s, s),
        (s, s, s),
        (-s, s, s),
    ]
    triangles = [
        (v[0], v[1], v[2]),
        (v[0], v[2], v[3]),
        (v[5], v[4], v[7]),
        (v[5], v[7], v[6]),
        (v[4], v[0], v[3]),
        (v[4], v[3], v[7]),
        (v[1], v[5], v[6]),
        (v[1], v[6], v[2]),
        (v[3], v[2], v[6]),
        (v[3], v[6], v[7]),
        (v[4], v[5], v[1]),
        (v[4], v[1], v[0]),
    ]
    return build_mesh(triangles)


def make_pyramid(base: float = 0.6, height: float = 0.5) -> MeshData:
    half = base / 2
    v0 = (-half, 0.0, -half)
    v1 = (half, 0.0, -half)
    v2 = (half, 0.0, half)
    v3 = (-half, 0.0, half)
    top = (0.0, height, 0.0)
    triangles = [
        (v0, v1, v2),
        (v0, v2, v3),
        (v0, v1, top),
        (v1, v2, top),
        (v2, v3, top),
        (v3, v0, top),
    ]
    return build_mesh(triangles)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    output_dir = root / "assets" / "models" / "primitives"
    write_obj(make_tile(), output_dir / "tile_ground.obj")
    write_obj(make_cube(0.45), output_dir / "tower_base.obj")
    write_obj(make_pyramid(), output_dir / "barn_roof.obj")


if __name__ == "__main__":
    main()
