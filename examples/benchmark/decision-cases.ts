import type { Analysis, Measurement, PythonTest } from '../../lib/python-types';

export type DecisionCase = { id: string; kind: 'test_review' | 'diagnosis'; context: {
  rules: { id: string; text: string }[]; files: Record<string, string>; analysis: Analysis;
  tests: (PythonTest & { file: string })[]; failedTestIds?: string[]; phase?: string; measurement?: Measurement;
} };
const threshold = 'For integer amount >= 10000, fee(amount) returns integer 0.';
const shipping = 'def fee(amount):\n    return 0 if amount >= 10000 else 1000\n';
const shippingTest = 'from shipping import fee\ndef test_case():\n    assert fee(10000) == 0\n';
const windowRule = 'window(start, end) accepts two explicit ISO timestamps and returns datetimes preserving their respective instants.';
const windowSource = 'from datetime import datetime\ndef window(start, end):\n    return datetime.fromisoformat(start), datetime.fromisoformat(end)\n';
const windowTest = 'from datetime import datetime\nfrom calendar_window import window\ndef test_case():\n    start, end = window("2026-09-24T09:00:00+10:00", "2026-09-24T10:00:00+10:00")\n    assert start == datetime.fromisoformat("2026-09-24T09:00:00+10:00")\n    assert end == datetime.fromisoformat("2026-09-24T10:00:00+10:00")\n';
const identityTest = windowTest.replace('from datetime import datetime', 'from datetime import datetime\nfrom zoneinfo import ZoneInfo') + '    assert start.tzinfo == ZoneInfo("Australia/Sydney")\n';
function fixture(id: string, kind: DecisionCase['kind'], rule: string, file: string, source: string, code: string, message?: string): DecisionCase {
  const testFile = 'reqtest_generated/test_reqtest_T1.py';
  const test = { id: 'T1', behaviorId: 'B1', functionName: 'test_case', code, quote: rule, gapIndexes: [0], purpose: 'Check the stated behavior.', file: testFile };
  const context: DecisionCase['context'] = {
    rules: [{ id: 'R1', text: rule }], files: { [file]: source, ...(kind === 'diagnosis' ? { [testFile]: code } : {}) }, tests: [test],
    analysis: { behaviors: [{ id: 'B1', ruleId: 'R1', quote: rule, text: rule, category: 'rule', issue: 'none', reason: 'Assess the original contract.', files: [file], existingTests: [], evidence: [{ file, quote: source }], gaps: ['Check the stated behavior.'] }], inconsistencies: [] },
  };
  if (kind === 'diagnosis') Object.assign(context, { phase: 'execution', failedTestIds: ['T1'], measurement: { outcomes: [{ node: testFile + '::test_case', file: testFile, name: 'test_case', status: 'failed', message: message! }], log: message!, exitCode: 1, timedOut: false, integrity: true } });
  return { id, kind, context };
}

// Neutral IDs and model inputs contain no reference decisions or review flags.
export const decisionCases: DecisionCase[] = [
  fixture('C01', 'test_review', threshold, 'shipping.py', shipping, shippingTest),
  fixture('C02', 'test_review', threshold, 'shipping.py', shipping, shippingTest.replace('== 0', '== 1000')),
  fixture('C03', 'test_review', windowRule, 'calendar_window.py', windowSource, windowTest),
  fixture('C04', 'test_review', windowRule, 'calendar_window.py', windowSource, identityTest),
  fixture('C05', 'diagnosis', threshold, 'shipping.py', shipping, shippingTest.replace('== 0', '== 1'), 'AssertionError: assert 0 == 1'),
  fixture('C06', 'diagnosis', threshold, 'shipping.py', shipping.replace('>= 10000', '> 10000'), shippingTest, 'AssertionError: assert 1000 == 0'),
  fixture('C07', 'diagnosis', windowRule, 'calendar_window.py', windowSource, identityTest, "AssertionError: assert datetime.timezone(datetime.timedelta(seconds=36000)) == zoneinfo.ZoneInfo(key='Australia/Sydney')"),
  fixture('C08', 'diagnosis', 'The cancellation fee shall be reasonable.', 'shipping.py', 'def fee(amount):\n    return 1000\n', shippingTest, 'AssertionError: assert 1000 == 0'),
  fixture('C09', 'diagnosis', 'notify() returns integer 0 after delivery.', 'delivery.py', 'import delivery_transport\ndef notify():\n    return delivery_transport.send()\n', 'from delivery import notify\ndef test_case():\n    assert notify() == 0\n', "ModuleNotFoundError: No module named 'delivery_transport'"),
  fixture('C10', 'test_review', threshold, 'shipping.py', shipping, shippingTest.replace('assert fee(10000) == 0', 'actual = fee(10000)\n    assert isinstance(actual, int) and not isinstance(actual, bool)\n    assert actual == 0')),
  fixture('C11', 'test_review', windowRule, 'calendar_window.py', windowSource, windowTest.replace('    assert start ==', '    assert isinstance(start, datetime)\n    assert isinstance(end, datetime)\n    assert start ==')),
  fixture('C12', 'test_review', 'For a negative amount, fee(amount) raises ValueError.', 'shipping.py', 'def fee(amount):\n    if amount < 0: raise ValueError("invalid amount")\n    return 0\n', 'import pytest\nfrom shipping import fee\ndef test_case():\n    with pytest.raises(ValueError): fee(-1)\n'),
  fixture('C13', 'test_review', 'For a negative amount, fee(amount) raises ValueError.', 'shipping.py', 'def fee(amount):\n    if amount < 0: raise ValueError("invalid amount")\n    return 0\n', 'import pytest\nfrom shipping import fee\ndef test_case():\n    with pytest.raises(ValueError, match="Amount must be positive"): fee(-1)\n'),
  fixture('C14', 'diagnosis', threshold, 'shipping.py', shipping, shippingTest.replace('from shipping', 'from invented_shipping'), "ModuleNotFoundError: No module named 'invented_shipping'"),
  fixture('C15', 'diagnosis', 'For amount >= 10000, fee(amount) returns 0. For amount <= 10000, fee(amount) returns 1000.', 'shipping.py', 'def fee(amount):\n    return 1000 if amount <= 10000 else 0\n', shippingTest, 'AssertionError: assert 1000 == 0'),
  fixture('C16', 'test_review', 'For a large amount, fee(amount) returns zero.', 'shipping.py', shipping, shippingTest),
];
// An import failure occurs before the named generated test can register.
decisionCases[8].context.measurement!.outcomes[0].status = 'error';
decisionCases[8].context.measurement!.outcomes[0].name = '<module>';
decisionCases[8].context.measurement!.outcomes[0].node = 'reqtest_generated/test_reqtest_T1.py::<module>';
decisionCases[8].context.measurement!.exitCode = 2;
Object.assign(decisionCases[13].context.measurement!.outcomes[0], { status: 'error', name: '<module>', node: 'reqtest_generated/test_reqtest_T1.py::<module>' });
decisionCases[13].context.measurement!.exitCode = 2;
