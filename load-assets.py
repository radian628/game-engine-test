import bpy


# bpy.ops.export_scene.gltf(
#   filepath="src/models.glb",
#   check_existing=False,
#   export_apply=True,
#   export_gn_mesh=True
# )

bpy.ops.export_scene.gltf(
  filepath="./build/assets/models.glb",
  check_existing=False,
  export_apply=True,
  export_gn_mesh=True
)

