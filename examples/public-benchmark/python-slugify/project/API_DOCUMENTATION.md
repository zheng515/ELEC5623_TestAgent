## smart_truncate
Source: https://github.com/un33k/python-slugify/blob/f85f9488520148d5f6899b5639199882b605e30a/slugify/slugify.py#L34-L42

    """
    Truncate a string.
    :param string (str): string for modification
    :param max_length (int): output string length
    :param word_boundary (bool):
    :param save_order (bool): if True then word order of output string is like input string
    :param separator (str): separator between words
    :return:
    """

## slugify
Source: https://github.com/un33k/python-slugify/blob/f85f9488520148d5f6899b5639199882b605e30a/slugify/slugify.py#L90-L106

    """
    Make a slug from the given text.
    :param text (str): initial text
    :param entities (bool): converts html entities to unicode
    :param decimal (bool): converts html decimal to unicode
    :param hexadecimal (bool): converts html hexadecimal to unicode
    :param max_length (int): output string length
    :param word_boundary (bool): truncates to complete word even if length ends up shorter than max_length
    :param save_order (bool): if parameter is True and max_length > 0 return whole words in the initial order
    :param separator (str): separator between words
    :param stopwords (iterable): words to discount
    :param regex_pattern (str): regex pattern for disallowed characters
    :param lowercase (bool): activate case sensitivity by setting it to False
    :param replacements (iterable): list of replacement rules e.g. [['|', 'or'], ['%', 'percent']]
    :param allow_unicode (bool): allow unicode characters
    :return (str):
    """
