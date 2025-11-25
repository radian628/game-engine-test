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
  SampleWebgpuRenderer,
} from "./renderer";
import { uploadIndexedMeshToGPU, uvSphere } from "../mesh-generation";

import LightingRenderer from "./lighting.wgsl?raw";
import LightingRendererJSON from "lighting.wgsl";
import { specifyComponent } from "../ecs";
import { Transform } from "../transform-component";
import { inv4 } from "../matrix";

export const PointLightSource = specifyComponent({
  async init(subsystem) {
    const { device, canvasFormat, onResize } =
      await subsystem(SampleWebgpuRenderer);

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
      uvSphere(1, [12, 12])
    );

    const state = {
      pointLightGeometry,
      lightingPipeline,
      lightingBindGroupLayout,
      lightingUniformBindGroupLayout,
      lightingBindGroup: undefined as GPUBindGroup | undefined,
    };

    await onResize(async () => {
      const gbuffer = (await subsystem(SampleWebgpuRenderer)).textures.gbuffer;
      console.log("eeeeeeeeeeeeeeeeeeee");
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

  create(
    params: {
      color: Vec3;
      linear: number;
      quadratic: number;
      constant: number;
    },
    global,
    { sampleWebgpuRenderer }
  ) {
    const { device } = sampleWebgpuRenderer.state;

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
      layout: global.state.lightingUniformBindGroupLayout,
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

  renderUpdate({ state, instances, subsystem, scheduleTask }) {
    scheduleTask(
      () => {
        const { projectionMatrix, viewMatrix, device, textures, ctx } =
          subsystem(SampleWebgpuRenderer).state;
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
            (-i.data.linear +
              Math.sqrt(
                i.data.linear ** 2 -
                  4 *
                    i.data.quadratic *
                    (i.data.constant - Math.max(...i.data.color) / cutoff)
              )) /
            (2 * i.data.quadratic);

          const m = mulMat4(i.entity.transform.matrix, scale([rad, rad, rad]));

          const vp = mulMat4(projectionMatrix, viewMatrix);

          const mvp = mulMat4(vp, m);

          const lightPos = mulMat4ByVec4(
            mvp,
            //i.entity.transform.matrix,
            [0, 0, 0, 1]
          );

          console.log(lightPos);

          const buf = makeUniformBuffer<typeof LightingRendererJSON, 1, 0>(
            LightingRendererJSON,
            1,
            0,
            {
              vp,
              mvp,
              m,
              light_color: i.data.color,
              light_pos: lightPos,
              quadratic: i.data.quadratic,
              linear: i.data.linear,
              constant: i.data.constant,
              cutoff_radius: rad,
            }
          );
          device.queue.writeBuffer(i.data.uniformBuffer, 0, buf);
          passEncoder.setBindGroup(1, i.data.uniformBindGroup);

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
  dependencies: [Transform] as const,
  globalDependencies: [SampleWebgpuRenderer] as const,
  brand: "pointLightSource",
  onDestroy() {},
});
