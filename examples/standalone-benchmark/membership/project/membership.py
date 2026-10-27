def annual_fee(years):
    if type(years) is not int:
        raise TypeError('years')
    if years < 0:
        raise ValueError('years')
    return 0 if years > 5 else 12000
