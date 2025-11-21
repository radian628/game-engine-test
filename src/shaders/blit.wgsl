@group(0) @binding(0)
var tex_src : texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1)
var tex_dst : texture_storage_2d<rgba8unorm, write>;

struct Params {
  mip_level_src : u32,
  mip_level_dst : u32 
}

@group(1) @binding(0)
var<uniform> params : Params;

@compute @workgroup_size(8, 8)
fn ComputeMain(
  @builtin(global_invocation_id) id : vec3<u32>
) {
  let src_pixel = textureLoad(tex_src, id.xy, params.mip_level_src);
  textureStore(tex_dst, id.xy, params.mip_level_dst, src_pixel);
}