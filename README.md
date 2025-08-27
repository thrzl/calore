# calore calore calore

service to calculate spotify (& now cover art archive!) album art color palettes and cache them using cloudflare workers and KV!

uses a modified version of colorthief ([cf-colorthief](https://github.com/thrzl/cf-colorthief)) under the hood. this modified version uses [@jsquash/jpeg](https://github.com/jamsinclair/jSquash/tree/main/packages/jpeg) under the hood instead of sharp so that it can support cloudflare workers.

## how to use

```
https://calore.thrzl.xyz?image=IMAGE_URL&count=COLOR_COUNT
```

- `image` should be a spotify album art/CAA url from `i.scdn.co` or `coverartarchive.org/release/`.

- `color` should be the number of desired colors, 1-10. defaults to 4. if you want a dominant color, i recommend using the default (4) and just taking the first color.

the response exists in this format:
```ts
{
    palette: [
        [
            number,
            number,
            number
        ],
        ...
    ]
}
```

the cache keys use the following structure:
```
{color count}:{image slug}
```

## example:
```json
> xhs "https://calore.thrzl.xyz/?image=https://i.scdn.co/image/ab67616d0000b273f8c7a1c275f8c00dd0b4eb6f"
HTTP/1.1 200 OK
Cache-Control: public, s-maxage 2592000
Content-Encoding: gzip
Content-Type: application/json
Transfer-Encoding: chunked

{
    "palette": [
        [
            200,
            195,
            192
        ],
        [
            67,
            58,
            59
        ],
        [
            93,
            91,
            98
        ],
        [
            114,
            94,
            102
        ]
    ]
}
```
