declare module "gbuffer-uv.wgsl" {
  const data: {
  "bindGroups": [
    [
      {
        "name": "params",
        "type": {
          "name": "Params",
          "attributes": null,
          "size": 128,
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
            "id": 620807,
            "line": 25,
            "name": "group",
            "value": "0"
          },
          {
            "id": 620808,
            "line": 25,
            "name": "binding",
            "value": "0"
          }
        ],
        "resourceType": 0,
        "access": "read"
      },
      {
        "name": "tex_albedo",
        "type": {
          "name": "texture_2d",
          "attributes": [
            {
              "id": 620810,
              "line": 26,
              "name": "group",
              "value": "0"
            },
            {
              "id": 620811,
              "line": 26,
              "name": "binding",
              "value": "1"
            }
          ],
          "size": 0,
          "format": {
            "name": "f32",
            "attributes": null,
            "size": 4
          },
          "access": null
        },
        "group": 0,
        "binding": 1,
        "attributes": [
          {
            "id": 620810,
            "line": 26,
            "name": "group",
            "value": "0"
          },
          {
            "id": 620811,
            "line": 26,
            "name": "binding",
            "value": "1"
          }
        ],
        "resourceType": 2,
        "access": "read"
      },
      {
        "name": "samp",
        "type": {
          "name": "sampler",
          "attributes": [
            {
              "id": 620815,
              "line": 27,
              "name": "group",
              "value": "0"
            },
            {
              "id": 620816,
              "line": 27,
              "name": "binding",
              "value": "2"
            }
          ],
          "size": 0,
          "format": null,
          "access": null
        },
        "group": 0,
        "binding": 2,
        "attributes": [
          {
            "id": 620815,
            "line": 27,
            "name": "group",
            "value": "0"
          },
          {
            "id": 620816,
            "line": 27,
            "name": "binding",
            "value": "2"
          }
        ],
        "resourceType": 3,
        "access": ""
      }
    ]
  ]
};
 export default data; 
}