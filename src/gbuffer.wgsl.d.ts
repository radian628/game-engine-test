declare module "gbuffer.wgsl" {
  const data: {
  "bindGroups": [
    [
      {
        "name": "params",
        "type": {
          "name": "Params",
          "attributes": null,
          "size": 64,
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
            }
          ],
          "align": 16,
          "startLine": 20,
          "endLine": 22,
          "inUse": true
        },
        "group": 0,
        "binding": 0,
        "attributes": [
          {
            "id": 317,
            "line": 24,
            "name": "group",
            "value": "0"
          },
          {
            "id": 318,
            "line": 24,
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