import bpy

terrain_objects = []

for obj in bpy.data.objects:
  if obj.name.startswith("ground"):
    terrain_objects.append(obj)

combined_mesh = bpy.data.meshes.new(name="ground_combined_mesh")

combined_object = bpy.data.objects.new(name="ground_combined", object_data=combined_mesh)

terrain_objects.append(combined_object)

for obj in terrain_objects:
  with bpy.context.temp_override(
    active_object=obj
  ):
    bpy.ops.object.make_single_user() 
    for mod in obj.modifiers:
      bpy.ops.object.modifier_apply(modifier=mod.name)

with bpy.context.temp_override(active_object=combined_object, selected_editable_objects=terrain_objects):
  bpy.ops.object.join()

with bpy.context.temp_override(
  active_object=combined_object, 
  selected_editable_objects=[combined_object]
):
  bpy.ops.mesh.uv_texture_add()
  uv = bpy.context.object.data.uv_layers.active
  uv.name = "baked_lighting"
  bpy.ops.object.mode_set(mode="EDIT")
  bpy.ops.mesh.select_all()
  bpy.ops.uv.smart_project()

  mat = bpy.data.materials.new(name="baked_lighting_material")
  combined_object.data.materials.append(mat)
  combined_object.active_material_index = len(combined_object.data.materials) - 1
  # combined_object.data.materials
  bpy.ops.mesh.select_all()
  bpy.ops.object.material_slot_assign()
  print(combined_object.data.attributes)
  print(combined_object.data.uv_layers)
  # print("tikka masala")
  # print(combined_object.data.materials[6])
  # print("vertcount")
  # print(combined_mesh.vertices.__len__())
  

bpy.data.collections["Collection"].objects.link(combined_object)

bpy.ops.export_scene.gltf(
  filepath="src/models.glb",
  check_existing=False,
  export_apply=True,
  export_gn_mesh=True
)

