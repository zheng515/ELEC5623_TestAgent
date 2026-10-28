def refund(amount):
    if type(amount) is not int:
        raise TypeError('amount')
    if amount < 0:
        raise RuntimeError('negative amount')
    return amount
