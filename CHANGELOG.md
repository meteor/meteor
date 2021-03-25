v1.3 - 2021-03-25

* Add elliptic@6.5.4 as a direct dependency to force upgrade due to a security vulnerability. It was not possible to upgrade indirectly as [crypto-browserify]( https://www.npmjs.com/package/crypto-browserify) is not updated.
