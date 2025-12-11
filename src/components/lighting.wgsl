struct LightingVertInput {
  @location(0) sample_pos: vec3f,
}

struct LightingFragInput {
  @builtin(position) vertex_position : vec4f,
  @location(0) tex_pos: vec2f,
}

struct LightingFragOutput {
  @location(0) color : vec4f,
}

@group(0) @binding(0) var tex_sampler : sampler;
@group(0) @binding(1) var tex_pos : texture_2d<f32>;
@group(0) @binding(2) var tex_normal : texture_2d<f32>;
@group(0) @binding(3) var tex_albedo : texture_2d<f32>;

struct Params {
  mvp: mat4x4f,
  inv_vp: mat4x4f,
  m: mat4x4f,
  light_pos: vec4f,
  light_color: vec3f,
  quadratic: f32,
  linear: f32,
  constant: f32,
  cutoff_radius: f32,
}

@group(1) @binding(0) var<uniform> params : Params;

@vertex
fn VSMain(input: LightingVertInput) -> LightingFragInput {
  var frag: LightingFragInput;
  var pos = params.mvp * vec4(input.sample_pos, 1.0);
  // var pos2 = params.vp * vec4(input.sample_pos, 1.0);
  frag.tex_pos = ((pos.xy ) / ((pos.w - 0.0) * 1.0)) * 0.5 + 0.5;
  frag.tex_pos.y = 1.0 - frag.tex_pos.y;
  frag.vertex_position = pos;
  return frag;
}

@fragment
fn FSMain(input: LightingFragInput) -> LightingFragOutput {
  var o: LightingFragOutput;
  // _ = tex_pos;
  // _ = tex_albedo;
  // _ = tex_normal;
  let uv = input.vertex_position.xy / vec2f(textureDimensions(tex_pos).xy);
  let ipos = vec2i(input.vertex_position.xy);

  let albedo = textureSample(tex_albedo, tex_sampler, uv);
  let pos = params.inv_vp * textureSample(tex_pos, tex_sampler, uv);
  let normal = textureSample(tex_normal, tex_sampler, uv);

  let vec_to_light = (params.m * vec4f(0.0,0.0, 0.0, 1.0)).xyz - pos.xyz;
  let dist_to_light = length(vec_to_light);
  let dir_to_light = vec4f(vec_to_light / dist_to_light, 0.0).xyz;

  let attenuation = 
    params.quadratic * dist_to_light * dist_to_light
    + params.linear * dist_to_light
    + params.constant;

  var brightness = 1.0 / attenuation + 0.3;

  brightness = brightness * min(
    1.0, 
    3.0 * (1.0 - dist_to_light / params.cutoff_radius)
  );

  var brightness_factor = brightness * max(dot(
    normal.xyz,
    dir_to_light
  ), 0.0);

  var dither_factor = (brightness_factor * 4.0);

  var modulate_color = select(
    (ceil(dither_factor) - 1.0) / 4.0,  
    ceil(dither_factor) / 4.0,
    dither256(fract(dither_factor), ipos),
  );

  o.color = (albedo * modulate_color);

  o.color = max(o.color, vec4f(0.0));

  o.color.a = 1.0;

  o.color = pow(o.color, vec4(1 / 2.2));

  // o.color = vec4f(dir_to_light.xyz * 0.5 + 0.5, 1.0);
  // o.color = vec4f(normal.xyz * 0.5 + 0.5, 1.0);
  // o.color = vec4f(max(dot(
  //  normal.xyz,
  //  dir_to_light
  // ), 0.0) * 1.0);
  
  // o.color.a = 1.0;

  // o.color = vec4(1.0, 0.0, 0.0, 1.0);

  return o;
} 

const DITHER256_THRESHOLDS = array<f32, 256>(
  0,
  128,
  32,
  160,
  8,
  136,
  40,
  168,
  2,
  130,
  34,
  162,
  10,
  138,
  42,
  170,
  192,
  64,
  224,
  96,
  200,
  72,
  232,
  104,
  194,
  66,
  226,
  98,
  202,
  74,
  234,
  106,
  48,
  176,
  16,
  144,
  56,
  184,
  24,
  152,
  50,
  178,
  18,
  146,
  58,
  186,
  26,
  154,
  240,
  112,
  208,
  80,
  248,
  120,
  216,
  88,
  242,
  114,
  210,
  82,
  250,
  122,
  218,
  90,
  12,
  140,
  44,
  172,
  4,
  132,
  36,
  164,
  14,
  142,
  46,
  174,
  6,
  134,
  38,
  166,
  204,
  76,
  236,
  108,
  196,
  68,
  228,
  100,
  206,
  78,
  238,
  110,
  198,
  70,
  230,
  102,
  60,
  188,
  28,
  156,
  52,
  180,
  20,
  148,
  62,
  190,
  30,
  158,
  54,
  182,
  22,
  150,
  252,
  124,
  220,
  92,
  244,
  116,
  212,
  84,
  254,
  126,
  222,
  94,
  246,
  118,
  214,
  86,
  3,
  131,
  35,
  163,
  11,
  139,
  43,
  171,
  1,
  129,
  33,
  161,
  9,
  137,
  41,
  169,
  195,
  67,
  227,
  99,
  203,
  75,
  235,
  107,
  193,
  65,
  225,
  97,
  201,
  73,
  233,
  105,
  51,
  179,
  19,
  147,
  59,
  187,
  27,
  155,
  49,
  177,
  17,
  145,
  57,
  185,
  25,
  153,
  243,
  115,
  211,
  83,
  251,
  123,
  219,
  91,
  241,
  113,
  209,
  81,
  249,
  121,
  217,
  89,
  15,
  143,
  47,
  175,
  7,
  135,
  39,
  167,
  13,
  141,
  45,
  173,
  5,
  133,
  37,
  165,
  207,
  79,
  239,
  111,
  199,
  71,
  231,
  103,
  205,
  77,
  237,
  109,
  197,
  69,
  229,
  101,
  63,
  191,
  31,
  159,
  55,
  183,
  23,
  151,
  61,
  189,
  29,
  157,
  53,
  181,
  21,
  149,
  255,
  127,
  223,
  95,
  247,
  119,
  215,
  87,
  253,
  125,
  221,
  93,
  245,
  117,
  213,
  85
);

fn dither256(factor: f32, coord: vec2i) -> bool {
  let x = coord.x % 16;
  let y = coord.y % 16;
  let threshold = DITHER256_THRESHOLDS[y * 16 + x] / 256.0;
  return factor > threshold ;
}