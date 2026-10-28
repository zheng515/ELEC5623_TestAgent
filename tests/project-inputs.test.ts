import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { extractRequirements, loadRequirements, documentRules, originalRequirements } from "../lib/requirements";
import { prepareProject, copyPreparedProject } from "../lib/project-setup";
import { dataDir } from "../lib/auth";
import { importProject, inspectProject, measureProject } from "../lib/python-tools";

test("project directories isolate runtime inputs while retaining bounded dependency lockfiles", async () => {
  const root = await mkdtemp(join(tmpdir(), 'reqtest-directory-'));
  const zip = new JSZip();
  zip.file('repository/backend/service.py', 'def fee(): return 0\n');
  zip.file('repository/backend/__init__.py', '');
  zip.file('repository/backend/pyproject.toml', '[project]\nname="backend"\nversion="1"\ndependencies=["flask>=3"]');
  zip.file('repository/backend/uv.lock', '# retained lock metadata\n' + 'x'.repeat(210000));
  zip.file('repository/frontend/app.js', 'x'.repeat(250000));
  zip.file('repository/backend-other/unrelated.py', 'raise RuntimeError("outside selected directory")');
  const archive = await zip.generateAsync({ type: 'nodebuffer' });
  try {
    const snapshot = await importProject(root, archive, 'auto', 'backend/');
    assert.equal(snapshot.runtime, 'python');
    assert.deepEqual(Object.keys(snapshot.files).sort(), ['__init__.py', 'pyproject.toml', 'service.py', 'uv.lock']);
    assert.equal(snapshot.files['__init__.py'], '');
    assert.match(await readFile(join(root, 'source/pyproject.toml'), 'utf8'), /flask/);
    for (const path of ['../backend', '/backend', '/', 'backend/../frontend', 'backend\\service', '.hidden', 'backend//service']) await assert.rejects(importProject(root, archive, 'auto', path), /relative project directory/);
    await assert.rejects(importProject(root, archive, 'auto', 'missing'), /No source files/);
    await assert.rejects(importProject(root, archive, 'auto', 'frontend'), /source file exceeds 200 KB/);
    zip.file('repository/backend/uv.lock', 'x'.repeat(1000001));
    await assert.rejects(importProject(root, await zip.generateAsync({ type: 'nodebuffer' }), 'auto', 'backend'), /lockfile exceeds 1 MB/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("real PDF and Word extraction retains locations, original bytes and account boundaries", { skip: process.env.REQTEST_DOCKER_TEST !== "1", timeout: 90000 }, async () => {
  const user = randomUUID(), userHash = createHash("sha256").update(user).digest("hex");
  const script = [
    "import json, base64",
    "from io import BytesIO",
    "from pypdf import PdfWriter, PdfReader",
    "from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject",
    "from docx import Document",
    "from PIL import Image, ImageDraw, ImageFont",
    "from pathlib import Path",
    "from tempfile import TemporaryDirectory",
    "import subprocess",
    "writer=PdfWriter()",
    "page=writer.add_blank_page(width=612,height=792)",
    "font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})",
    "page[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):font})})",
    "stream=DecodedStreamObject();stream.set_data(b'BT /F1 12 Tf 40 740 Td (The fee at 10000 cents is zero.) Tj ET')",
    "page[NameObject('/Contents')]=writer._add_object(stream)",
    "writer.add_blank_page(width=612,height=792)",
    "pdf=BytesIO();writer.write(pdf)",
    "blank=PdfWriter();blank.add_blank_page(width=612,height=792);scan=BytesIO();blank.write(scan)",
    "doc=Document();doc.add_paragraph('Negative amounts raise ValueError.');table=doc.add_table(rows=1,cols=3);table.cell(0,0).text='FR-INPUT-01';table.cell(0,1).text='Boolean input';table.cell(0,2).text='raises TypeError.';word=BytesIO();doc.save(word)",
    "image=Image.new('RGB',(1800,600),'white');draw=ImageDraw.Draw(image);draw.text((70,150),'Shipping fee at 10000 cents is zero.',font=ImageFont.truetype('LiberationSans-Regular.ttf',48),fill='black');ocr=BytesIO();image.save(ocr,format='PDF',resolution=150)",
    "mixed_writer=PdfWriter();mixed_writer.add_page(writer.pages[0]);image_reader=PdfReader(BytesIO(ocr.getvalue()));mixed_writer.add_page(image_reader.pages[0]);mixed_writer.add_blank_page(width=612,height=792)",
    "hybrid=mixed_writer.add_page(image_reader.pages[0]);hybrid[NameObject('/Resources')][NameObject('/Font')]=DictionaryObject({NameObject('/F1'):font})",
    "contents=DecodedStreamObject();contents.set_data(hybrid.get_contents().get_data()+b' BT /F1 12 Tf 10 265 Td (Requirement header) Tj ET');hybrid[NameObject('/Contents')]=mixed_writer._add_object(contents)",
    "mixed=BytesIO();mixed_writer.write(mixed)",
    "locked_writer=PdfWriter();locked_writer.add_blank_page(width=612,height=792);locked_writer.encrypt('fixture-password');locked=BytesIO();locked_writer.write(locked)",
    "large_writer=PdfWriter();[large_writer.add_blank_page(width=612,height=792) for _ in range(101)];large=BytesIO();large_writer.write(large)",
    "with TemporaryDirectory() as directory:",
    "    root=Path(directory);doc.save(root/'requirements.docx')",
    "    subprocess.run(['libreoffice','-env:UserInstallation=file://'+directory+'/profile','--headless','--convert-to','doc:MS Word 97','--outdir',directory+'/converted',str(root/'requirements.docx')],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30)",
    "    legacy=BytesIO((root/'converted/requirements.doc').read_bytes())",
    "print(json.dumps({k:base64.b64encode(v.getvalue()).decode() for k,v in [('pdf',pdf),('scan',scan),('ocr',ocr),('docx',word),('doc',legacy),('mixed',mixed),('locked',locked),('large',large)]}))",
  ].join("\n");
  const files = JSON.parse(execFileSync("docker", ["run", "--rm", "--network", "none", "--entrypoint", "python", process.env.REQTEST_SANDBOX_IMAGE || "reqtest-python:1", "-c", script], { encoding: "utf8", timeout: 40000 }));
  const file = (name: string, value: string) => new File([new Uint8Array(Buffer.from(value, "base64"))], name);
  try {
    const pdf = await extractRequirements(user, file("requirements.pdf", files.pdf), new AbortController().signal);
    assert.equal(pdf.segments[0].page, 1); assert.match(pdf.segments[0].text, /10000/); assert.ok(pdf.warnings.some(warning => warning.includes("Page 2")));
    const rules = documentRules(pdf, [pdf.segments[0].id]); assert.equal(rules[0].source.page, 1); assert.equal(rules[0].source.sha256, pdf.sha256);
    assert.equal((await originalRequirements(user, pdf.id)).bytes.toString("base64"), files.pdf);
    await assert.rejects(() => loadRequirements("other-" + user, pdf.id));
    await assert.rejects(() => extractRequirements(user, file("scan.pdf", files.scan), new AbortController().signal), /No readable requirement text/);
    const scanned = await extractRequirements(user, file("image-only.pdf", files.ocr), new AbortController().signal);
    assert.match(scanned.segments[0].text, /10000/); assert.equal(scanned.segments[0].page, 1); assert.equal(scanned.segments[0].extraction, 'ocr');
    assert.ok(scanned.warnings.some(warning => warning.includes('OCR')));
    const mixed = await extractRequirements(user, file('mixed.pdf', files.mixed), new AbortController().signal);
    assert.equal(mixed.pages.length, 4); assert.equal(mixed.pages[0].status, 'text'); assert.equal(mixed.pages[2].status, 'unreadable');
    assert.ok(mixed.segments.some(segment => segment.page === 4 && segment.extraction === 'text' && segment.text.includes('Requirement header')));
    const supplement = mixed.segments.find(segment => segment.page === 4 && segment.extraction === 'ocr');
    assert.match(supplement?.text || '', /10000/);
    const [ocrRule] = documentRules(mixed, [supplement!.id]);
    assert.equal(ocrRule.source.page, 4); assert.equal(ocrRule.source.extraction, 'ocr'); assert.equal(ocrRule.source.confidence, supplement!.confidence);
    assert.equal((await originalRequirements(user, mixed.id)).bytes.toString('base64'), files.mixed);
    assert.equal((await loadRequirements(user, mixed.id)).pages[2].page, 3);
    const word = await extractRequirements(user, file("requirements.docx", files.docx), new AbortController().signal);
    assert.equal(word.segments[0].paragraph, 1); assert.match(word.segments[1].location, /table row 1/); assert.match(word.segments[1].text, /Boolean/);
    assert.equal(word.segments.length, 2); assert.equal(word.segments[1].text, 'FR-INPUT-01\nBoolean input\nraises TypeError.');
    assert.equal(documentRules(word, [word.segments[1].id])[0].source.location, 'Body block 2, table row 1');
    assert.throws(() => documentRules(pdf, ["invented"]), /Unknown/); assert.throws(() => documentRules(pdf, [pdf.segments[0].id, pdf.segments[0].id]), /unique/);
    const legacy = await extractRequirements(user, file("legacy.doc", files.doc), new AbortController().signal);
    assert.match(legacy.segments[0].text, /Negative amounts/); assert.equal(legacy.segments[0].paragraph, 1);
    assert.ok(legacy.warnings.some(warning => warning.includes('converted')));
    assert.equal((await originalRequirements(user, legacy.id)).bytes.toString('base64'), files.doc);
    assert.match(documentRules(legacy, [legacy.segments[0].id])[0].source.location, /Converted body block/);
    const folder = join(dataDir, 'documents', userHash), count = (await readdir(folder)).length;
    for (const [name, bytes, error] of [
      ['damaged.doc', Buffer.from('not a Word binary'), /supported Word binary.*DOCX/],
      ['damaged.docx', Buffer.from('not a ZIP'), /Cannot read this Word document/],
      ['damaged.pdf', Buffer.from('not a PDF'), /Cannot read this PDF/],
      ['locked.pdf', Buffer.from(files.locked, 'base64'), /Encrypted.*unlocked/],
      // 101 blank pages pass the former page limit and are all attempted.
      ['large.pdf', Buffer.from(files.large, 'base64'), /No readable requirement text/],
      ['invalid.txt', Buffer.from([255]), /UTF-8/],
    ] as const) await assert.rejects(extractRequirements(user, new File([new Uint8Array(bytes)], name), new AbortController().signal), error);
    assert.equal((await readdir(folder)).length, count, 'Failed uploads must not leave document directories behind');
    await writeFile(join(folder, pdf.id, 'original'), 'changed original');
    await assert.rejects(loadRequirements(user, pdf.id), /integrity check/);
    await assert.rejects(originalRequirements(user, pdf.id), /integrity check/);
  } finally { await rm(join(dataDir, "documents", userHash), { recursive: true, force: true }); }
});

test("preflight detects missing/versioned dependencies without importing project code and freezes its snapshot", { skip: process.env.REQTEST_DOCKER_TEST !== "1", timeout: 60000 }, async () => {
  const user = randomUUID(), destination = await mkdtemp(join(tmpdir(), "reqtest-preflight-"));
  const zip = new JSZip(); zip.file("backend/service.py", "raise RuntimeError('Project imports must not execute during setup checks')\n"); zip.file("backend/requirements.txt", "pytest>=99\nreqtest-nonexistent-package==1.0\n"); zip.file("backend/uv.lock", '# retained lock metadata\n' + 'x'.repeat(210000)); zip.file("frontend/app.js", "export const version = 1;");
  const form = new FormData(); form.set("project", new File([new Uint8Array(await zip.generateAsync({ type: "nodebuffer" }))], "project.zip"));
  form.set('projectDirectory', 'backend');
  try {
    const setup = await prepareProject(user, form, new AbortController().signal);
    assert.equal(setup.setup.status, "needs_setup"); assert.equal(setup.setup.checks.filter(item => item.status === "failed").length, 2);
    assert.match(setup.sandboxImage, /^sha256:/);
    assert.equal(setup.projectDirectory, 'backend'); assert.equal(setup.source, 'project.zip/backend');
    await copyPreparedProject(user, setup.id, destination); assert.match(await readFile(join(destination, "source/service.py"), "utf8"), /must not execute/);
    await mkdir(join(destination, 'generated'));
    const inspection = await inspectProject(destination, AbortSignal.timeout(30000), setup.sandboxImage);
    assert.equal(inspection.files['uv.lock'], undefined); assert.ok((await readFile(join(destination, 'source/uv.lock'))).length > 200000);
    assert.equal(inspection.files['frontend/app.js'], undefined);
    await assert.rejects(() => copyPreparedProject("other-" + user, setup.id, destination));
  } finally { await rm(destination, { recursive: true, force: true }); await rm(join(dataDir, "preflights", createHash("sha256").update(user).digest("hex")), { recursive: true, force: true }); }
});


test("run directories execute whole-project browser checks and keep failure screenshots", { skip: process.env.REQTEST_DOCKER_TEST !== "1", timeout: 180000 }, async () => {
  const user = randomUUID(), destination = await mkdtemp(join(tmpdir(), "reqtest-browser-"));
  const zip = new JSZip();
  zip.file("shop/web/index.html", '<!doctype html><title>Shop</title><button id="buy" disabled>Buy</button>');
  zip.file("shop/server/__init__.py", "");
  zip.file("shop/server/app.py", "from pathlib import Path\nPAGE = Path(__file__).resolve().parent.parent / 'web' / 'index.html'\n\n\ndef read_page():\n    return PAGE.read_text()\n\n\ndef application(environ, start_response):\n    start_response('200 OK', [('Content-Type', 'text/html')])\n    return [read_page().encode()]\n");
  zip.file("shop/server/requirements.txt", "-r base-requirements.txt\n");
  zip.file("shop/server/base-requirements.txt", "pytest>=8\n");
  zip.file("shop/server/tests/test_app.py", "from app import read_page\n\n\ndef test_page():\n    assert 'Buy' in read_page()\n");
  const form = new FormData(); form.set("project", new File([new Uint8Array(await zip.generateAsync({ type: "nodebuffer" }))], "shop.zip"));
  form.set("runDirectory", "server");
  try {
    const setup = await prepareProject(user, form, new AbortController().signal);
    assert.equal(setup.runDirectory, "server");
    assert.equal(setup.setup.checks.find(check => check.label === "pytest>=8")?.status, "passed", "Requirement includes resolve inside the run directory");
    await copyPreparedProject(user, setup.id, destination); await mkdir(join(destination, "generated"));
    const inspection = await inspectProject(destination, AbortSignal.timeout(60000), setup.sandboxImage);
    assert.deepEqual(inspection.nodes, ["server/tests/test_app.py::test_page"]);
    assert.match(inspection.files["web/index.html"], /id="buy"/);
    const browser = (name: string, state: string) => `from app import application\nfrom playwright.sync_api import expect\n\n\ndef ${name}(live_server, page):\n    page.goto(live_server(application))\n    expect(page.locator('#buy')).to_be_${state}()\n`;
    await writeFile(join(destination, "generated", "test_reqtest_T1.py"), browser("test_buy_starts_disabled", "disabled"));
    await writeFile(join(destination, "generated", "test_reqtest_T2.py"), browser("test_buy_starts_enabled", "enabled"));
    const measured = await measureProject(destination, inspection.nodes, true, AbortSignal.timeout(120000), setup.sandboxImage);
    const status = Object.fromEntries(measured.outcomes.map(outcome => [outcome.node, outcome.status]));
    assert.deepEqual(status, { "server/tests/test_app.py::test_page": "passed", "reqtest_generated/test_reqtest_T1.py::test_buy_starts_disabled": "passed", "reqtest_generated/test_reqtest_T2.py::test_buy_starts_enabled": "failed" });
    assert.equal(measured.integrity, true);
    const failed = measured.outcomes.find(outcome => outcome.status === "failed")!;
    assert.match(failed.screenshot || "", /^[a-f0-9]{64}\.jpg$/);
    assert.deepEqual([...(await readFile(join(destination, "screenshots", failed.screenshot!))).subarray(0, 2)], [0xff, 0xd8], "Failure screenshots are stored as JPEG files");
    assert.equal(measured.outcomes.filter(outcome => outcome.screenshot).length, 1, "Passing tests leave no screenshot");
    const missing = new FormData(); missing.set("project", form.get("project")!); missing.set("runDirectory", "client");
    await assert.rejects(prepareProject(user, missing, new AbortController().signal), /run directory contains no imported files/);
  } finally { await rm(destination, { recursive: true, force: true }); await rm(join(dataDir, "preflights", createHash("sha256").update(user).digest("hex")), { recursive: true, force: true }); }
});

test("document page budgets, conversion failures and OCR timeouts retain explicit outcomes", { skip: process.env.REQTEST_DOCKER_TEST !== "1", timeout: 30000 }, async () => {
  execFileSync('docker', ['run', '--rm', '-i', '--network', 'none', '--read-only', '--tmpfs', '/work:rw,size=32m,mode=1777', '--tmpfs', '/tmp:rw,size=32m,mode=1777', '--entrypoint', 'python', process.env.REQTEST_SANDBOX_IMAGE || 'reqtest-python:1', '-c', 'import sys;exec(sys.stdin.read())'], { input: await readFile('tests/fixtures/document-failures.py'), timeout: 25000, stdio: ['pipe', 'pipe', 'pipe'] });
});
