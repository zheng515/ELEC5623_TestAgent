# Discount SRS

Amounts use integer cents where specified.

## Functional requirements

R1: For nonnegative built-in int count, discount.subtotal(count) returns an integer count multiplied by 200 cents. Negative built-in int counts raise ValueError; non-built-in-int counts, including bool, raise TypeError.

R2: discount.discount(customer) should offer an appropriate discount to loyal customers.

## Environment

Python 3.11, no network or external services.
