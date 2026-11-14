export const seed={
  "run": "run1",
  "frame": "tool",
  "clock": "c1",
  "epoch": 1,
  "time": 10,
  "position": [
    1,
    2,
    3
  ]
};
export const seedPath="/pose";
export const routes=[
  {
    "path": "/observations",
    "body": {
      "items": [
        {
          "id": "o1",
          "run": "run1",
          "clock": "c1",
          "epoch": 1,
          "frame": "tool",
          "time": 10,
          "position": [
            1,
            2,
            3
          ]
        }
      ]
    },
    "method": "GET",
    "status": 200,
    "query": {},
    "headers": {}
  },
  {
    "path": "/transforms",
    "body": {
      "items": [
        {
          "parent": "base",
          "child": "tool",
          "publisher": "arm",
          "clock": "c1",
          "epoch": 1,
          "time": 9,
          "static": false,
          "translation": [
            0,
            0,
            1
          ],
          "rotation": [
            0,
            0,
            0,
            1
          ],
          "run": "run1"
        },
        {
          "parent": "world",
          "child": "base",
          "publisher": "cal",
          "static": true,
          "calibration": "cal1",
          "translation": [
            2,
            0,
            0
          ],
          "rotation": [
            0,
            0,
            0,
            1
          ],
          "run": "run1"
        }
      ]
    },
    "method": "GET",
    "status": 200,
    "query": {},
    "headers": {}
  },
  {
    "path": "/epochs",
    "body": {
      "clock": "c1",
      "epochs": [
        {
          "epoch": 1,
          "start": 0,
          "end": 20
        },
        {
          "epoch": 2,
          "start": 0,
          "end": null
        }
      ]
    },
    "method": "GET",
    "status": 200,
    "query": {},
    "headers": {}
  }
];
export const phases={
  "conflict": [
    {
      "path": "/transforms",
      "body": {
        "items": [
          {
            "parent": "base",
            "child": "tool",
            "publisher": "arm",
            "clock": "c1",
            "epoch": 1,
            "time": 9,
            "translation": [
              0,
              0,
              1
            ],
            "rotation": [
              0,
              0,
              0,
              1
            ],
            "run": "run1"
          },
          {
            "parent": "other",
            "child": "tool",
            "publisher": "camera",
            "clock": "c1",
            "epoch": 1,
            "time": 9,
            "translation": [
              0,
              0,
              0
            ],
            "rotation": [
              0,
              0,
              0,
              1
            ],
            "run": "run1"
          }
        ]
      },
      "method": "GET",
      "status": 200,
      "query": {},
      "headers": {}
    }
  ],
  "reset": [
    {
      "path": "/observations",
      "body": {
        "items": [
          {
            "id": "o2",
            "run": "run1",
            "clock": "c1",
            "epoch": 2,
            "frame": "tool",
            "time": 10,
            "position": [
              1,
              2,
              3
            ]
          }
        ]
      },
      "method": "GET",
      "status": 200,
      "query": {},
      "headers": {}
    }
  ]
};
export const portalKind="";
