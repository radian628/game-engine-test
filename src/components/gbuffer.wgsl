struct GBufferVertInput {
  @location(0) pos: vec3f,
  @location(1) normal: vec3f,
  //  @location(2) uv: vec2f,
}

struct GBufferFragInput {
  @builtin(position) vertex_position:  vec4f, 
  @location(0) pos: vec4f,
  @location(1) normal: vec4f,
  @location(2) albedo: vec4f,
}

struct GBufferFragOutput {
  @location(0) pos: vec4f,
  @location(1) normal: vec4f,
  @location(2) albedo: vec4f,
}

struct Params {
  mvp: mat4x4f,
  m: mat4x4f,
  draw_color: vec4f
}

@group(0) @binding(0) var<uniform> params : Params;

@vertex
fn VSMain(input: GBufferVertInput) -> GBufferFragInput {
  var frag: GBufferFragInput;
  let clipspace = params.mvp * vec4f(input.pos, 1.0);
  frag.pos = params.m * vec4f(input.pos, 1.0);
  frag.vertex_position = clipspace;
  frag.normal = params.m * vec4f(input.normal, 0.0);
  frag.albedo = params.draw_color;
  return frag;
}

@fragment
fn FSMain(input: GBufferFragInput) -> GBufferFragOutput {
  var o: GBufferFragOutput;
  o.pos = input.pos;
  o.normal = input.normal;
  o.albedo = input.albedo;
  return o;
} 