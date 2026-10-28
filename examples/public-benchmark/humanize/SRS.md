# Document-derived scoped requirements

Upstream: https://github.com/python-humanize/humanize/tree/073a00b4cae648cb79e494eefb0389f5b038ffce
Scope: filesize.naturalsize. This is a scoped module fixture, not the full upstream application.

R1: filesize.naturalsize formats byte counts as strings using decimal suffixes by default; naturalsize(3000000) returns '3.0 MB'.

R2: With binary=True, filesize.naturalsize uses base 1024 and binary suffixes; naturalsize(3000, binary=True) returns '2.9 KiB'.

R3: With gnu=True, filesize.naturalsize uses base 1024 and GNU prefixes, ignoring binary; naturalsize(3000, gnu=True) returns '2.9K'.

R4: The format option controls numeric formatting; naturalsize(3000, gnu=True, format='%.3f') returns '2.930K'.

R5: Negative byte counts retain their sign; naturalsize(-4096, binary=True) returns '-4.0 KiB'.
