from rates import free_shipping
def fee(amount):
    return 0 if free_shipping(amount) else 1000
