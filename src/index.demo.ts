// import { SampleWebgpuRenderer, Test } from "./draw-components";

import {
  add2,
  add3,
  cartesianProduct,
  length3,
  Mat4,
  memo,
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
  Vec4,
  xyz,
} from "r628";
import {
  createBufferFromData,
  MainCanvas,
  DeferredWebgpuRenderer,
} from "./components/renderer";
import { Transform } from "./transform-component";
import { parse } from "@loaders.gl/core";
import {
  GLTFLoader,
  GLTFMeshPostprocessed,
  GLTFPostprocessed,
  postProcessGLTF,
} from "@loaders.gl/gltf";
import {
  PhysicsWorld,
  RigidBody,
  RigidBodyCollider,
} from "./components/physics-components";
import { PointLightSource } from "./components/lighting";
import {
  SampleWebgpuRendererGeometry,
  TexturedGeometry,
} from "./components/geometry";
import {
  ParticleForcefield,
  ParticleSystem,
} from "./components/particle-system";
import { Keyboard, Mouse, MouseFirstPerson } from "./components/input";
import { PostprocessingPipeline } from "./components/postprocess";
import { createSimpleFilterPipeline } from "./shaders/simple-filter";
import {
  PhysicalPlayerController,
  TrackCamera,
} from "./components/player-controller";
import {
  SphericalImpulseJoint,
  UnitImpulseJoint,
} from "@dimforge/rapier3d-simd";
import { createSystem, Entity, System } from "./ecs2";
import { ShadowPointLightSource } from "./components/lighting-shadow";
import { AmbientLightSource } from "./components/lighting-ambient";

// import Gltf from "models.glb";
// console.log("a", Gltf);

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

function gltlfMeshToRapierTrimesh(
  RAPIER: Awaited<typeof import("@dimforge/rapier3d-simd/exports")>,
  mesh: GLTFMeshPostprocessed,
  scale: Vec3 = [1, 1, 1]
) {
  const prim = mesh.primitives[0];
  const position = Object.entries(prim.attributes).find(
    (e) => e[0] === "POSITION"
  )?.[1];
  if (!position) throw new Error("No position!");
  const indices = prim.indices;
  if (!indices) throw new Error("Mesh should be indexed!");

  const values = new Float32Array(position.value.buffer.slice());

  for (let i = 0; i < values.length; i += 3) {
    values[i] *= scale[0];
    values[i + 1] *= scale[1];
    values[i + 2] *= scale[2];
  }

  if (indices.bytesPerElement === 2) {
    return RAPIER.ColliderDesc.trimesh(
      values,
      new Uint32Array([...new Uint16Array(indices.value.buffer)])
    );
  } else {
    return RAPIER.ColliderDesc.trimesh(
      values,
      new Uint32Array(indices.value.buffer)
    );
  }
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

function getNodeByName(gltf: GLTFPostprocessed, name: string) {
  return gltf.nodes.find((n) => n.name === name);
}

async function generateTerrain(params: {
  sys: System;
  gltf: GLTFPostprocessed;
  checkPrefix: string;
  device: GPUDevice;
}) {
  const { sys, gltf, checkPrefix, device } = params;

  const {
    state: { world, RAPIER },
  } = await sys.compGlobal(PhysicsWorld);

  const makeTexture = memo((bmp: ImageBitmap) => {
    const tex = device.createTexture({
      size: [bmp.width, bmp.height],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture(
      { source: bmp },
      {
        texture: tex,
      },
      { width: bmp.width, height: bmp.height }
    );

    return tex;
  });

  const makeGPUBuffers = memo((mesh: GLTFMeshPostprocessed) => {
    return gltfMeshToWebGPUBuffers(device, mesh);
  });

  const makeRapierTrimesh = memo(
    (mesh: GLTFMeshPostprocessed, scale: Vec3) => {
      return gltlfMeshToRapierTrimesh(RAPIER, mesh, scale);
    },
    ([mesh, scale]) => [mesh, ...scale]
  );

  for (const node of gltf.nodes) {
    if (!node.name) continue;
    if (!node.mesh) continue;
    if (!node.name.startsWith(checkPrefix)) continue;
    console.log(node.name, node.mesh, node);

    const mesh = node.mesh.primitives[0];

    const material =
      mesh.material.pbrMetallicRoughness.baseColorTexture.texture.source.image;

    console.log(mesh);

    const gpumesh = makeGPUBuffers(node.mesh);

    const translation: Vec3 = (node.translation as Vec3) ?? [0, 0, 0];

    const scale = (node.scale as Vec3) ?? [1, 1, 1];

    const e = await sys.entity(
      Transform(translate([0, 0, 0])),
      TexturedGeometry({
        vertexBuffer: gpumesh[0].attributes.POSITION,
        normalBuffer: gpumesh[0].attributes.NORMAL,
        uvBuffer:
          gpumesh[0].attributes.TEXCOORD_1 ?? gpumesh[0].attributes.TEXCOORD_0,
        albedoTexture: makeTexture(material as unknown as ImageBitmap),
        size: gpumesh[0].count,
        indexBuffer: gpumesh[0].indices!.buffer,
        indexFormat: "uint16",
        drawColor: [0.27, 0.29, 0.31, 1.0],
      }),
      RigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...translation)),
      RigidBodyCollider(makeRapierTrimesh(node.mesh, scale).setFriction(0))
    );

    e.comp(RigidBody).state.scale = scale;
  }
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

  const sys = await createSystem();

  //   [
  //   Transform,
  //   DeferredWebgpuRenderer,
  //   SampleWebgpuRendererGeometry,
  //   RigidBody,
  //   PhysicsWorld,
  //   RigidBodyCollider,
  //   MainCanvas,
  //   PointLightSource,
  //   ParticleSystem,
  //   ParticleForcefield,
  //   Keyboard,
  //   // MouseFirstPerson,
  //   Mouse,
  //   PostprocessingPipeline(
  //     ({ device, canvas }) => {
  //       return {
  //         blitToCanvas: createSimpleFilterPipeline(device, {
  //           inputs: { x: {} },
  //           outputs: {
  //             y: navigator.gpu.getPreferredCanvasFormat() as "bgra8unorm",
  //           },
  //           source: "y = mix(vec4f(1.0,0.0,0.0,1.0), vec4f(x.rgb, 1.0), x.a);",
  //         }),
  //       };
  //     },
  //     () => undefined,
  //     ({ device, canvas, ctx, lighting }, res, g) => {
  //       const encoder = device.createCommandEncoder();
  //       g.blitToCanvas.withInputs({
  //         x: lighting.createView(),
  //       })(undefined)(encoder, { y: ctx.getCurrentTexture().createView() });
  //       device.queue.submit([encoder.finish()]);
  //     }
  //   ),
  //   PhysicalPlayerController,
  //   TrackCamera,
  // ]

  await sys.compGlobal(
    PostprocessingPipeline(
      ({ device, canvas }) => {
        return {
          blitToCanvas: createSimpleFilterPipeline(device, {
            inputs: { x: {} },
            outputs: {
              y: navigator.gpu.getPreferredCanvasFormat() as "bgra8unorm",
            },
            // source: "y = mix(vec4f(1.0,0.0,0.0,1.0), vec4f(x.rgb, 1.0), x.a);
            source: "y = x;",
          }),

          chromaticAberration: createSimpleFilterPipeline(device, {
            inputs: { x: {} },
            outputs: {
              y: navigator.gpu.getPreferredCanvasFormat() as "bgra8unorm",
            },
            source: `
let dims = textureDimensions(tex_x).xy;
let offset = vec2f(1.0) / vec2f(dims);
var px1 = textureSampleLevel(tex_x, sampler0, uv - offset, 0);
var px2 = textureSampleLevel(tex_x, sampler0, uv + offset, 0);
var px3 = textureSampleLevel(tex_x, sampler0, uv + offset * 2, 0);

px1 *= vec4f(0.0, 0.5, 0.75, 1.0);
px2 *= vec4f(0.5, 0.0, 0.25, 1.0);
px3 *= vec4f(0.5, 0.5, 0.0, 1.0);

y = px1 + px2 + px3;
y.a = 1.0; 
            
            `,
          }),

          dofBlur: createSimpleFilterPipeline(device, {
            inputs: { color: {}, position: {} },
            uniforms: { origin: "vec3f" },
            samplers: [{}],
            outputs: {
              blurred: "rgba8unorm",
            },
            globals: `

fn hash22(p: vec2u) -> vec2u {
    var v = p * 1664525u + 1013904223u;
    v.x += v.y * 1664525u; v.y += v.x * 1664525u;
    v ^= v >> vec2u(16u);
    v.x += v.y * 1664525u; v.y += v.x * 1664525u;
    v ^= v >> vec2u(16u);
    return v;
}
fn rand22(f: vec2f) -> vec2f { return vec2f(hash22(bitcast<vec2u>(f))) / f32(0xffffffff); }


            `,
            source: `
_ = params.origin;
_ = position;
let dims = textureDimensions(tex_color).xy;
let RAD = 10.0 / f32(dims.x);
let STEP = 0.2;

var base_offset = (rand22(uv) - 0.5) * RAD * 2.0;

// let pixel = vec2u(uv * vec2f(dims));

// let base_offset = RAD * vec2f(
//   select(-1.0, 1.0, pixel.y % 2 == 0),
//   select(-1.0, 1.0, pixel.x % 2 == 0)
// );


// let base_offset = vec2f(
//   cos(uv.y * 1000.0),
//   sin(uv.x * 1000.0)
//  ) * RAD;

var blended = vec4f(0.0);
var samples = 0.0;

for (var i = 0.0; i < 1.2; i += STEP) {
  let offset = base_offset * i;
  let offset_next = base_offset * (i + STEP);
  let sample_coord = uv + offset;
  let offset_color = textureSampleLevel(tex_color, sampler0, sample_coord, 0); 
  let offset_position = textureSampleLevel(tex_position, sampler0, sample_coord, 0).xyz;

  let dist = distance(offset_position, params.origin);
  let coc = RAD * pow(abs(dist - 10.0) / dist, 2.0) * 0.01;

  let should_blend = coc > length(offset) && coc < length(offset_next);
  
  blended += select(vec4(0.0), offset_color, should_blend);
  // samples += select(0.0, 1.0, should_blend);
}


blurred = blended ;
blurred.a = 1.0;
            `,
          }),
        };
      },
      ({ device, canvas }) => {
        return {
          dofTemp: device.createTexture({
            size: [canvas.width, canvas.height],
            dimension: "2d",
            format: "rgba8unorm",
            usage:
              GPUTextureUsage.RENDER_ATTACHMENT |
              GPUTextureUsage.TEXTURE_BINDING,
          }),
        };
      },
      (
        { device, canvas, ctx, lighting, albedo, position },
        res,
        g,
        { dofTemp }
      ) => {
        const encoder = device.createCommandEncoder();

        // g.dofBlur.withInputs({
        //   position: position.createView(),
        //   color: lighting.createView(),
        // })(
        //   g.dofBlur.makeUniformBuffer().setBuffer({
        //     origin: [0, 0, 0],
        //   })
        // )(encoder, { blurred: dofTemp.createView() });

        g.chromaticAberration.withInputs({
          x: lighting.createView(),
        })(undefined)(encoder, { y: ctx.getCurrentTexture().createView() });
        // g.blitToCanvas.withInputs({
        //   x: albedo.createView(),
        // })(undefined)(encoder, { y: ctx.getCurrentTexture().createView() });
        device.queue.submit([encoder.finish()]);
      }
    )
  );

  const device = (await sys.compGlobal(DeferredWebgpuRenderer)).state.device;

  const mesh = gltfMeshToWebGPUBuffers(device, g.meshes[0]);
  const bg = gltfMeshToWebGPUBuffers(device, g.meshes[2]);
  const tunnel = gltfMeshToWebGPUBuffers(device, g.meshes[4]);
  const wormseg = gltfMeshToWebGPUBuffers(device, g.meshes[5]);

  let entities: Entity<
    | typeof Transform
    | typeof SampleWebgpuRendererGeometry
    | typeof RigidBody
    | typeof RigidBodyCollider
  >[] = [];

  const { world, RAPIER } = (await sys.compGlobal(PhysicsWorld)).state;

  const particleCount = 100000;

  const particlePositions = createBufferFromData(
    device,
    new Float32Array(
      range(particleCount).flatMap((x) => [
        rand(-250, 250),
        rand(0, 1) ** 2 * 50,
        rand(-250, 250),
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

  // sys.entity({
  //   transform: translate([0, 0, -15]),
  //   particleForcefield: {
  //     positionBuffer: particlePositions,
  //     velocityBuffer: particleVelocities,
  //     forceFieldTexture: tex,
  //     count: particleCount,
  //   },
  // });

  // sys.entity(
  //   Transform(translate([0, 0, -15])),
  //   ParticleForcefield({
  //     positionBuffer: particlePositions,
  //     velocityBuffer: particleVelocities,
  //     forceFieldTexture: tex,
  //     count: particleCount,
  //   })
  // );

  // // const particles = sys.entity({
  // //   transform: translate([0, 0, -15]),
  // //   particleSystem: {
  // //     drawColor: [1.0, 1.0, 1.0, 1.0],
  // //     count: particleCount,
  // //     positionBuffer: particlePositions,
  // //   },
  // // });

  const s = ShadowPointLightSource({
    color: [1.0, 0.0, 0.0],
    linear: 1 / 1000,
    quadratic: 1 / 1000,
    constant: 0,
  });

  // sys.entity(
  //   Transform(translate([0, 0, -15])),
  //   ParticleSystem({
  //     drawColor: [0.8, 0.8, 0.8, 1.0],
  //     count: particleCount,
  //     positionBuffer: particlePositions,
  //     scale: 0.8,
  //   })
  // );

  // const background = sys.entity({
  //   transform: translate([0, 0, -90]),
  //   sampleWebgpuRendererGeometry: {
  //     vertexBuffer: bg[0].attributes.POSITION,
  //     normalBuffer: bg[0].attributes.NORMAL,
  //     size: bg[0].count,
  //     indexBuffer: bg[0].indices!.buffer,
  //     indexFormat: "uint16",
  //     drawColor: [0.2, 0.4, 1.0, 1.0],
  //   },
  // });

  // const background = sys.entity(
  //   Transform(translate([0, 0, -90])),
  //   SampleWebgpuRendererGeometry({
  //     vertexBuffer: bg[0].attributes.POSITION,
  //     normalBuffer: bg[0].attributes.NORMAL,
  //     size: bg[0].count,
  //     indexBuffer: bg[0].indices!.buffer,
  //     indexFormat: "uint16",
  //     drawColor: [0.2, 0.4, 1.0, 1.0],
  //   })
  // );

  // sys.entity({
  //   transform: translate([0, 0, 0]),
  //   sampleWebgpuRendererGeometry: {
  //     vertexBuffer: tunnel[0].attributes.POSITION,
  //     normalBuffer: tunnel[0].attributes.NORMAL,
  //     size: tunnel[0].count,
  //     indexBuffer: tunnel[0].indices!.buffer,
  //     indexFormat: "uint16",
  //     drawColor: [0.27, 0.29, 0.31, 1.0],
  //   },
  //   rigidBody: RAPIER.RigidBodyDesc.fixed().setTranslation(0, -10, -10),
  //   rigidBodyCollider: gltlfMeshToRapierTrimesh(
  //     RAPIER,
  //     g.meshes[4]
  //   ).setFriction(0.6),
  // });

  await generateTerrain({
    sys,
    gltf: g,
    checkPrefix: "ground",
    device,
  });

  // const worldtex = device.createTexture({
  //   size: [1024, 1024],
  //   format: "rgba8unorm",
  //   usage:
  //     GPUTextureUsage.COPY_DST |
  //     GPUTextureUsage.TEXTURE_BINDING |
  //     GPUTextureUsage.RENDER_ATTACHMENT,
  // });

  // console.log("texture", g.images[0].image);

  // // const testcanvas = document.createElement("canvas");
  // // testcanvas.width = 1024;
  // // testcanvas.height = 1024;
  // // testcanvas.style = `
  // // position: absolute;
  // // top: 0;
  // // left: 0;
  // // z-index: 99;`;
  // // document.body.appendChild(testcanvas);
  // // testcanvas
  // //   .getContext("2d")
  // //   .drawImage(g.images[0].image as unknown as ImageBitmap, 0, 0, 256, 256);

  // device.queue.copyExternalImageToTexture(
  //   { source: g.images[0].image as unknown as ImageBitmap },
  //   {
  //     texture: worldtex,
  //   },
  //   { width: 1024, height: 1024 }
  // );

  // sys.entity(
  //   Transform(translate([0, 0, 0])),
  //   TexturedGeometry({
  //     vertexBuffer: tunnel[0].attributes.POSITION,
  //     normalBuffer: tunnel[0].attributes.NORMAL,
  //     uvBuffer: tunnel[0].attributes.TEXCOORD_0,
  //     albedoTexture: worldtex,
  //     size: tunnel[0].count,
  //     indexBuffer: tunnel[0].indices!.buffer,
  //     indexFormat: "uint16",
  //     drawColor: [0.27, 0.29, 0.31, 1.0],
  //   }),
  //   RigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0)),
  //   RigidBodyCollider(
  //     gltlfMeshToRapierTrimesh(RAPIER, g.meshes[4]).setFriction(0)
  //   )
  // );

  // const ground = sys.entity({
  //   transform: translate([0, 0, 0]),
  // });

  // cartesianProduct(smartRange(10), smartRange(10), smartRange(10)).map(
  //   ([x, y, z]) => {
  //     const position: Vec3 = [
  //       x.remap(-20, 20, true),
  //       y.remap(-20, 20, true),
  //       z.remap(-60, -20, true),
  //     ];

  //     sys.entity({
  //       transform: translate(position),
  //       sampleWebgpuRendererGeometry: {
  //         vertexBuffer: mesh[0].attributes.POSITION,
  //         normalBuffer: mesh[0].attributes.NORMAL,
  //         size: mesh[0].count,
  //         indexBuffer: mesh[0].indices!.buffer,
  //         indexFormat: "uint16",
  //         drawColor: [1.0, 0.4, 0.2, 1.0],
  //       },
  //     });
  //   }
  // );

  const wormsegGeo = {
    vertexBuffer: wormseg[0].attributes.POSITION,
    normalBuffer: wormseg[0].attributes.NORMAL,
    size: wormseg[0].count,
    indexBuffer: wormseg[0].indices!.buffer,
    indexFormat: "uint16" as const,
    drawColor: [1.0, 0.8, 1.0, 0.99] as Vec4,
  };

  // const sys2: System<typeof RigidBody | typeof SampleWebgpuRendererGeometry> =
  //   sys;

  // const player = sys.entity({
  //   transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  //   // sampleWebgpuRendererGeometry: wormsegGeo,
  //   // rigidBody: RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, -10),
  //   // rigidBodyCollider: RAPIER.ColliderDesc.ball(0.5)
  //   //   .setFriction(0.1)
  //   //   .setCollisionGroups(
  //   //     PLAYER_COLLIDER_GROUP | (~PLAYER_COLLIDER_GROUP << 16)
  //   //   ),
  //   physicalPlayerController: {
  //     geometry: wormsegGeo,
  //     sys,
  //   },
  //   trackCamera: {},
  // });

  const player = await sys.entity(
    Transform(translate([0, 0, 10])),
    PhysicalPlayerController({
      geometry: wormsegGeo,
      startPos: getNodeByName(g, "playerstart").translation as Vec3,
      // startPos: [3, 30, 3],
    })
    // TrackCamera(undefined)
  );

  // console.log("player created", player, player.comp(TrackCamera));

  // const ropeEntities: Entity<typeof RigidBody>[] = [];
  // for (let i = 0; i < 20; i++) {
  //   ropeEntities.push(
  //     sys.entity({
  //       transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  //       sampleWebgpuRendererGeometry: wormsegGeo,
  //       rigidBody: RAPIER.RigidBodyDesc.dynamic()
  //         .setTranslation(0, 5 + i, -10)
  //         .setCcdEnabled(true),
  //       rigidBodyCollider: RAPIER.ColliderDesc.ball(0.4)
  //         .setFriction(0.6)
  //         .setCollisionGroups(
  //           PLAYER_COLLIDER_GROUP | (~PLAYER_COLLIDER_GROUP << 16)
  //         ),
  //     })
  //   );
  // }

  // for (let i = 0; i < 19; i++) {
  //   let a = ropeEntities[i].component(RigidBody);
  //   let b = ropeEntities[i + 1].component(RigidBody);

  //   const params = RAPIER.JointData.spring(
  //     0.1,
  //     100,
  //     0.2,
  //     {
  //       x: 0,
  //       y: 0.3,
  //       z: 0,
  //     },
  //     {
  //       x: 0,
  //       y: -0.3,
  //       z: 0,
  //     }
  //   );
  //   world.createImpulseJoint(params, a.body, b.body, true);
  // }

  // world.createImpulseJoint(
  //   RAPIER.JointData.spring(
  //     0.1,
  //     100,
  //     0.2,
  //     {
  //       x: 0,
  //       y: 0.3,
  //       z: 0,
  //     },
  //     {
  //       x: 0,
  //       y: -0.3,
  //       z: 0,
  //     }
  //   ),
  //   player.component(RigidBody).body,
  //   ropeEntities[0].component(RigidBody).body,
  //   true
  // );

  for (const x of range(0)) {
    const testEntity = sys.entity(
      Transform([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
      SampleWebgpuRendererGeometry({
        vertexBuffer: mesh[0].attributes.POSITION,
        normalBuffer: mesh[0].attributes.NORMAL,
        size: mesh[0].count,
        indexBuffer: mesh[0].indices!.buffer,
        indexFormat: "uint16",
        drawColor: [1.0, 0.5, 0.25, 1.0],
      }),
      RigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(
          rand(-1, 1),
          x * 1.5 + 1,
          rand(-15, -7)
          // rand(-2, 2)
        )
      ),
      RigidBodyCollider(RAPIER.ColliderDesc.ball(0.5).setFriction(0.9))
    );
    // entities.push(testEntity);
  }

  // sys.entity({
  //   transform: translate([0, 30, -20]),
  //   pointLightSource: {
  //     color: [1, 1, 1],
  //     quadratic: 0.02,
  //     linear: 0.01,
  //     constant: 1,
  //   },
  // });
  // sys.entity({
  //   transform: translate([0, 30, 0]),
  //   pointLightSource: {
  //     color: [1, 1, 1],
  //     quadratic: 0.02,
  //     linear: 0.01,
  //     constant: 1,
  //   },
  // });

  sys.entity(
    AmbientLightSource({
      color: [0.1, 0.1, 0.1],
    })
  );

  for (const pos of [
    [80, 220, 80],
    // [0, 100, 0],
  ] as Vec3[]) {
    sys.entity(
      Transform(translate(pos)),
      ShadowPointLightSource({
        color: [1, 0.8, 0.7],
        quadratic: 1 / 5000,
        linear: 1 / 10000,
        constant: 1,
      })
    );
  }

  // const ground = sys.entity({
  //   transform: translate([0, 0, 0]),
  //   rigidBody: RAPIER.RigidBodyDesc.fixed(),
  //   rigidBodyCollider: RAPIER.ColliderDesc.cuboid(60, 1, 60)
  //     .setTranslation(0, -4, 0)
  //     .setFriction(0.9),
  // });

  let t = 0;

  const renderer = await sys.compGlobal(DeferredWebgpuRenderer);
  const kbd = await sys.compGlobal(Keyboard);
  // const mouse = sys.subsystem(MouseFirstPerson).global;

  let pos: Vec3 = [0, 0, 0];
  let vel: Vec3 = [0, 0, 0];

  let viewRotation: Vec2 = [0, 0];

  async function fixedLoop() {
    await sys.fixedUpdate();
    setTimeout(fixedLoop, 1000 / 60);
  }

  async function loop() {
    renderer.state.aspect = window.innerWidth / window.innerHeight;
    renderer.state.fov = 1.8;
    renderer.state.near = 0.1;
    renderer.state.far = 10000;

    // monkeyTest.component(Transform).matrix = translate([t % 10, 0, -50]);

    // console.log(z);

    // viewRotation = add2(viewRotation, scale2(mouse.pollMovement(), 0.004));

    // const viewRotationMatrix = mulMat4(
    //   rotate([1, 0, 0], viewRotation[1]),
    //   rotate([0, 1, 0], viewRotation[0])
    // );

    // let force: Vec3 = [0, 0, 0];

    // if (kbd.isKeyHeld("w")) {
    //   force = add3(force, [0, 0, -1]);
    // }

    // if (kbd.isKeyHeld("s")) {
    //   force = add3(force, [0, 0, 1]);
    // }

    // if (kbd.isKeyHeld("a")) {
    //   force = add3(force, [-1, 0, 0]);
    // }

    // if (kbd.isKeyHeld("d")) {
    //   force = add3(force, [1, 0, 0]);
    // }

    // force = xyz(mulVec4ByMat4([...force, 0.0], viewRotationMatrix));

    // if (kbd.isKeyHeld(" ")) {
    //   force = add3(force, [0, 1, 0]);
    // }

    // if (kbd.isKeyHeld("shift")) {
    //   force = add3(force, [0, -1, 0]);
    // }

    // vel = add3(vel, force);

    // pos = add3(pos, scale3(vel, 1 / 60));
    // vel = scale3(vel, 0.9);

    // renderer.global.viewMatrix = mulMat4(
    //   viewRotationMatrix,
    //   translate(scale3(pos, -1))
    // );

    await sys.renderUpdate();

    t++;

    requestAnimationFrame(loop);
    // setTimeout(loop, 500);
  }

  loop();
  fixedLoop();
}

main();
