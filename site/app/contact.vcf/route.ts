const VCARD = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:Fixie',
  'ORG:Fixie',
  'TEL;TYPE=CELL,VOICE:+16197711086',
  'NOTE:Call me when something breaks. I find the part and walk you through the fix.',
  'END:VCARD',
  '',
].join('\r\n');

export function GET() {
  return new Response(VCARD, {
    headers: {
      'content-type': 'text/vcard; charset=utf-8',
      'content-disposition': 'attachment; filename="Fixie.vcf"',
    },
  });
}
