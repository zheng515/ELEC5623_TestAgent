def available(capacity, booked):
    if type(capacity) is not int or type(booked) is not int:
        raise TypeError('counts')
    if capacity < 0 or booked < 0 or booked > capacity:
        raise ValueError('counts')
    return capacity - booked
