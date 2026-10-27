def discount(customer):
    return 10

def subtotal(count):
    if type(count) is not int:
        raise TypeError('count')
    if count < 0:
        raise ValueError('count')
    return count * 200
