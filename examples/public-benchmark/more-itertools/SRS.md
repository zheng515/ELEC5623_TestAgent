# Document-derived scoped requirements

Upstream: https://github.com/more-itertools/more-itertools/tree/4998a257373f36e91edef7324572ed8df10f39d1
Scope: recipes.grouper and recipes.roundrobin. This is a scoped module fixture, not the full upstream application.

R1: recipes.grouper(iterable, n) groups items into tuples of length n; for positive n the default incomplete='fill' pads the final group with None.

R2: With incomplete='fill', recipes.grouper pads an incomplete final group with the supplied fillvalue.

R3: With incomplete='ignore', recipes.grouper does not emit an incomplete final group.

R4: With incomplete='strict', consuming recipes.grouper raises a ValueError subclass for an incomplete final group; complete groups remain valid.

R5: recipes.roundrobin yields one item from each iterable in turn, continuing with the remaining iterables when an input is exhausted.
