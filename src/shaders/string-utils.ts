export function delimitedSequenceRegex(start: string, end: string) {
  return new RegExp(
    RegExp.escape(start) + "[\\s\\S]*?" + RegExp.escape(end),
    "g"
  );
}

export function makeDelimitedReplacements(
  str: string,
  replacements: (
    | {
        start: string;
        end: string;
        replaceWith: string;
        delimiter?: undefined;
      }
    | {
        delimiter: string;
        replaceWith: string;
        start?: undefined;
        end?: undefined;
      }
  )[]
) {
  for (const r of replacements) {
    str = str.replaceAll(
      typeof r.delimiter === "string"
        ? delimitedSequenceRegex(r.delimiter, r.delimiter)
        : // @ts-expect-error
          delimitedSequenceRegex(r.start, r.end),
      r.replaceWith
    );
  }
  return str;
}
