## ceil
Source: https://github.com/mahmoud/boltons/blob/992a58c1036fcf4d52cbf3313b6217b7c07b11d9/boltons/mathutils.py#L73-L87

    """Return the ceiling of *x*. If *options* is set, return the smallest
    integer or float from *options* that is greater than or equal to
    *x*.

    Args:
        x (int or float): Number to be tested.
        options (iterable): Optional iterable of arbitrary numbers
          (ints or floats).

    >>> VALID_CABLE_CSA = [1.5, 2.5, 4, 6, 10, 25, 35, 50]
    >>> ceil(3.5, options=VALID_CABLE_CSA)
    4
    >>> ceil(4, options=VALID_CABLE_CSA)
    4
    """

## floor
Source: https://github.com/mahmoud/boltons/blob/992a58c1036fcf4d52cbf3313b6217b7c07b11d9/boltons/mathutils.py#L98-L113

    """Return the floor of *x*. If *options* is set, return the largest
    integer or float from *options* that is less than or equal to
    *x*.

    Args:
        x (int or float): Number to be tested.
        options (iterable): Optional iterable of arbitrary numbers
          (ints or floats).

    >>> VALID_CABLE_CSA = [1.5, 2.5, 4, 6, 10, 25, 35, 50]
    >>> floor(3.5, options=VALID_CABLE_CSA)
    2.5
    >>> floor(2.5, options=VALID_CABLE_CSA)
    2.5

    """
