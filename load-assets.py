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

objs_with_data = []

if False:
  for obj in terrain_objects:
    with bpy.context.temp_override(
      active_object=obj,
      selected_editable_objects=[]
    ):
      bpy.ops.object.make_single_user() 
      for mod in obj.modifiers:
        bpy.ops.object.modifier_apply(modifier=mod.name)
      
      mat = bpy.data.materials.new(name=obj.name + "-baked")
      tex = bpy.data.images.new(
        name=obj.name + "-baked-tex",
        width=1024,
        height=1024
      )
  
      bpy.ops.object.material_slot_add()
  
      obj.active_material = mat
  
      olduv = obj.data.uv_layers.active
  
      bpy.ops.mesh.uv_texture_add()
  
      newuv = obj.data.uv_layers.active
  
      bpy.ops.object.editmode_toggle()
      bpy.ops.mesh.select_all(action="SELECT")
      bpy.ops.uv.smart_project()
      bpy.ops.object.editmode_toggle()
  
      obj.data.uv_layers.active = olduv
  
      imgnode = mat.node_tree.nodes.new(
        type="ShaderNodeTexImage"
      )
      imgnode.image = tex 
      
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
  
      objs_with_data.append((obj, mat, tex, newuv))
  
      print(obj.name, [mat.name for mat in obj.material_slots])
  
  for (obj, mat, tex, uv) in objs_with_data:
    with bpy.context.temp_override(
      active_object=obj
    ):
      bpy.ops.object.bake(type="COMBINED", save_mode="EXTERNAL")
      bpy.ops.image.save_all_modified()
  
  # with bpy.context.temp_override(
  #   selected_editable_objects=terrain_objects
  # ):
  #   bpy.ops.object.bake(type="COMBINED", save_mode="EXTERNAL", use_selected_to_active=True)
  #   bpy.ops.image.save_all_modified()
  
  for (obj, mat, tex, uv) in objs_with_data:
    with bpy.context.temp_override(
      active_object=obj
    ):
  
      obj.data.uv_layers.active = uv
      obj.active_material = mat
      bpy.ops.object.editmode_toggle()
      
      bpy.ops.mesh.select_all()
      bpy.ops.object.material_slot_assign()
  
      bpy.ops.object.editmode_toggle()
  
  
      # bpy.data.materials["powersupply"].node_tree.nodes["Principled BSDF"].inputs[1].default_value


bpy.ops.export_scene.gltf(
  filepath="src/models.glb",
  check_existing=False,
  export_apply=True,
  export_gn_mesh=True
)

