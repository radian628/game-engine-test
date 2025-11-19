// import { SampleWebgpuRenderer, Test } from "./draw-components";

import {
  Mat4,
  mulMat4,
  ortho,
  perspective,
  rand,
  rotate,
  translate,
} from "r628";
import {
  createBufferFromData,
  MainCanvas,
  SampleWebgpuRenderer,
  SampleWebgpuRendererGeometry,
} from "./draw-components";
import { createSystem, Entity } from "./ecs";
import { Transform } from "./transform-component";
import { parse } from "@loaders.gl/core";
import {
  GLTFLoader,
  GLTFMeshPostprocessed,
  postProcessGLTF,
} from "@loaders.gl/gltf";
import {
  PhysicsWorld,
  RigidBody,
  RigidBodyCollider,
} from "./physics-components";

type MeshBuffers = {
  attributes: Record<string, GPUBuffer>;
  indices?: {
    buffer: GPUBuffer;
    format: "uint16" | "uint32";
  };
  count: number;
};

function gltfMeshToWebGPUBuffers(
  device: GPUDevice,
  mesh: GLTFMeshPostprocessed
) {
  const out: MeshBuffers[] = [];

  for (const prim of mesh.primitives) {
    const meshBufs: MeshBuffers = { attributes: {}, count: 0 };

    for (const [attrName, attrValue] of Object.entries(prim.attributes)) {
      const attrBuffer = createBufferFromData(
        device,
        attrValue.value.buffer,
        GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
      );
      meshBufs.attributes[attrName] = attrBuffer;
      meshBufs.count = attrValue.count;
    }

    if (prim.indices) {
      const indexBuffer = createBufferFromData(
        device,
        prim.indices.value.buffer,
        GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
      );
      meshBufs.indices = {
        buffer: indexBuffer,
        format: prim.indices.bytesPerElement === 2 ? "uint16" : "uint32",
      };
      meshBufs.count = prim.indices.count;
    }

    out.push(meshBufs);
  }

  return out;
}

function trans4(m: Mat4): Mat4 {
  return [
    m[0],
    m[4],
    m[8],
    m[12],
    m[1],
    m[5],
    m[9],
    m[13],
    m[2],
    m[6],
    m[10],
    m[14],
    m[3],
    m[7],
    m[11],
    m[15],
  ];
}

function perspectiveWebgpu(
  fieldOfViewInRadians: number,
  aspectRatio: number,
  near: number,
  far: number
): Mat4 {
  const f = 1.0 / Math.tan(fieldOfViewInRadians / 2);
  const rangeInv = 1 / (near - far);

  return [
    f / aspectRatio,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    far * rangeInv,
    -1,
    0,
    0,
    near * far * rangeInv,
    0,
  ];
}

async function main() {
  const monkey = await (await fetch("assets/monkey.glb")).blob();

  console.log(
    "sdsdsdfds",
    await parse(await (await fetch("assets/models.glb")).blob(), GLTFLoader)
  );

  const gltf = await parse(monkey, GLTFLoader);

  const g = postProcessGLTF(gltf);

  console.log(g);

  const sys = await createSystem([
    Transform,
    SampleWebgpuRenderer,
    SampleWebgpuRendererGeometry,
    RigidBody,
    PhysicsWorld,
    RigidBodyCollider,
    MainCanvas,
  ]);

  const device = sys.subsystem(SampleWebgpuRenderer).global.device;

  const mesh = gltfMeshToWebGPUBuffers(device, g.meshes[0]);

  let entities: Entity<
    | typeof Transform
    | typeof SampleWebgpuRendererGeometry
    | typeof RigidBody
    | typeof RigidBodyCollider
  >[] = [];

  const { world, RAPIER } = sys.subsystem(PhysicsWorld).global;

  for (let i = 0; i < 100; i++) {
    const testEntity = sys.entity({
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      sampleWebgpuRendererGeometry: {
        vertexBuffer: mesh[0].attributes.POSITION,
        normalBuffer: mesh[0].attributes.NORMAL,
        size: mesh[0].count,
        indexBuffer: mesh[0].indices!.buffer,
        indexFormat: "uint16",
      },
      rigidBody: RAPIER.RigidBodyDesc.dynamic().setTranslation(
        rand(-1, 1),
        i * 1.5 + 1,
        rand(-11, -9)
        // rand(-2, 2)
      ),
      rigidBodyCollider: RAPIER.ColliderDesc.ball(0.5),
    });
    entities.push(testEntity);
  }

  const ground = sys.entity({
    transform: translate([0, 0, 0]),
    rigidBody: RAPIER.RigidBodyDesc.fixed(),
    rigidBodyCollider: RAPIER.ColliderDesc.cuboid(30, 1, 30).setTranslation(
      0,
      -2,
      0
    ),
  });

  let t = 0;

  const renderer = sys.subsystem(SampleWebgpuRenderer);

  async function loop() {
    const projection = perspectiveWebgpu(1, 1, 0.1, 100);
    renderer.global.projectionMatrix = projection;

    await sys.fixedUpdate();
    await sys.renderUpdate();

    requestAnimationFrame(loop);
  }

  loop();
}

main();
