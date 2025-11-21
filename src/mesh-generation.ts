import { cartesianProduct, rescale, Vec2, Vec3 } from "r628";
import { createBufferFromData as createGPUBufferFromData } from "./draw-components";

export type MeshSpec = {
  vertices: Float32Array;
  indices: Uint32Array;
  drawCount: number;
};

export function uploadIndexedMeshToGPU(device: GPUDevice, mesh: MeshSpec) {
  return {
    vertices: createGPUBufferFromData(
      device,
      mesh.vertices.buffer,
      GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX
    ),
    indices: createGPUBufferFromData(
      device,
      mesh.indices.buffer,
      GPUBufferUsage.COPY_DST | GPUBufferUsage.INDEX
    ),
    drawCount: mesh.drawCount,
  };
}

export function parametricTriangleMeshGeometry(
  fn: (coords: Vec2) => Vec3,
  lo: Vec2,
  hi: Vec2,
  resolution: Vec2
): MeshSpec {
  const vertCount = resolution[1] * resolution[0];
  const indexCount = (resolution[1] - 1) * (resolution[0] - 1) * 6;

  const vertices = new Float32Array(vertCount * 3);
  const indices = new Uint32Array(indexCount);

  const [lowX, lowY] = lo;
  const [highX, highY] = hi;

  const stepX = (highX - lowX) / (resolution[0] - 1);
  const stepY = (highY - lowY) / (resolution[1] - 1);

  for (let y = 0; y < resolution[1]; y++) {
    for (let x = 0; x < resolution[0]; x++) {
      let iVertices = (y * resolution[0] + x) * 3;

      const xIn = lowX + stepX * x;
      const yIn = lowY + stepY * y;

      const pt = fn([xIn, yIn]);

      vertices[iVertices] = pt[0];
      vertices[iVertices + 1] = pt[1];
      vertices[iVertices + 2] = pt[2];
    }
  }

  for (let y = 0; y < resolution[1] - 1; y++) {
    for (let x = 0; x < resolution[0] - 1; x++) {
      const iIndices = (y * (resolution[0] - 1) + x) * 6;
      const baseVertex = y * resolution[0] + x;

      indices[iIndices] = baseVertex;
      indices[iIndices + 1] = baseVertex + 1;
      indices[iIndices + 2] = baseVertex + resolution[0];

      indices[iIndices + 3] = baseVertex + 1;
      indices[iIndices + 5] = baseVertex + resolution[0];
      indices[iIndices + 4] = baseVertex + resolution[0] + 1;
    }
  }

  console.log(indexCount, vertCount);

  return {
    vertices,
    indices,
    drawCount: indexCount,
  };
}

export function uvSphere(radius: number, resolution: Vec2): MeshSpec {
  return parametricTriangleMeshGeometry(
    ([a, b]) => {
      let px = Math.cos(a) * Math.cos(b) * radius;
      let pz = Math.sin(a) * Math.cos(b) * radius;
      let py = Math.sin(b) * radius;
      return [px, py, pz];
    },
    [0, -Math.PI / 2],
    [Math.PI * 2, Math.PI / 2],
    resolution
  );
}
