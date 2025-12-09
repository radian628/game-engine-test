declare module "particles.wgsl" {
  const data: {
  "bindGroups": [
    [
      {
        "name": "params",
        "type": {
          "name": "Params",
          "attributes": null,
          "size": 80,
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
            }
          ],
          "align": 16,
          "startLine": 20,
          "endLine": 23,
          "inUse": true
        },
        "group": 0,
        "binding": 0,
        "attributes": [
          {
            "id": 95,
            "line": 25,
            "name": "group",
            "value": "0"
          },
          {
            "id": 96,
            "line": 25,
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