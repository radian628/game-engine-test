import {
  makeUniformBuffer,
  mulMat4,
  mulMat4ByVec4,
  rotate,
  scale,
  Vec3,
} from "r628";
import {
  GBUFFER_PASS,
  GBUFFER_SUBMIT,
  LIGHTING_PASS,
  DeferredWebgpuRenderer,
} from "./renderer";
import { uploadIndexedMeshToGPU, uvSphere } from "../mesh-generation";

import LightingRenderer from "./lighting.wgsl?raw";
import LightingRendererJSON from "lighting.wgsl";
import { Transform } from "../transform-component";
import { inv4 } from "../matrix";
import { createComponent } from "../ecs2";

export const PointLightSource = createComponent({
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
      ],
    });

    const lightingPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          lightingBindGroupLayout,
          lightingUniformBindGroupLayout,
        ],
      }),
      vertex: {
        module: device.createShaderModule({
          code: LightingRenderer,
        }),
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
        module: device.createShaderModule({
          code: LightingRenderer,
        }),
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

    const state = {
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
    const g = await compGlobal(PointLightSource);
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

    const uniformBindGroup = device.createBindGroup({
      label: "lighting uniform bind group",
      entries: [
        {
          binding: 0,
          resource: uniformBuffer,
        },
      ],
      layout: g.state.lightingUniformBindGroupLayout,
    });

    return {
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
  }) {
    scheduleTask(
      async () => {
        const {
          state: { projectionMatrix, viewMatrix, device, textures, ctx },
        } = await compGlobal(DeferredWebgpuRenderer);
        const commandEncoder = device.createCommandEncoder();

        const passEncoder = commandEncoder.beginRenderPass({
          colorAttachments: [
            {
              view: textures.lighting.color.createView({
                mipLevelCount: 1,
              }),
              clearValue: [0, 0, 0, 1],
              loadOp: "clear",
              storeOp: "store",
            },
          ],
        });

        passEncoder.setBindGroup(0, state.lightingBindGroup);

        const cutoff = 5 / 256;

        for (const i of instances) {
          const rad =
            (-i.state.linear +
              Math.sqrt(
                i.state.linear ** 2 -
                  4 *
                    i.state.quadratic *
                    (i.state.constant - Math.max(...i.state.color) / cutoff)
              )) /
            (2 * i.state.quadratic);

          console.log(rad);

          const m = mulMat4(
            i.entity.comp(Transform).state.matrix,
            scale([rad, rad, rad])
          );

          const vp = mulMat4(projectionMatrix, viewMatrix);

          const mvp = mulMat4(vp, m);

          const lightPos = mulMat4ByVec4(
            mvp,
            //i.entity.transform.matrix,
            [0, 0, 0, 1]
          );

          const buf = makeUniformBuffer<typeof LightingRendererJSON, 1, 0>(
            LightingRendererJSON,
            1,
            0,
            {
              inv_vp: inv4(vp),
              mvp,
              m,
              light_color: i.state.color,
              light_pos: lightPos,
              quadratic: i.state.quadratic,
              linear: i.state.linear,
              constant: i.state.constant,
              cutoff_radius: rad,
            }
          );
          device.queue.writeBuffer(i.state.uniformBuffer, 0, buf);
          passEncoder.setBindGroup(1, i.state.uniformBindGroup);

          passEncoder.setPipeline(state.lightingPipeline);
          passEncoder.setVertexBuffer(0, state.pointLightGeometry.vertices);
          passEncoder.setIndexBuffer(
            state.pointLightGeometry.indices,
            "uint32"
          );
          passEncoder.drawIndexed(state.pointLightGeometry.drawCount);
        }

        passEncoder.end();

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
