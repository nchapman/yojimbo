import Handlebars from 'handlebars';

export function compileTemplate(template: string) {
  return Handlebars.compile(trimIndent(template), {
    noEscape: true,
  });
}

export function trimIndent(text: string) {
  return text
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}
