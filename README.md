## VRChatPinBoardServer

https://booth.pm/en/items/5950794


---

### GET /getNotes

Required Params

- pinboardID : `string`

**using example**

- GET /getNotes?pinboardId=7ab2c4d5e6f8g

---

### GET /addPinboard

Required Params

- pinboardId: `string` (14 characters, alphanumeric)
- hashKey: `string` (32 characters, alphanumeric)

**using example**

- GET /addPinboard?pinboardId=7ab2c4d5e6f8g&hashKey=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6


---

### GET /addNote

Required Params

- pinboardId: `string`
- localPosition: `string` (format: "x,y")
- angle: `string` (rotation degree)
- colorHue: `string` (0-1 float)
- content: `string` (note text)
- userHash: `string` (MD5 hash of username+hashKey)
- hash: `string` (MD5 hash of all parameters)

**using example**

- GET /addNote?pinboardId=7ab2c4d5e6f8g&localPosition=1,1&angle=45&colorHue=0.7&content=TestNote&userHash=abc123&hash=md5hash

### GET /deleteNote

Required Params

- pinboardId: `string`
- hashKey: `string`
- index: `string`

**using example**

- GET /deleteNote?pinboardId=7ab2c4d5e6f8g&hashKey=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6&index=42

