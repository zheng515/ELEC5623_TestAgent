# Document-derived scoped requirements

Upstream: https://github.com/mahmoud/boltons/tree/992a58c1036fcf4d52cbf3313b6217b7c07b11d9
Scope: mathutils.ceil and mathutils.floor. This is a scoped module fixture, not the full upstream application.

R1: mathutils.ceil(x, options) returns the smallest number in options greater than or equal to x; ceil(4, options=[1.5,2.5,4,6]) returns 4.

R2: mathutils.floor(x, options) returns the largest number in options less than or equal to x; floor(2.5, options=[1.5,2.5,4,6]) returns 2.5.

R3: Without options, mathutils.ceil returns the mathematical ceiling of x and mathutils.floor returns its mathematical floor.
