@group(0) @binding(0) 
var tex_color_in : texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) 
var tex_depth_in : texture_storage_2d<rg32float, read>;
@group(0) @binding(2) 
var tex_color_out : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) 
var tex_depth_out : texture_storage_2d<rg32float, write>;

@compute @workgroup_size(8, 8)
fn ComputeMain(
  @builtin(global_invocation_id) id : vec3<u32>
) {
  let i1 = id.xy * 2;
  let i2 = i1 + vec2u(1, 0);
  let i3 = i1 + vec2u(0, 1);
  let i4 = i1 + vec2u(1, 1);

  let d1 = textureLoad(tex_depth_in, i1);
  let d2 = textureLoad(tex_depth_in, i2);
  let d3 = textureLoad(tex_depth_in, i3);
  let d4 = textureLoad(tex_depth_in, i4);

  let c1 = textureLoad(tex_color_in, i1);
  let c2 = textureLoad(tex_color_in, i2);
  let c3 = textureLoad(tex_color_in, i3);
  let c4 = textureLoad(tex_color_in, i4);

  let avg_color = (
    c1 + c2 + c3 + c4
  ) / 4.0;

  let min_max_depth = vec4f(
    min(
      min(d1.x, d2.x),
      min(d3.x, d4.x)
    ),
    max(
      max(d1.y, d2.y),
      max(d3.y, d4.y)
    ),0.0,0.0
  );

  textureStore(tex_color_out, id.xy, avg_color);
  textureStore(tex_depth_out, id.xy, min_max_depth);
}
