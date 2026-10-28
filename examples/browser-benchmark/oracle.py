from server import application
from playwright.sync_api import expect


def test_browser_contract(live_server, page):
    page.goto(live_server(application))
    field, button = page.locator('#name'), page.locator('#continue')
    expect(field).to_have_value('')
    expect(button).to_be_disabled()
    field.fill('abcd')
    expect(button).to_be_enabled()
    field.fill('abc')
    expect(button).to_be_enabled()
    field.fill('ab')
    expect(button).to_be_disabled()
    field.fill('')
    expect(button).to_be_disabled()
