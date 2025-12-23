import bpy

terrain_objects = []

# for mat in bpy.data.materials:
#   for node in mat.node_tree.nodes:
#     print(node.name)
#     print(node.bl_idname)
#     print([x for x in node.items()])
#     print(node.inputs.keys())
#     print(node.outputs.keys())

for obj in bpy.data.objects:
  if obj.name.startswith("ground"):
    terrain_objects.append(obj)
    print(obj.dimensions)

objs_with_data = []

def make_active(obj):
  print(obj.name + " is now active!")
  bpy.ops.object.select_all(action="DESELECT")
  obj.select_set(True)
  bpy.context.view_layer.objects.active = obj
  # bpy.context.selected_editable_objects = [obj]

for obj in terrain_objects:
  make_active(obj)

  with bpy.context.temp_override(
    active_object=obj,
    selected_editable_objects=[obj]
  ):
    print("made " + obj.name + " single user")
    bpy.ops.object.make_single_user(object=True, obdata=True, material=True, animation=True, obdata_animation=True) 

def calc_tex_dims(obj):
  approx_size = max(obj.dimensions.x, obj.dimensions.y, obj.dimensions.z)
  if (approx_size > 320):
    return 4096 
  if (approx_size > 160):
    return 2048 
  if (approx_size > 80):
    return 1024
  if (approx_size > 40):
    return 512
  if (approx_size > 20):
    return 256
  return 128
    
for obj in terrain_objects:
  make_active(obj)

  print("applying " + obj.name + " modifiers")
  for mod in obj.modifiers:
      bpy.ops.object.modifier_apply(modifier=mod.name)

  mat = bpy.data.materials.new(name=obj.name + "-baked")
  dims = calc_tex_dims(obj)
  tex = bpy.data.images.new(
    name=obj.name + "-baked-tex",
    width=dims,
    height=dims
  )

  for matslot in obj.material_slots:
    mat2 = matslot.material
    if not mat2: continue
    imgnode = mat2.node_tree.nodes.new(
      type="ShaderNodeTexImage"
    )
    imgnode.image = tex 

    for node in mat2.node_tree.nodes:
      node.select = False

    mat2.node_tree.nodes.active = imgnode
    imgnode.select = True

  oldmat = obj.active_material

  bpy.ops.object.material_slot_add()
  
  obj.active_material = mat
  
  olduv = obj.data.uv_layers.active
  
  bpy.ops.mesh.uv_texture_add()
  
  newuv = obj.data.uv_layers.active
  newuv.name = "Bake"
  
  bpy.ops.object.editmode_toggle()
  bpy.ops.mesh.select_all(action="SELECT")
  bpy.ops.uv.smart_project()
  bpy.ops.object.editmode_toggle()
  
  obj.data.uv_layers.active = olduv
  
  imgnode = mat.node_tree.nodes.new(
    type="ShaderNodeTexImage"
  )
  imgnode.image = tex 
  imgnode.select = True
    
  shadernode = mat.node_tree.nodes.new(
    type="ShaderNodeBsdfPrincipled"
  )
  mat.node_tree.links.new(
    imgnode.outputs["Color"],
    shadernode.inputs["Base Color"]
  )
  mat.node_tree.links.new(
    shadernode.outputs["BSDF"],
    mat.node_tree.get_output_node("ALL").inputs["Surface"]
  )
  
  mat.node_tree.nodes.active = imgnode
  
  objs_with_data.append((obj, mat, tex, newuv, imgnode))

  obj.active_material = oldmat
    
    # mat.node_tree.links.new(
    #   shadernode.outputs["BSDF"],
    #   mat.node_tree.get_output_node("ALL").inputs["Surface"]
    # )
     
  
  print(obj.name, [mat.name for mat in obj.material_slots])
  
for (obj, mat, tex, uv, texnode) in objs_with_data:
  make_active(obj)

  print("BAKING")
  print(obj.name)
  obj.active_material = mat
  mat.node_tree.nodes.active = texnode

  bpy.ops.object.bake(
    type="COMBINED", 
    save_mode="EXTERNAL", 
    use_selected_to_active=False,
    uv_layer="Bake"
  )
  bpy.ops.image.save_all_modified()
  
# with bpy.context.temp_override(
#   selected_editable_objects=terrain_objects
# ):
#   bpy.ops.object.bake(type="COMBINED", save_mode="EXTERNAL", use_selected_to_active=True)
#   bpy.ops.image.save_all_modified()
  
for (obj, mat, tex, uv, texnode) in objs_with_data:
  make_active(obj)
  
  # obj.data.uv_layers.active = uv
  print("UVMAP")
  obj.active_material = mat
  uv.active = False 
  uv.active_render = False 
  # uv.active = True
  # uv.active_render = True
  bpy.ops.object.editmode_toggle()
    
 
  bpy.ops.mesh.select_all(action="SELECT")
  bpy.ops.object.material_slot_assign()
  
  bpy.ops.object.editmode_toggle()
  
  
    # bpy.data.materials["powersupply"].node_tree.nodes["Principled BSDF"].inputs[1].default_value


bpy.ops.wm.save_as_mainfile(filepath="./assets-debug.blend")

bpy.ops.export_scene.gltf(
  filepath="src/models.glb",
  check_existing=False,
  export_apply=True,
  export_gn_mesh=True
)

bpy.ops.export_scene.gltf(
  filepath="./build/assets/models.glb",
  check_existing=False,
  export_apply=True,
  export_gn_mesh=True
)

