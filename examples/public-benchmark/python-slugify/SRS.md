# Document-derived scoped requirements

Upstream: https://github.com/un33k/python-slugify/tree/f85f9488520148d5f6899b5639199882b605e30a
Scope: slugify.slugify. This is a scoped module fixture, not the full upstream application.

R1: slugify.slugify converts text into a slug; with defaults, slugify('This is a test ---') returns the string 'this-is-a-test'.

R2: The lowercase option defaults to True; setting lowercase=False preserves case, so slugify('This is a Test', lowercase=False) returns 'This-is-a-Test'.

R3: The separator option sets the separator between words; slugify('one two three', separator='.') returns 'one.two.three'.

R4: With max_length=12, word_boundary=True and save_order=True, slugify('one two three four') returns 'one-two', retaining whole words in their initial order.
