import bpy

print("please work thank you")

# for obj in bpy.data.objects:
#   print(obj.name)

bpy.ops.export_scene.gltf(
  filepath="assets/models.glb",
  check_existing=False
)