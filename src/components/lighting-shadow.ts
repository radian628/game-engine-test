import {
  makeUniformBuffer,
  Mat4,
  mulMat4,
  mulMat4ByVec4,
  range,
  rotate,
  scale,
  scale3,
  translate,
  Vec3,
  xyz,
} from "r628";
import {
  GBUFFER_PASS,
  GBUFFER_SUBMIT,
  LIGHTING_PASS,
  DeferredWebgpuRenderer,
} from "./renderer";
import { uploadIndexedMeshToGPU, uvSphere } from "../mesh-generation";

import LightingShadowRenderer from "./lighting-shadow.wgsl?incl";
import LightingShadowRendererJSON from "lighting-shadow.wgsl";

import CastShadowShader from "./cast-shadow.wgsl?incl";
import CastShadowShaderJSON from "cast-shadow.wgsl";

import { Transform } from "../transform-component";
import { inv4 } from "../matrix";
import { createComponent } from "../ecs2";
import { TexturedGeometry } from "./geometry";

export function perspectiveWebgpu(
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

export const ShadowPointLightSource = createComponent({
  async init({ compGlobal }) {
    const {
      state: { device, canvasFormat, onResize },
    } = await compGlobal(DeferredWebgpuRenderer);

    const lightingBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          sampler: { type: "non-filtering" },
          visibility: GPUShaderStage.FRAGMENT,
        },
        {
          binding: 1,
          texture: { sampleType: "unfilterable-float", viewDimension: "2d" },
          visibility: GPUShaderStage.FRAGMENT,
        },
        {
          binding: 2,
          texture: { sampleType: "unfilterable-float", viewDimension: "2d" },
          visibility: GPUShaderStage.FRAGMENT,
        },
        {
          binding: 3,
          texture: { sampleType: "float", viewDimension: "2d" },
          visibility: GPUShaderStage.FRAGMENT,
        },
      ],
    });

    const lightingUniformBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
          buffer: {
            type: "uniform",
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
          texture: {
            sampleType: "depth",
            viewDimension: "cube",
          },
        },
      ],
    });

    const module = device.createShaderModule({
      code: LightingShadowRenderer,
    });

    const castShadowShaderModule = device.createShaderModule({
      code: CastShadowShader,
    });

    const shadowCastPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: castShadowShaderModule,
        buffers: [
          {
            arrayStride: 12,
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: "float32x3",
              },
            ],
          },
        ],
      },
      fragment: {
        module: castShadowShaderModule,
        targets: [],
      },
      depthStencil: {
        format: "depth32float",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "none",
      },
    });

    const lightingPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          lightingBindGroupLayout,
          lightingUniformBindGroupLayout,
        ],
      }),
      vertex: {
        module,
        buffers: [
          {
            arrayStride: 12,
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: "float32x3",
              },
            ],
          },
        ],
      },
      fragment: {
        module,
        targets: [
          {
            format: "rgba8unorm",
            blend: {
              color: {
                operation: "add",
                srcFactor: "one",
                dstFactor: "one",
              },
              alpha: {
                operation: "add",
                srcFactor: "one",
                dstFactor: "zero",
              },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list", cullMode: "back" },
    });
    const pointLightGeometry = uploadIndexedMeshToGPU(
      device,
      uvSphere(1, [50, 50])
    );

    const shadowMap = device.createTexture({
      size: [512, 512, 6],
      dimension: "2d",
      format: "depth32float",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      textureBindingViewDimension: "cube",
    });

    const state = {
      shadowMap,
      shadowCastPipeline,
      pointLightGeometry,
      lightingPipeline,
      lightingBindGroupLayout,
      lightingUniformBindGroupLayout,
      lightingBindGroup: undefined as GPUBindGroup | undefined,
    };

    await onResize(async () => {
      const gbuffer = (await compGlobal(DeferredWebgpuRenderer)).state.textures
        .gbuffer;
      state.lightingBindGroup = device.createBindGroup({
        layout: lightingBindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: device.createSampler({
              minFilter: "nearest",
              magFilter: "nearest",
            }),
          },
          {
            binding: 1,
            resource: gbuffer.position,
          },
          {
            binding: 2,
            resource: gbuffer.normal,
          },
          {
            binding: 3,
            resource: gbuffer.albedo,
          },
        ],
      });
    });

    return state;
  },

  async instantiate(
    params: {
      color: Vec3;
      linear: number;
      quadratic: number;
      constant: number;
    },
    { compGlobal }
  ) {
    const g = await compGlobal(ShadowPointLightSource);
    const {
      state: { device },
    } = await compGlobal(DeferredWebgpuRenderer);

    const uniformBuffer = device.createBuffer({
      label: "uniform buffer",
      size: 1024,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.UNIFORM,
    });

    const shadowCastUniformBuffers = range(6).map((i) =>
      device.createBuffer({
        label: "uniform buffer for shadow cast" + i,
        size: 1024,
        usage:
          GPUBufferUsage.STORAGE |
          GPUBufferUsage.COPY_DST |
          GPUBufferUsage.UNIFORM,
      })
    );

    const uniformBindGroup = device.createBindGroup({
      label: "lighting uniform bind group",
      entries: [
        {
          binding: 0,
          resource: uniformBuffer,
        },
        {
          binding: 1,
          resource: g.state.shadowMap.createView({
            dimension: "cube",
          }),
        },
      ],
      layout: g.state.lightingUniformBindGroupLayout,
    });

    return {
      shadowCastUniformBuffers,
      uniformBuffer,
      uniformBindGroup,
      color: params.color,
      quadratic: params.quadratic,
      linear: params.linear,
      constant: params.constant,
    };
  },

  async renderUpdate({
    global: { state },
    instances,
    compGlobal,
    scheduleTask,
    sys,
  }) {
    scheduleTask(
      async () => {
        const {
          state: { projectionMatrix, viewMatrix, device, textures, ctx },
        } = await compGlobal(DeferredWebgpuRenderer);
        const commandEncoder = device.createCommandEncoder();

        const geometry = await sys.compGlobal(TexturedGeometry);

        for (const i of instances) {
          const cutoff = 5 / 256;

          const rad =
            (-i.state.linear +
              Math.sqrt(
                i.state.linear ** 2 -
                  4 *
                    i.state.quadratic *
                    (i.state.constant - Math.max(...i.state.color) / cutoff)
              )) /
            (2 * i.state.quadratic);

          const m = mulMat4(
            i.entity.comp(Transform).state.matrix,
            scale([rad, rad, rad])
          );

          const vp = mulMat4(projectionMatrix, viewMatrix);

          const mvp = mulMat4(vp, m);

          const projectedLightPos = mulMat4ByVec4(
            mvp,
            //i.entity.transform.matrix,
            [0, 0, 0, 1]
          );

          const worldSpaceLightPos = mulMat4ByVec4(
            i.entity.comp(Transform).state.matrix,
            //i.entity.transform.matrix,
            [0, 0, 0, 1]
          );

          for (const [viewRotation, cubemapIndex] of [
            [
              mulMat4(
                rotate([0, 1, 0], -Math.PI / 2),
                rotate([1, 0, 0], Math.PI / 1)
              ),
              0,
            ],
            [
              mulMat4(
                rotate([0, 1, 0], Math.PI / 2),
                rotate([1, 0, 0], Math.PI / 1)
              ),
              1,
            ],
            [
              mulMat4(
                rotate([1, 0, 0], Math.PI / 2),
                rotate([0, 1, 0], Math.PI)
              ),
              2,
            ],
            [mulMat4(rotate([0, 0, 1], 0), rotate([1, 0, 0], -Math.PI / 2)), 3],
            [rotate([0, 0, 1], Math.PI), 4],
            [
              mulMat4(
                rotate([0, 1, 0], Math.PI),
                rotate([0, 0, 1], Math.PI * 1)
              ),
              5,
            ],
          ] as [Mat4, number][]) {
            const persp = perspectiveWebgpu(Math.PI / 2, 1, 0.1, 800);
            const view = mulMat4(
              viewRotation,
              translate(scale3(xyz(worldSpaceLightPos), -1))
            );
            // const mvp = mulMat4(persp, mulMat4(view, viewRotation));

            const shadowMapPassEncoder = commandEncoder.beginRenderPass({
              depthStencilAttachment: {
                view: state.shadowMap.createView({
                  arrayLayerCount: 1,
                  baseArrayLayer: cubemapIndex,
                  dimension: "2d",
                }),
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
              },
              colorAttachments: [],
            });

            shadowMapPassEncoder.setPipeline(state.shadowCastPipeline);

            for (const geo of [...geometry.instances].slice(0, 1)) {
              const buf = makeUniformBuffer<typeof CastShadowShaderJSON, 0, 0>(
                CastShadowShaderJSON,
                0,
                0,
                {
                  mvp: mulMat4(
                    persp,
                    mulMat4(view, geo.entity.comp(Transform).state.matrix)
                  ),
                }
              );

              device.queue.writeBuffer(
                i.state.shadowCastUniformBuffers[cubemapIndex],
                0,
                buf
              );
              shadowMapPassEncoder.setBindGroup(
                0,
                device.createBindGroup({
                  layout: state.shadowCastPipeline.getBindGroupLayout(0),
                  entries: [
                    {
                      binding: 0,
                      resource: i.state.shadowCastUniformBuffers[cubemapIndex],
                    },
                  ],
                })
              );
              shadowMapPassEncoder.setVertexBuffer(0, geo.state.vertexBuffer);
              shadowMapPassEncoder.setIndexBuffer(
                geo.state.indexBuffer,
                geo.state.indexFormat
              );

              shadowMapPassEncoder.drawIndexed(geo.state.vertexCount);
            }

            shadowMapPassEncoder.end();
          }

          const passEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [
              {
                view: textures.lighting.color.createView({
                  mipLevelCount: 1,
                }),
                clearValue: [0, 0, 0, 1],
                loadOp: "load",
                storeOp: "store",
              },
            ],
          });

          passEncoder.setBindGroup(0, state.lightingBindGroup);

          const buf = makeUniformBuffer<
            typeof LightingShadowRendererJSON,
            1,
            0
          >(LightingShadowRendererJSON, 1, 0, {
            inv_vp: inv4(vp),
            mvp,
            m,
            light_color: i.state.color,
            light_pos: projectedLightPos,
            quadratic: i.state.quadratic,
            linear: i.state.linear,
            constant: i.state.constant,
            cutoff_radius: rad,
          });
          device.queue.writeBuffer(i.state.uniformBuffer, 0, buf);
          passEncoder.setBindGroup(1, i.state.uniformBindGroup);

          passEncoder.setPipeline(state.lightingPipeline);
          passEncoder.setVertexBuffer(0, state.pointLightGeometry.vertices);
          passEncoder.setIndexBuffer(
            state.pointLightGeometry.indices,
            "uint32"
          );
          passEncoder.drawIndexed(state.pointLightGeometry.drawCount);
          passEncoder.end();
        }

        device.queue.submit([commandEncoder.finish()]);

        // console.log("lighting");
        return Promise.resolve();
      },
      [LIGHTING_PASS],
      [GBUFFER_SUBMIT]
    );
  },
  deps: [Transform] as const,
});
