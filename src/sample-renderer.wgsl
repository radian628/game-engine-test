struct VSInput {
  @builtin(vertex_index) vertexIndex: u32,
  @location(0) pos: vec3f, 
  @location(1) normal: vec3f, 
}

struct VSOutput {
  @builtin(position) position: vec4f,
  @location(2) color: vec4f,
  @location(3) normal: vec3f,
}

struct Params {
  mvp: mat4x4f,
}

@group(0) @binding(0) var<uniform> params : Params;

@vertex
fn VSMain(input: VSInput) -> VSOutput {
  var vsOut: VSOutput;

  var pos: vec4f = params.mvp * vec4f(input.pos, 1.0); 
  pos.z = pos.z + 0.0;
  vsOut.position = pos;

  vsOut.color = vec4f(input.pos * 0.5 + 0.5, 1.0);
  vsOut.normal = input.normal;

  return vsOut;
}

@fragment
fn FSMain(@location(2) color: vec4f, @location(3) normal: vec3f) -> @location(0) vec4f {

  var c: vec3f = color.xyz;

  c *= max(dot(normal, normalize(vec3f(1.0, 1.0, 1.0))), 0.0);

  return vec4f(c, color.w);
}