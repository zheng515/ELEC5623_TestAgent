# Retained live CI attempt

The initial live CI check stopped during mutation-pair review because the model
provider returned "Our servers are currently overloaded. Please try again later."
The gate correctly refused to pass without completed evidence. This is an external
request failure, not a successful run or proof of a classification error. Later
attempts are recorded separately; this evidence is not overwritten.
