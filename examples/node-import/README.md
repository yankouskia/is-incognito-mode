# Node import example

Demonstrates that the package imports cleanly in Node and emits the typed
`NOT_A_BROWSER` error at runtime, so applications doing SSR can branch on it
without string-matching messages.

```sh
pnpm install
node index.mjs
```

Expected output:

```
Got the expected typed error:
  name : IncognitoDetectionError
  code : NOT_A_BROWSER
  msg  : is-incognito-mode can only run in a browser-like environment.
```
