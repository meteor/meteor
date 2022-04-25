v1.2.1 - 2022-03-17

* Fix the missing dependencies.

v1.2.0 - 2022-03-11

* Adds support for [node: imports](https://nodejs.org/api/esm.html#node-imports).

v1.1.0 - 2021-07-19

* Updated dependencies to their latest versions
    - `assert@2.0.0`
    - `buffer@6.0.3`
    - `console-browserify@1.2.0`
    - `domain-browser@4.19.0`
    - `events@3.3.0`
    - `readable-stream@3.6.0`
    - `stream-browserify@3.0.0`
    - `stream-http@3.2.0`
    - `string_decoder@1.3.0`
    - `timers-browserify@2.0.12`
    - `util@0.12.4`
    - `vm-browserify@1.1.2`

v1.0.3 - 2021-03-25

* Add elliptic@6.5.4 as a direct dependency to force upgrade due to a security vulnerability. It was not possible to upgrade indirectly as [crypto-browserify]( https://www.npmjs.com/package/crypto-browserify) is not updated.
