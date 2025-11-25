@group(0) @binding(0)
var<storage, read_write> buf_position: array<vec3f>;

@group(0) @binding(1)
var<storage, read_write> buf_velocity: array<vec3f>;

@group(0) @binding(2)
var tex_force: texture_storage_3d<rgba8snorm, read>;

@compute @workgroup_size(64)
fn ComputeMain(
  @builtin(global_invocation_id) id3: vec3u
) {
  let i = id3.x;

  let gridOffset = vec3i(16, 16 , 16);

  let force_pos = (vec3i(floor(buf_position[i])) + gridOffset + vec3i(320, 320, 320)) % vec3i(32);

  var vel = buf_velocity[i];

  vel += textureLoad(tex_force, force_pos).xyz * 0.01;
  vel *= 0.99;
  buf_position[i] += vel;
  buf_velocity[i] = vel;
}