def remaining(stock, requested):
    if type(stock) is not int or type(requested) is not int:
        raise TypeError("stock and requested must be integers")
    if stock < 0 or requested < 0 or requested >= stock:
        raise ValueError("invalid stock or request")
    return stock - requested
