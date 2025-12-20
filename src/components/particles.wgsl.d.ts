declare module "particles.wgsl" {
  const data: {
  "bindGroups": [
    [
      {
        "name": "params",
        "type": {
          "name": "Params",
          "attributes": null,
          "size": 96,
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
              "name": "draw_color",
              "type": {
                "name": "vec4f",
                "attributes": null,
                "size": 16
              },
              "attributes": null,
              "offset": 64,
              "size": 16
            },
            {
              "name": "scale",
              "type": {
                "name": "vec2f",
                "attributes": null,
                "size": 8
              },
              "attributes": null,
              "offset": 80,
              "size": 8
            }
          ],
          "align": 16,
          "startLine": 20,
          "endLine": 24,
          "inUse": true
        },
        "group": 0,
        "binding": 0,
        "attributes": [
          {
            "id": 5816,
            "line": 26,
            "name": "group",
            "value": "0"
          },
          {
            "id": 5817,
            "line": 26,
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