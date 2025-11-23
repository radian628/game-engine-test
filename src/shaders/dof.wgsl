struct DOFFragInput {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
}

@group(0) @binding(0) var tex_sampler : sampler;
@group(0) @binding(1) var tex_color : texture_2d<f32>;
@group(0) @binding(2) var tex_position : texture_2d<f32>;
@group(0) @binding(3) var tex_linear_sampler : sampler;

@vertex
fn VSMain(@builtin(vertex_index) vertexIndex: u32) -> DOFFragInput {
  var output: DOFFragInput;

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


fn get_individual_defocus_amount(dist: f32) -> f32 {
  return max(abs(dist - 10.0) / dist * 35.0 - 00.0, 0.01); 
}

fn get_defocus_amount(dists: vec2f) -> f32 {
  return max(
    get_individual_defocus_amount(dists.x),
    get_individual_defocus_amount(dists.y)
  );  
}

fn logistic(x: f32) -> f32 {
  return 1.0 / (1.0 + exp(-x)); 
}

fn blur(uv: vec2f, size: f32) -> vec4f {
  let dims = vec2f(textureDimensions(tex_color, 0));
  var accum = vec4f(0.0);
  let mip_level = log2(f32(size)) * 1.0;
  var factor = 0.0;
  for (var i = 0; i < i32(floor(size)) + 1; i += 1) {
    let offset = OFFSET_LUT[i];
    let uv2 = uv + offset.xy / dims * 1.0;
    let pos = textureSampleLevel(tex_position, tex_sampler, uv2, 0.0);
    let f = 
    select(
      0.0,
      clamp(size - offset.z, 0.0, 1.0),
      pos.y < 23 && pos.y > 17 
    );
    accum += textureSampleLevel(tex_color, tex_linear_sampler, uv2, 0.0) 
      * f;
    factor += f;
  }
  return accum / factor;
}

@fragment
fn FSMain(@location(0) uv:  vec2f) -> @location(0) vec4f {
  _ = tex_sampler;
  _ = tex_color;
  _ = tex_position;

  let dims = vec2f(textureDimensions(tex_color, 0));

  let pos = textureSampleLevel(tex_position, tex_linear_sampler, uv, 0.0);
  let center_color = textureSampleLevel(tex_color, tex_linear_sampler, uv, 0.0);

  var factor = 0.0;

  var accum = vec4f(0.0);

  for (var i = 0; i < 30; i += 1) {
    let offset = OFFSET_LUT[i];
    let uv2 = uv + offset.xy / dims * 1.0;
    let pos_mip_level = min(log2(offset.z), 2.0);
    let pos2 = textureSampleLevel(tex_position, tex_linear_sampler, uv2, pos_mip_level);

    let defocus = min(get_defocus_amount(pos2.xy), 30.0);

    let mip_level = min(log2(defocus), 2.0);
    let f = (offset.z + 1.0)
      * logistic(defocus - offset.z)
      * select(0.0, 1.0, pos.y >= pos2.y);
      // * logistic(pos.y - pos2.y);
    accum += textureSampleLevel(tex_color, tex_linear_sampler, uv2, mip_level) 
      * f;
    factor += f;
  }

  return vec4f(
    accum.rgb / factor,
    1.0
  );
}

/*
`array(
	${new Array(100).fill(0).map((e,i) => {
		const factor = i;
		const angle = factor * 2.399963;
		const x = factor * Math.cos(angle);
		const y = factor * Math.sin(angle);
		const dist = Math.hypot(x, y);
		return `vec3f(${x}, ${y}, ${dist})`
	}).join(",\n  ")}
)`
*/

const OFFSET_LUT = array(
	vec3f(0, 0, 0),
  vec3f(-0.7373687228988248, 0.6754904636562651, 1),
  vec3f(0.17485053403777584, -1.9923421620662212, 2),
  vec3f(1.8253182237516365, 2.3808009958919643, 3),
  vec3f(-3.938854581493409, -0.6967241820465114, 4),
  vec3f(4.218773391513887, -2.6836451089990305, 5),
  vec3f(-1.5576178427202265, 5.7942925932368645, 6),
  vec3f(-3.2263591627336985, -6.2121338164147994, 7),
  vec3f(7.5145754141516194, 2.7442952364911495, 8),
  vec3f(-8.319102905212844, 3.4340248765084995, 9),
  vec3f(4.238439143156467, -9.057352462489195, 10),
  vec3f(3.2921490319425093, 10.495797004109788, 11),
  vec3f(-10.382551104026392, -6.016862352778261, 12),
  vec3f(12.696776720811991, -2.791390496123163, 13),
  vec3f(-8.051775173168176, 11.452899919267285, 14),
  vec3f(-1.9277116073219824, -14.875615212790228, 15),
  vec3f(12.234421827485994, 10.311106756654898, 16),
  vec3f(-16.985480174838475, 0.702469380235959, 17),
  vec3f(12.758876954453681, -12.696891700771129, 18),
  vec3f(-0.8775546293360044, 18.979723334983863, 19),
  vec3f(-12.81425345190363, -15.355614884151525, 20),
  vec3f(20.81247117658233, 2.800186337358594, 21),
  vec3f(-18.058819909629094, 12.564991980561862, 22),
  vec3f(5.047952929355901, -22.43921057486219, 23),
  vec3f(11.932455809239883, 20.823460287870923, 24),
  vec3f(-23.81736306863295, -7.598237720479611, 25),
  vec3f(23.60250433789332, -10.905126729191508, 26),
  vec3f(-10.423494730711166, 24.906841582160443, 27),
  vec3f(-9.476833303072167, -26.347478637353184, 28),
  vec3f(25.670583567542433, 13.491521015134673, 29)
);