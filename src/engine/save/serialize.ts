/** 对方块数组做 RLE 压缩：[count, id, count, id, ...]。 */
export function rleEncode(data: Uint8Array): Uint32Array {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    const value = data[i];
    let run = 1;
    while (i + run < data.length && data[i + run] === value && run < 0xffffffff) {
      run++;
    }
    out.push(run, value);
    i += run;
  }
  return Uint32Array.from(out);
}

/** RLE 解压到指定长度。 */
export function rleDecode(encoded: Uint32Array, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let pos = 0;
  for (let i = 0; i + 1 < encoded.length; i += 2) {
    const run = encoded[i];
    const value = encoded[i + 1];
    if (pos + run > length) {
      throw new Error(`rleDecode: data overflow at ${pos} + ${run} > ${length}`);
    }
    out.fill(value, pos, pos + run);
    pos += run;
  }
  if (pos !== length) {
    throw new Error(`rleDecode: decoded ${pos} bytes, expected ${length}`);
  }
  return out;
}

/** RLE 解压，长度由数据本身决定（各段长度之和）。 */
export function rleDecodeAuto(encoded: Uint32Array): Uint8Array {
  let length = 0;
  for (let i = 0; i + 1 < encoded.length; i += 2) {
    length += encoded[i];
  }
  return rleDecode(encoded, length);
}
