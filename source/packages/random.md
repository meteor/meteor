---
title: random
order: 31
description: Documentation of Meteor's `random` package.
---

The `random` package provides several functions for generating random
numbers. It uses a cryptographically strong pseudorandom number generator when
possible, but falls back to a weaker random number generator when
cryptographically strong randomness is not available (on older browsers or on
servers that don't have enough entropy to seed the cryptographically strong
generator).

{% apibox "Random.id" %}
{% apibox "Random.secret" %}
{% apibox "Random.fraction" %}
{% apibox "Random.choice" %}
{% apibox "Random.hexString" %}
