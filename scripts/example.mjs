import JSZip from 'jszip';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const zip=new JSZip();
for(const name of ['shipping.py','tests/test_shipping.py','SRS.md'])zip.file(name,await readFile('examples/shipping/'+name));
await mkdir('.evidence',{recursive:true});
await writeFile('.evidence/shipping.zip',await zip.generateAsync({type:'nodebuffer'}));
console.log('Project ZIP: .evidence/shipping.zip\nRequirements: examples/shipping/SRS.md');
