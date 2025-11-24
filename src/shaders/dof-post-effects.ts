import { blurKernelArray } from "./codegenners";
import { createSimpleFilterPipeline } from "./simple-filter";

export function blurFar(device: GPUDevice) {
  return createSimpleFilterPipeline(device, {
    inputs: {
      color: {},
      depth: {},
    },
    outputs: {
      blurred: "rgba8unorm",
    },
    uniforms: {
      step: "vec2f",
    },
    globals: `
    const OFFSETS = array(${blurKernelArray});`,
    source: `
        var factor = 0.0;

        var size = vec2f(textureDimensions(tex_depth).xy);

        blurred = vec4(0.0);

        for (var i = 0; i < ${36}; i++) {
          let offset = OFFSETS[i];
          let uv2 = uv + offset.xy / size * params.step;

          let d = textureSample(tex_depth, sampler0, uv2).y;
          let pixel = textureSample(tex_color, sampler0, uv2);

          let maxdist = sqrt(${36});

          let distance_factor = offset.z / maxdist;
          let distance_factor_next = offset.w / maxdist;

          
          var opacity = mix(
            0.0, 
            clamp(depth.y - d + 0.5, 0.0, 1.0),
            clamp(
              (d - distance_factor) / (distance_factor_next - distance_factor),
              0.0, 1.0 
            ) 
          );

          factor += opacity;

          blurred += pixel * opacity;
        }

      blurred /= factor;
    `,
  });
}

export function blurNear(device: GPUDevice) {
  return createSimpleFilterPipeline(device, {
    inputs: {
      far: {},
      near: {},
      depth: {},
    },
    outputs: {
      blurred: "rgba8unorm",
    },
    uniforms: {
      step: "vec2f",
    },
    globals: `
    const OFFSETS = array(${blurKernelArray});`,
    source: `

        var size = vec2f(textureDimensions(tex_depth).xy);

        blurred = vec4(0.0);

        for (var i = 35; i >= 0; i--) {
          let offset = OFFSETS[i];
          let uv2 = uv + offset.xy / size * params.step;

          var pixel = textureSample(tex_near, sampler0, uv2);
          if (pixel.a > 0.0) {
            pixel.a = max(pixel.a, 0.2);
          }
          let d = pixel.a;
          pixel.a = 1.0;

          let maxdist = sqrt(${36});

          let distance_factor = offset.z / maxdist;
          let distance_factor_next = offset.w / maxdist;

          
          var opacity = mix(
            0.0, 
            1 / max(pow(d * maxdist * 0.7, 2.0), 1.0),
            // clamp(depth.y - d + 0.5, 0.0, 1.0),
            min(clamp(
              (d - distance_factor) / (distance_factor_next - distance_factor)
              ,
              0.0, 1.0 
            ),
            clamp(
            (d - depth.x + 0.1) * 10.0, 0.0, 1.0)   
            )
          ); 

          /*
          var opacity = select(
            0.0,
            1 / max(pow(d * maxdist, 2.0), 1.0),
            d > distance_factor 
          ); */

          // blurred += pixel * opacity;
          blurred = mix(blurred, pixel, opacity);
        }

       blurred = mix(
         far,
         blurred,
         blurred.a
         // near,
         // select(0.0, 1.0, near.a > 0)
       );

       blurred.a = 1.0;

    `,
  });
}

export function maxFilterNear(device: GPUDevice) {
  return createSimpleFilterPipeline(device, {
    inputs: {
      color: {},
      depth: {},
    },
    outputs: {
      blurred: "rgba8unorm",
    },
    uniforms: {
      step: "vec2f",
    },
    globals: `
    const OFFSETS = array(${blurKernelArray});`,
    source: `
        var factor = 0.0;

        var size = vec2f(textureDimensions(tex_depth).xy);

        blurred = vec4f(0.0);

        for (var i = 0; i < ${36}; i++) {
          let offset = OFFSETS[i];
          let uv2 = uv + offset.xy / size * params.step;

          let d = textureSample(tex_depth, sampler0, uv2).x;
          let pixel = textureSample(tex_color, sampler0, uv2);

          let maxdist = sqrt(${36});

          let distance_factor = offset.z / maxdist;
          let distance_factor_next = offset.w / maxdist;

          /*
          var opacity = mix(
            0.0, 
            1.0,
             clamp(
              (d - distance_factor) / (distance_factor_next - distance_factor),
              0.0, 1.0 
            ) 
          );*/

          var opacity = select(
          0.0, 1.0,
            distance_factor < d
          );

          blurred = max(blurred, vec4f(pixel.rgb * opacity, d * opacity));
        }


    `,
  });
}

export function maskOutFar(device: GPUDevice) {
  return createSimpleFilterPipeline(device, {
    inputs: {
      color: {},
      depth: {},
    },
    outputs: {
      far_field: "rgba8unorm",
    },
    source: `
      far_field = color;
      if (depth.y == 0.0) {
        far_field.a = 0.0;
      }
    `,
  });
}
