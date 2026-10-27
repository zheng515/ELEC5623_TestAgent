from slugify import slugify

def test_contract():
    assert slugify('This is a test ---') == 'this-is-a-test'
    assert slugify('This is a Test', lowercase=False) == 'This-is-a-Test'
    assert slugify('one two three', separator='.') == 'one.two.three'
    assert slugify('one two three four', max_length=12, word_boundary=True, save_order=True) == 'one-two'
