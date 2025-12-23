declare module "lighting.wgsl" {
  const data: {
  "bindGroups": [
    [
      {
        "name": "tex_sampler",
        "type": {
          "name": "sampler",
          "attributes": [
            {
              "id": 4178,
              "line": 14,
              "name": "group",
              "value": "0"
            },
            {
              "id": 4179,
              "line": 14,
              "name": "binding",
              "value": "0"
            }
          ],
          "size": 0,
          "format": null,
          "access": null
        },
        "group": 0,
        "binding": 0,
        "attributes": [
          {
            "id": 4178,
            "line": 14,
            "name": "group",
            "value": "0"
          },
          {
            "id": 4179,
            "line": 14,
            "name": "binding",
            "value": "0"
          }
        ],
        "resourceType": 3,
        "access": ""
      },
      {
        "name": "tex_pos",
        "type": {
          "name": "texture_2d",
          "attributes": [
            {
              "id": 4182,
              "line": 15,
              "name": "group",
              "value": "0"
            },
            {
              "id": 4183,
              "line": 15,
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
            "id": 4182,
            "line": 15,
            "name": "group",
            "value": "0"
          },
          {
            "id": 4183,
            "line": 15,
            "name": "binding",
            "value": "1"
          }
        ],
        "resourceType": 2,
        "access": "read"
      },
      {
        "name": "tex_normal",
        "type": {
          "name": "texture_2d",
          "attributes": [
            {
              "id": 4187,
              "line": 16,
              "name": "group",
              "value": "0"
            },
            {
              "id": 4188,
              "line": 16,
              "name": "binding",
              "value": "2"
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
        "binding": 2,
        "attributes": [
          {
            "id": 4187,
            "line": 16,
            "name": "group",
            "value": "0"
          },
          {
            "id": 4188,
            "line": 16,
            "name": "binding",
            "value": "2"
          }
        ],
        "resourceType": 2,
        "access": "read"
      },
      {
        "name": "tex_albedo",
        "type": {
          "name": "texture_2d",
          "attributes": [
            {
              "id": 4192,
              "line": 17,
              "name": "group",
              "value": "0"
            },
            {
              "id": 4193,
              "line": 17,
              "name": "binding",
              "value": "3"
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
        "binding": 3,
        "attributes": [
          {
            "id": 4192,
            "line": 17,
            "name": "group",
            "value": "0"
          },
          {
            "id": 4193,
            "line": 17,
            "name": "binding",
            "value": "3"
          }
        ],
        "resourceType": 2,
        "access": "read"
      }
    ],
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
              "name": "inv_vp",
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
              "name": "m",
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
              "name": "light_pos",
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
              "name": "light_color",
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
              "name": "quadratic",
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
              "name": "linear",
              "type": {
                "name": "f32",
                "attributes": null,
                "size": 4
              },
              "attributes": null,
              "offset": 224,
              "size": 4
            },
            {
              "name": "constant",
              "type": {
                "name": "f32",
                "attributes": null,
                "size": 4
              },
              "attributes": null,
              "offset": 228,
              "size": 4
            },
            {
              "name": "cutoff_radius",
              "type": {
                "name": "f32",
                "attributes": null,
                "size": 4
              },
              "attributes": null,
              "offset": 232,
              "size": 4
            }
          ],
          "align": 16,
          "startLine": 19,
          "endLine": 29,
          "inUse": true
        },
        "group": 1,
        "binding": 0,
        "attributes": [
          {
            "id": 4216,
            "line": 31,
            "name": "group",
            "value": "1"
          },
          {
            "id": 4217,
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