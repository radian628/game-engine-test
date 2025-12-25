declare module "gbuffer.wgsl" {
  const data: {
  "bindGroups": [
    [
      {
        "name": "params",
        "type": {
          "name": "Params",
          "attributes": null,
          "size": 240,
          "members": [
            {
              "name": "mvp",
              "type": {
                "name": "mat4x4f",
                "attributes": null,
                "size": 64
              },
              "attributes": null,
              "offset": 0,
              "size": 64
            },
            {
              "name": "m",
              "type": {
                "name": "mat4x4f",
                "attributes": null,
                "size": 64
              },
              "attributes": null,
              "offset": 64,
              "size": 64
            },
            {
              "name": "m_inv",
              "type": {
                "name": "mat4x4f",
                "attributes": null,
                "size": 64
              },
              "attributes": null,
              "offset": 128,
              "size": 64
            },
            {
              "name": "draw_color",
              "type": {
                "name": "vec4f",
                "attributes": null,
                "size": 16
              },
              "attributes": null,
              "offset": 192,
              "size": 16
            },
            {
              "name": "camera_pos",
              "type": {
                "name": "vec3f",
                "attributes": null,
                "size": 12
              },
              "attributes": null,
              "offset": 208,
              "size": 12
            },
            {
              "name": "facing_alpha",
              "type": {
                "name": "f32",
                "attributes": null,
                "size": 4
              },
              "attributes": null,
              "offset": 220,
              "size": 4
            },
            {
              "name": "glancing_alpha",
              "type": {
                "name": "f32",
                "attributes": null,
                "size": 4
              },
              "attributes": null,
              "offset": 224,
              "size": 4
            }
          ],
          "align": 16,
          "startLine": 21,
          "endLine": 29,
          "inUse": true
        },
        "group": 0,
        "binding": 0,
        "attributes": [
          {
            "id": 619255,
            "line": 31,
            "name": "group",
            "value": "0"
          },
          {
            "id": 619256,
            "line": 31,
            "name": "binding",
            "value": "0"
          }
        ],
        "resourceType": 0,
        "access": "read"
      }
    ]
  ]
};
 export default data; 
}