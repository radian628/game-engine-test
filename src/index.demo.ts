// import { SampleWebgpuRenderer, Test } from "./draw-components";

import {
  add2,
  add3,
  cartesianProduct,
  length3,
  Mat4,
  mulMat4,
  mulMat4ByVec4,
  mulVec4ByMat4,
  normalize3,
  ortho,
  perspective,
  rand,
  range,
  rodrigues,
  rotate,
  scale2,
  scale3,
  smartRange,
  sub3,
  translate,
  Vec2,
  Vec3,
  xyz,
} from "r628";
import {
  createBufferFromData,
  MainCanvas,
  SampleWebgpuRenderer,
} from "./components/renderer";
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
} from "./components/physics-components";
import { PointLightSource } from "./components/lighting";
import { SampleWebgpuRendererGeometry } from "./components/geometry";
import {
  ParticleForcefield,
  ParticleSystem,
} from "./components/particle-system";
import { Keyboard, MouseFirstPerson } from "./components/input";

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
  const monkey = await (await fetch("assets/models.glb")).blob();

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
    PointLightSource,
    ParticleSystem,
    ParticleForcefield,
    Keyboard,
    MouseFirstPerson,
  ]);

  const device = sys.subsystem(SampleWebgpuRenderer).global.device;

  const mesh = gltfMeshToWebGPUBuffers(device, g.meshes[0]);
  const bg = gltfMeshToWebGPUBuffers(device, g.meshes[2]);
  const tunnel = gltfMeshToWebGPUBuffers(device, g.meshes[3]);

  let entities: Entity<
    | typeof Transform
    | typeof SampleWebgpuRendererGeometry
    | typeof RigidBody
    | typeof RigidBodyCollider
  >[] = [];

  const { world, RAPIER } = sys.subsystem(PhysicsWorld).global;

  const particleCount = 4 * 16 ** 3;

  const particlePositions = createBufferFromData(
    device,
    new Float32Array(
      range(particleCount).flatMap((x) => [
        rand(-50, 50),
        rand(-50, 50),
        rand(-100, 0),
        0,
      ])
    ),
    GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE
  );

  const particleVelocities = createBufferFromData(
    device,
    new Float32Array(range(particleCount).flatMap((x) => [0, 0, 0, 0])),
    GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE
  );

  const tex = device.createTexture({
    dimension: "3d",
    size: [32, 32, 32],
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST,
    format: "rgba8snorm",
  });

  const forceField = new Int8Array(
    cartesianProduct(range(32), range(32), range(32)).flatMap(([z, y, x]) => {
      // let vecToCenter = sub3([15.5, 15.5, 15.5], [x, y, z]);

      // vecToCenter = rodrigues(vecToCenter, [0, 0, 1], Math.PI / 2);

      // const normVecToCenter = normalize3(vecToCenter);

      // return [
      //   ...scale3(normVecToCenter, 1 * (length3(vecToCenter) + 3)).map(
      //     (c) => Math.sign(c) * Math.ceil(Math.abs(c))
      //   ),
      //   0,
      // ];

      return [rand(-4, 4), rand(-4, 4), rand(-4, 4), 0];
    })
  );

  for (let i = 0; i < 32 * 32 * 32 * 4; i += 4) {
    if (
      forceField[i] == 0 &&
      forceField[i + 1] === 0 &&
      forceField[i + 2] === 0
    ) {
    }
  }

  device.queue.writeTexture(
    { texture: tex },
    forceField,
    {
      bytesPerRow: 32 * 4,
      rowsPerImage: 32,
    },
    [32, 32, 32]
  );

  sys.entity({
    transform: translate([0, 0, -15]),
    particleForcefield: {
      positionBuffer: particlePositions,
      velocityBuffer: particleVelocities,
      forceFieldTexture: tex,
      count: particleCount,
    },
  });

  const particles = sys.entity({
    transform: translate([0, 0, -15]),
    particleSystem: {
      drawColor: [1.0, 1.0, 1.0, 1.0],
      count: particleCount,
      positionBuffer: particlePositions,
    },
  });

  const background = sys.entity({
    transform: translate([0, 0, -90]),
    sampleWebgpuRendererGeometry: {
      vertexBuffer: bg[0].attributes.POSITION,
      normalBuffer: bg[0].attributes.NORMAL,
      size: bg[0].count,
      indexBuffer: bg[0].indices!.buffer,
      indexFormat: "uint16",
      drawColor: [0.2, 0.4, 1.0, 1.0],
    },
  });

  sys.entity({
    transform: translate([0, 0, 30]),
    sampleWebgpuRendererGeometry: {
      vertexBuffer: tunnel[0].attributes.POSITION,
      normalBuffer: tunnel[0].attributes.NORMAL,
      size: tunnel[0].count,
      indexBuffer: tunnel[0].indices!.buffer,
      indexFormat: "uint16",
      drawColor: [0.27, 0.29, 0.31, 1.0],
    },
  });

  cartesianProduct(smartRange(10), smartRange(10), smartRange(10)).map(
    ([x, y, z]) => {
      const position: Vec3 = [
        x.remap(-20, 20, true),
        y.remap(-20, 20, true),
        z.remap(-60, -20, true),
      ];

      sys.entity({
        transform: translate(position),
        sampleWebgpuRendererGeometry: {
          vertexBuffer: mesh[0].attributes.POSITION,
          normalBuffer: mesh[0].attributes.NORMAL,
          size: mesh[0].count,
          indexBuffer: mesh[0].indices!.buffer,
          indexFormat: "uint16",
          drawColor: [1.0, 0.4, 0.2, 1.0],
        },
      });
    }
  );

  // for (let i = 0; i < 20; i++) {
  //   for (let j = 0; j < 20; j++) {
  //     const testEntity = sys.entity({
  //       transform: translate([i * 2 - 10, j * 2 - 10, -20]),
  //       sampleWebgpuRendererGeometry: {
  //         vertexBuffer: mesh[0].attributes.POSITION,
  //         normalBuffer: mesh[0].attributes.NORMAL,
  //         size: mesh[0].count,
  //         indexBuffer: mesh[0].indices!.buffer,
  //         indexFormat: "uint16",
  //         drawColor: [1.0, 0.4, 0.2, 1.0],
  //       },
  //     });
  //     sys.entity({
  //       transform: translate([i * 2 - 20, j * 2 - 20, -30]),
  //       sampleWebgpuRendererGeometry: {
  //         vertexBuffer: mesh[0].attributes.POSITION,
  //         normalBuffer: mesh[0].attributes.NORMAL,
  //         size: mesh[0].count,
  //         indexBuffer: mesh[0].indices!.buffer,
  //         indexFormat: "uint16",
  //         drawColor: [1.0, 0.4, 0.2, 1.0],
  //       },
  //     });
  //     sys.entity({
  //       transform: translate([i * 2 - 20, j * 2 - 20, -60]),
  //       sampleWebgpuRendererGeometry: {
  //         vertexBuffer: mesh[0].attributes.POSITION,
  //         normalBuffer: mesh[0].attributes.NORMAL,
  //         size: mesh[0].count,
  //         indexBuffer: mesh[0].indices!.buffer,
  //         indexFormat: "uint16",
  //         drawColor: [1.0, 0.4, 0.2, 1.0],
  //       },
  //     });
  //     entities.push(testEntity);
  //   }
  // }

  // for (let i = 0; i < 20; i++) {
  //   for (let j = 0; j < 20; j++) {
  //     const testEntity = sys.entity({
  //       // transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  //       // transform: translate([rand(-10, 10), rand(-10, 10), rand(-40, -4)]),
  //       transform: translate([i - 5, j - 5, -(i + j + 5) * 2]),
  //       sampleWebgpuRendererGeometry: {
  //         vertexBuffer: mesh[0].attributes.POSITION,
  //         normalBuffer: mesh[0].attributes.NORMAL,
  //         size: mesh[0].count,
  //         indexBuffer: mesh[0].indices!.buffer,
  //         indexFormat: "uint16",
  //         drawColor: [1.0, 0.4, 0.2, 1.0],
  //       },
  //       // rigidBody: RAPIER.RigidBodyDesc.dynamic().setTranslation(
  //       //   rand(-1, 1),
  //       //   i * 1.5 + 1,
  //       //   rand(-11, -9)
  //       //   // rand(-2, 2)
  //       // ),
  //       // rigidBodyCollider: RAPIER.ColliderDesc.ball(0.5).setFriction(0.9),
  //     });
  //     entities.push(testEntity);
  //   }
  // }

  // for (const x of range(500)) {
  //   const testEntity = sys.entity({
  //     // transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  //     // transform: translate([rand(-10, 10), rand(-10, 10), rand(-40, -4)]),
  //     transform: translate([rand(-10, 10), rand(-10, 10), rand(-30, -10)]),
  //     sampleWebgpuRendererGeometry: {
  //       vertexBuffer: mesh[0].attributes.POSITION,
  //       normalBuffer: mesh[0].attributes.NORMAL,
  //       size: mesh[0].count,
  //       indexBuffer: mesh[0].indices!.buffer,
  //       indexFormat: "uint16",
  //       drawColor: [1.0, 0.4, 0.2, 1.0],
  //     },
  //     // rigidBody: RAPIER.RigidBodyDesc.dynamic().setTranslation(
  //     //   rand(-1, 1),
  //     //   i * 1.5 + 1,
  //     //   rand(-11, -9)
  //     //   // rand(-2, 2)
  //     // ),
  //     // rigidBodyCollider: RAPIER.ColliderDesc.ball(0.5).setFriction(0.9),
  //   });
  //   entities.push(testEntity);
  // }

  // for (const x of range(100)) {
  //   const testEntity = sys.entity({
  //     transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  //     // transform: translate([rand(-10, 10), rand(-10, 10), rand(-40, -4)]),
  //     // transform: translate([i - 2, j - 2, -(i + j + 5)]),
  //     sampleWebgpuRendererGeometry: {
  //       vertexBuffer: mesh[0].attributes.POSITION,
  //       normalBuffer: mesh[0].attributes.NORMAL,
  //       size: mesh[0].count,
  //       indexBuffer: mesh[0].indices!.buffer,
  //       indexFormat: "uint16",
  //       drawColor: [1.0, 0.5, 0.25, 1.0],
  //     },
  //     rigidBody: RAPIER.RigidBodyDesc.dynamic().setTranslation(
  //       rand(-1, 1),
  //       x * 1.5 + 1,
  //       rand(-5, 5) - 50
  //       // rand(-2, 2)
  //     ),
  //     rigidBodyCollider: RAPIER.ColliderDesc.ball(0.5).setFriction(0.9),
  //   });
  //   entities.push(testEntity);
  // }

  for (const pos of range(30).map((l) => [
    rand(-10, 10),
    rand(-1, 1),
    rand(-40, -5),
  ]) as Vec3[]) {
    // sys.entity({
    //   transform: translate(pos),
    //   pointLightSource: {
    //     color: [1, 0.5, 0.25],
    //     quadratic: 0.5,
    //     linear: 0.2,
    //     constant: 1,
    //   },
    // });
  }

  sys.entity({
    transform: translate([0, 0, -40]),
    pointLightSource: {
      color: [1, 1, 1],
      quadratic: 0.3,
      linear: 0.2,
      constant: 1,
    },
  });

  const ground = sys.entity({
    transform: translate([0, 0, 0]),
    rigidBody: RAPIER.RigidBodyDesc.fixed(),
    rigidBodyCollider: RAPIER.ColliderDesc.cuboid(60, 1, 60)
      .setTranslation(0, -4, 0)
      .setFriction(0.9),
  });

  let t = 0;

  // const monkeyTest = sys.entity({
  //   transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  //   // transform: translate([rand(-10, 10), rand(-10, 10), rand(-40, -4)]),
  //   // transform: translate([i - 2, j - 2, -(i + j + 5)]),
  //   sampleWebgpuRendererGeometry: {
  //     vertexBuffer: mesh[0].attributes.POSITION,
  //     normalBuffer: mesh[0].attributes.NORMAL,
  //     size: mesh[0].count,
  //     indexBuffer: mesh[0].indices!.buffer,
  //     indexFormat: "uint16",
  //     drawColor: [1.0, 0.5, 0.25, 1.0],
  //   },
  // });

  const renderer = sys.subsystem(SampleWebgpuRenderer);
  const kbd = sys.subsystem(Keyboard).global;
  const mouse = sys.subsystem(MouseFirstPerson).global;

  let pos: Vec3 = [0, 0, 0];
  let vel: Vec3 = [0, 0, 0];

  let viewRotation: Vec2 = [0, 0];

  async function loop() {
    const projection = perspectiveWebgpu(1, 1 / 1, 0.1, 200);
    renderer.global.projectionMatrix = projection;

    // monkeyTest.component(Transform).matrix = translate([t % 10, 0, -50]);

    // console.log(z);

    viewRotation = add2(viewRotation, scale2(mouse.pollMovement(), 0.004));

    const viewRotationMatrix = mulMat4(
      rotate([1, 0, 0], viewRotation[1]),
      rotate([0, 1, 0], viewRotation[0])
    );

    let force: Vec3 = [0, 0, 0];

    if (kbd.isKeyHeld("w")) {
      force = add3(force, [0, 0, -1]);
    }

    if (kbd.isKeyHeld("s")) {
      force = add3(force, [0, 0, 1]);
    }

    if (kbd.isKeyHeld("a")) {
      force = add3(force, [-1, 0, 0]);
    }

    if (kbd.isKeyHeld("d")) {
      force = add3(force, [1, 0, 0]);
    }

    force = xyz(mulVec4ByMat4([...force, 0.0], viewRotationMatrix));

    if (kbd.isKeyHeld(" ")) {
      force = add3(force, [0, 1, 0]);
    }

    if (kbd.isKeyHeld("shift")) {
      force = add3(force, [0, -1, 0]);
    }

    vel = add3(vel, force);

    pos = add3(pos, scale3(vel, 1 / 60));
    vel = scale3(vel, 0.9);

    renderer.global.viewMatrix = mulMat4(
      viewRotationMatrix,
      translate(scale3(pos, -1))
    );

    await sys.renderUpdate();
    await sys.fixedUpdate();

    t++;

    requestAnimationFrame(loop);
    // setTimeout(loop, 500);
  }

  loop();
}

main();
