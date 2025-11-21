
@group(0) @binding(0)
var tex_src : texture_storage_2d<rgba32float, read>;
@group(0) @binding(1)
var tex_dst : texture_storage_2d<rg32float, write>;

@compute @workgroup_size(8, 8)
fn ComputeMain(
  @builtin(global_invocation_id) id : vec3<u32>
) {
  var src_pixel = textureLoad(tex_src, id.xy);
  if (src_pixel.z == 0.0) {
    src_pixel.z = 100.0;
  }
  textureStore(tex_dst, id.xy, src_pixel.zzzz);
}