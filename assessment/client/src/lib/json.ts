export function parseFirstJson<T>(value: string, rootType?: 'array' | 'object'): T {
  for (let start = 0; start < value.length; start += 1) {
    const opening = value[start];
    if (opening !== '[' && opening !== '{') continue;
    if (rootType === 'array' && opening !== '[') continue;
    if (rootType === 'object' && opening !== '{') continue;

    const stack: string[] = [opening];
    let inString = false;
    let escaped = false;

    for (let end = start + 1; end < value.length; end += 1) {
      const char = value[end];

      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === '[' || char === '{') {
        stack.push(char);
      } else if (char === ']' || char === '}') {
        const expectedOpening = char === ']' ? '[' : '{';
        if (stack.at(-1) !== expectedOpening) break;
        stack.pop();

        if (stack.length === 0) {
          try {
            return JSON.parse(value.slice(start, end + 1)) as T;
          } catch {
            break;
          }
        }
      }
    }
  }

  throw new SyntaxError('응답에서 유효한 JSON을 찾을 수 없습니다.');
}
