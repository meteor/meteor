# Random


The `random` package provides several functions for generating random
numbers. It uses a cryptographically strong pseudorandom number generator when
possible, but falls back to a weaker random number generator when
cryptographically strong randomness is not available (on older browsers or on
servers that don't have enough entropy to seed the cryptographically strong
generator).

<ApiBox name="Random.id" />
<ApiBox name="Random.secret" />
<ApiBox name="Random.fraction" />
<ApiBox name="Random.choice" />
<ApiBox name="Random.hexString" />
