def charge(units):
    if type(units) is not int:
        raise TypeError('units')
    if units < 0:
        raise ValueError('units')
    return False if units == 0 else units * 3
