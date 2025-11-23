@group(0) @binding(0)
var samp : sampler;
@group(0) @binding(1)
var tex_src : texture_2d<f32>;

/*PASTE_START*/
const KERNEL = array(
);

fn accumulate(acc: vec4f, curr: vec4f, k: vec4f) -> vec4f {
  return max(acc, curr); 
}

fn convert(acc: vec4f) -> vec4f {
  return acc;
}
/*PASTE_END*/

struct FragInput {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
}

@vertex
fn VSMain(@builtin(vertex_index) vertexIndex: u32) -> FragInput {
  var output: FragInput;

  output.position = vec4(array(
    vec2( 1.0,  1.0),
    vec2( 1.0, -1.0),
    vec2(-1.0, -1.0),
    vec2( 1.0,  1.0),
    vec2(-1.0, -1.0),
    vec2(-1.0,  1.0),
  )[vertexIndex], 0.5, 1.0);

  output.uv = array(
    vec2(1.0, 0.0),
    vec2(1.0, 1.0),
    vec2(0.0, 1.0),
    vec2(1.0, 0.0),
    vec2(0.0, 1.0),
    vec2(0.0, 0.0),
  )[vertexIndex];
  return output;
}

@fragment
fn FSMain(@location(0) uv : vec2f) -> /*OUT_LOCATION*/@location(0)/*OUT_LOCATION*/ /*OUT_TYPE*/vec4f/*OUT_TYPE*/ {
  /*BODY_START*/
  var acc = vec4(0.0);
  let dims = textureDimensions(tex_src, 0);
  for (var i = 0; i < 10; i++) {
    let smpl = KERNEL[i];
    let uv2 = uv + smpl.xy / dims;
    acc = accumulate(acc, uv2, smpl);
  }
  /*BODY_END*/
  return convert(acc);
}